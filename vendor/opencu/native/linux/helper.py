import base64
import ctypes as C
import ctypes.util
import fcntl
import json
import os
import queue
import struct
import sys
import threading
import time
import uuid
import zlib
from accessibility_input import perform as accessibility_action, verify_window

# X11 owns physical desktop coordinates; AT-SPI supplies actual application objects.
class Failure(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class ChordAlreadyHeld(Failure):
    pass


def fail(code, message):
    raise Failure(code, message)


if os.environ.get('XDG_SESSION_TYPE') == 'wayland':
    fail('WAYLAND_PERMISSION_REQUIRED', 'Native control requires an X11 session; Wayland portal control is not configured')
if not os.environ.get('DISPLAY'):
    fail('DISPLAY_UNAVAILABLE', 'No interactive X11 display is available')
x = C.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
xt = C.CDLL(ctypes.util.find_library('Xtst') or 'libXtst.so.6')

def bind(lib, name, result, *args):
    fn = getattr(lib, name)
    fn.restype, fn.argtypes = result, args
    return fn


P, U, I, L = C.c_void_p, C.c_ulong, C.c_int, C.c_long
bind(x, 'XInitThreads', I)()
error_handler = C.CFUNCTYPE(I, P, P)(lambda _display, _event: 0)
bind(x, 'XSetErrorHandler', P, P)(C.cast(error_handler, P))
bind(x, 'XOpenDisplay', P, C.c_char_p)
bind(x, 'XDefaultRootWindow', U, P)
bind(x, 'XInternAtom', U, P, C.c_char_p, I)
bind(x, 'XGetWindowProperty', I, P, U, U, L, L, I, U, C.POINTER(U), C.POINTER(I), C.POINTER(U), C.POINTER(U), C.POINTER(P))
bind(x, 'XFree', I, P)
bind(x, 'XGetGeometry', I, P, U, C.POINTER(U), C.POINTER(I), C.POINTER(I), C.POINTER(C.c_uint), C.POINTER(C.c_uint), C.POINTER(C.c_uint), C.POINTER(C.c_uint))
bind(x, 'XTranslateCoordinates', I, P, U, U, I, I, C.POINTER(I), C.POINTER(I), C.POINTER(U))
bind(x, 'XRaiseWindow', I, P, U)
bind(x, 'XSetInputFocus', I, P, U, I, U)
bind(x, 'XGetInputFocus', I, P, C.POINTER(U), C.POINTER(I))
bind(x, 'XFlush', I, P)
bind(x, 'XStringToKeysym', U, C.c_char_p)
bind(x, 'XKeysymToKeycode', C.c_ubyte, P, U)
bind(x, 'XkbKeycodeToKeysym', U, P, C.c_ubyte, I, I)
bind(x, 'XQueryKeymap', I, P, C.c_char_p)
bind(x, 'XQueryPointer', I, P, U, C.POINTER(U), C.POINTER(U), C.POINTER(I), C.POINTER(I), C.POINTER(I), C.POINTER(I), C.POINTER(C.c_uint))
bind(x, 'XGetImage', P, P, U, I, I, C.c_uint, C.c_uint, U, I)
bind(x, 'XDestroyImage', I, P)
bind(x, 'XFreePixmap', I, P, U)
try:
    composite = C.CDLL(ctypes.util.find_library('Xcomposite') or 'libXcomposite.so.1')
    bind(composite, 'XCompositeNameWindowPixmap', U, P, U)
except OSError:
    composite = None
bind(x, 'XCloseDisplay', I, P)
bind(xt, 'XTestFakeKeyEvent', I, P, C.c_uint, I, U)
bind(xt, 'XTestFakeButtonEvent', I, P, C.c_uint, I, U)
bind(xt, 'XTestFakeMotionEvent', I, P, I, I, I, U)
display = x.XOpenDisplay(None)
if not display:
    fail('DISPLAY_UNAVAILABLE', 'X11 rejected the display connection')
root = x.XDefaultRootWindow(display)
try:
    import pyatspi
except ImportError:
    pyatspi = None

directory = os.path.abspath(sys.argv[sys.argv.index('--data-dir') + 1])
os.makedirs(directory, mode=0o700, exist_ok=True)
owner = open(os.path.join(directory, 'owner.lock'), 'a+')
fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
journal = os.path.join(directory, 'held-input.json')
keys, buttons, elements, mappings = set(), set(), {}, {}
input_lock, output_lock = threading.RLock(), threading.Lock()
commands = queue.Queue()
epoch, ended, closing = 0, False, False
from activity import Activity
activity = Activity()


def prop(window, name):
    kind, form, count, remaining, data = U(), I(), U(), U(), P()
    status = x.XGetWindowProperty(display, window, x.XInternAtom(display, name.encode(), 0), 0, 1048576, 0, 0, C.byref(kind), C.byref(form), C.byref(count), C.byref(remaining), C.byref(data))
    if status or not data:
        return None
    try:
        if form.value == 32:
            return list(C.cast(data, C.POINTER(U))[:count.value])
        return C.string_at(data, count.value).decode('utf-8', 'replace')
    finally:
        x.XFree(data)


def bounds(window):
    r, child, px, py, gx, gy = U(), U(), I(), I(), I(), I()
    width, height, border, depth = (C.c_uint() for _ in range(4))
    if not x.XGetGeometry(display, window, C.byref(r), C.byref(gx), C.byref(gy), C.byref(width), C.byref(height), C.byref(border), C.byref(depth)):
        fail('TARGET_NOT_FOUND', 'Window geometry is unavailable')
    if not x.XTranslateCoordinates(display, window, root, 0, 0, C.byref(px), C.byref(py), C.byref(child)):
        fail('TARGET_NOT_FOUND', 'Window position is unavailable')
    return dict(x=px.value, y=py.value, width=width.value, height=height.value)


def target(window):
    pid = (prop(window, '_NET_WM_PID') or [None])[0]
    if not pid:
        fail('TARGET_IDENTITY_UNAVAILABLE', 'Window has no process identity')
    with open('/proc/%d/stat' % pid) as stream:
        start = stream.read().rsplit(')', 1)[1].split()[19]
    executable = os.readlink('/proc/%d/exe' % pid)
    identity = dict(pid=pid, processStart=start, executable=executable, windowId=window)
    return dict(id='native:%d:window:%d' % (pid, window), kind='app', backend='native', platform='linux', targetType='window', pid=pid, windowId=window, bundleId=executable, name=os.path.basename(executable), title=prop(window, '_NET_WM_NAME') or prop(window, 'WM_NAME') or '', identity=identity, bounds=bounds(window), active=(prop(root, '_NET_ACTIVE_WINDOW') or [0])[0] == window)


def inventory():
    result = []
    for window in prop(root, '_NET_CLIENT_LIST') or []:
        try:
            result.append(target(window))
        except (OSError, Failure):
            pass  # Windows that exited during enumeration have no usable identity.
    return result


def resolve(reference):
    matches = [t for t in inventory() if all(str(t.get(k)) == str(reference[k]) for k in ('id', 'windowId', 'pid', 'bundleId') if k in reference)]
    if len(matches) != 1:
        fail('TARGET_NOT_FOUND', 'Reference must identify one live window')
    t = matches[0]
    if reference.get('identity') and reference['identity'] != t['identity']:
        fail('TARGET_IDENTITY_CHANGED', 'Process or window occurrence changed')
    return t


def foreground(t):
    if (prop(root, '_NET_ACTIVE_WINDOW') or [0])[0] != t['windowId']:
        fail('TARGET_NOT_ACTIVE', 'The selected window must be foreground')


def persist():
    with open(journal + '.tmp', 'w') as stream:
        json.dump(dict(keys=list(keys), buttons=list(buttons)), stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(journal + '.tmp', journal)


def held_key(key):
    state = C.create_string_buffer(32)
    x.XQueryKeymap(display, state)
    return bool(state.raw[key // 8] & (1 << (key % 8)))


def held_button(button):
    if button > 5:
        return False
    r, child, rx, ry, wx, wy, mask = U(), U(), I(), I(), I(), I(), C.c_uint()
    x.XQueryPointer(display, root, C.byref(r), C.byref(child), C.byref(rx), C.byref(ry), C.byref(wx), C.byref(wy), C.byref(mask))
    return bool(mask.value & (1 << (button + 7)))


def input_event(kind, code, down, expected=None):
    with input_lock:
        if down and (expected != epoch or ended):
            fail('CONTROL_STOPPED', 'Input was cancelled')
        held = keys if kind == 'key' else buttons
        inspect = held_key if kind == 'key' else held_button
        if not down and code not in held:
            return
        if down:
            if code in held:
                return
            if inspect(code):
                fail('INPUT_ALREADY_HELD', 'The user already holds this input')
            held.add(code)
            persist()
        fn = xt.XTestFakeKeyEvent if kind == 'key' else xt.XTestFakeButtonEvent
        if not fn(display, code, int(down), 0):
            fail('INPUT_REJECTED', 'XTest rejected input')
        x.XFlush(display)
        if not down:
            if inspect(code):
                fail('RELEASE_FAILED', 'Input remains held')
            held.discard(code)
            try:
                persist()
            except Exception:
                held.add(code)
                raise


def release():
    failures = []
    with input_lock:
        for kind, values in [('key', list(keys)), ('button', list(buttons))]:
            for code in values:
                try:
                    input_event(kind, code, False)
                except Exception as error:
                    failures.append(str(error))
        with output_lock:
            print(json.dumps(dict(event=dict(type='cursor', visible=False))), flush=True)
    return dict(released=not failures, failures=failures, heldKeys=list(keys), heldButtons=list(buttons))


class Image(C.Structure):
    _fields_ = [('width', I), ('height', I), ('xoffset', I), ('format', I), ('data', P), ('byte_order', I), ('bitmap_unit', I), ('bitmap_bit_order', I), ('bitmap_pad', I), ('depth', I), ('bytes_per_line', I), ('bits_per_pixel', I), ('red_mask', U), ('green_mask', U), ('blue_mask', U)]


def capture(t, preview=False):
    if composite is None:
        fail('BACKGROUND_CAPTURE_UNAVAILABLE', 'XComposite is required for unobscured per-window capture')
    b = t['bounds']
    capture_display = x.XOpenDisplay(None)
    if not capture_display:
        fail('CAPTURE_FAILED', 'X11 rejected the capture connection')
    pixmap = composite.XCompositeNameWindowPixmap(capture_display, t['windowId'])
    pointer = x.XGetImage(capture_display, pixmap, 0, 0, b['width'], b['height'], U(-1).value, 2) if pixmap else None
    if not pointer:
        if pixmap:
            x.XFreePixmap(capture_display, pixmap)
        x.XCloseDisplay(capture_display)
        fail('BACKGROUND_CAPTURE_UNAVAILABLE', 'The compositor did not provide this window pixmap; no screen fallback was used')
    try:
        image = C.cast(pointer, C.POINTER(Image)).contents
        if image.bits_per_pixel not in (24, 32):
            fail('CAPTURE_FORMAT', 'Unsupported X11 pixel format')
        raw = C.string_at(image.data, image.bytes_per_line * image.height)
        step = image.bits_per_pixel // 8
        shifts = [(mask & -mask).bit_length() - 1 for mask in (image.red_mask, image.green_mask, image.blue_mask)]
        pixels = bytearray()
        for row in range(image.height):
            pixels.append(0)
            for col in range(image.width):
                at = row * image.bytes_per_line + col * step
                value = int.from_bytes(raw[at:at + step], 'little' if image.byte_order == 0 else 'big')
                pixels.extend((value >> shift) & 255 for shift in shifts)
        def chunk(name, data):
            return struct.pack('!I', len(data)) + name + data + struct.pack('!I', zlib.crc32(name + data) & 0xffffffff)
        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', image.width, image.height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')
        if preview:
            return dict(dataUrl='data:image/png;base64,' + base64.b64encode(png).decode(), width=image.width, height=image.height, kind='native-frame', timestamp=int(time.time() * 1000))
        token = str(uuid.uuid4())
        path = os.path.join(directory, token + '.png')
        with open(path, 'wb') as stream:
            stream.write(png)
        os.chmod(path, 0o600)
        result = dict(path=path, mediaType='image/png', width=image.width, height=image.height, bounds=b, mappingId=token, scale=1, coordinateSpace='physical-screenshot-pixels')
        mappings[t['id']] = result
        return result
    finally:
        x.XDestroyImage(pointer)
        x.XFreePixmap(capture_display, pixmap)
        x.XCloseDisplay(capture_display)


def app_window(t):
    if pyatspi is None:
        fail('ACCESSIBILITY_UNAVAILABLE', 'Install python3-pyatspi to read and edit application accessibility objects')
    desktop = pyatspi.Registry.getDesktop(0)
    candidates = []
    for app in desktop:
        if app.get_process_id() != t['pid']:
            continue
        for child in app:
            try:
                r = child.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
                if child.name == t['title'] or (r.x == t['bounds']['x'] and r.y == t['bounds']['y']):
                    candidates.append(child)
            except NotImplementedError:
                continue
    if len(candidates) != 1:
        fail('ACCESSIBILITY_WINDOW_UNAVAILABLE', 'AT-SPI cannot identify the selected window uniquely')
    return candidates[0]


def tree(t, options):
    prefix = t['id'] + ':'
    for key in list(elements):
        if key.startswith(prefix):
            del elements[key]
    nodes, lines = [], []
    deadline = time.monotonic() + min(15, options.get('timeoutMs', 5000) / 1000)
    def visit(element, depth, parent=None):
        if len(nodes) >= min(3000, options.get('maxNodes', 1000)) or depth > min(80, options.get('maxDepth', 40)) or time.monotonic() > deadline:
            return
        key = prefix + str(uuid.uuid4())
        elements[key] = element
        node = dict(elementId=key, role=element.getRoleName(), name=element.name, parentId=parent)
        try:
            r = element.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
            node['bounds'] = dict(x=r.x, y=r.y, width=r.width, height=r.height)
        except NotImplementedError:
            pass
        if element.getRole() != pyatspi.ROLE_PASSWORD_TEXT:
            try:
                text = element.queryText()
                node['value'] = text.getText(0, min(text.characterCount, 8000))
            except NotImplementedError:
                pass
        nodes.append(node)
        lines.append('  ' * depth + '[' + key + '] ' + node['role'] + ' ' + node['name'] + ' ' + node.get('value', ''))
        for child in element:
            if child:
                visit(child, depth + 1, key)
    visit(app_window(t), 0)
    return dict(nodes=nodes, text='\n'.join(lines), truncated=time.monotonic() >= deadline or len(nodes) >= options.get('maxNodes', 1000))


def element(t, key):
    if not str(key).startswith(t['id'] + ':') or key not in elements:
        fail('STALE_ELEMENT', 'Observe the selected application again')
    value = elements[key]
    if value.getApplication().get_process_id() != t['pid']:
        fail('TARGET_IDENTITY_CHANGED', 'Element belongs to another process')
    return value


def point(t, action):
    if action.get('elementId') is not None:
        r = element(t, action['elementId']).queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
        if r.width <= 0 or r.height <= 0:
            fail('ELEMENT_NOT_VISIBLE', 'Element has no usable bounds')
        return r.x + r.width // 2, r.y + r.height // 2
    mapping = mappings.get(t['id'])
    if not mapping or action.get('mappingId', mapping['mappingId']) != mapping['mappingId'] or t['bounds'] != mapping['bounds']:
        fail('STALE_SCREENSHOT', 'Capture the current window before using coordinates')
    px, py = action.get('x', -1), action.get('y', -1)
    if not (0 <= px < mapping['width'] and 0 <= py < mapping['height']):
        fail('INVALID_COORDINATES', 'Point is outside the latest screenshot')
    return int(t['bounds']['x'] + px), int(t['bounds']['y'] + py)


def check(t, expected, require_foreground=True):
    if epoch != expected or ended:
        fail('CONTROL_STOPPED', 'Input was cancelled')
    resolve(t)
    if require_foreground:
        foreground(t)


class XkbState(C.Structure):
    _fields_ = [('group', C.c_ubyte), ('locked_group', C.c_ubyte), ('base_group', C.c_ushort), ('latched_group', C.c_ushort),
                ('mods', C.c_ubyte), ('base_mods', C.c_ubyte), ('latched_mods', C.c_ubyte), ('locked_mods', C.c_ubyte),
                ('compat_state', C.c_ubyte), ('grab_mods', C.c_ubyte), ('compat_grab_mods', C.c_ubyte),
                ('lookup_mods', C.c_ubyte), ('compat_lookup_mods', C.c_ubyte), ('ptr_buttons', C.c_ushort)]


bind(x, 'XkbGetState', I, P, C.c_uint, C.POINTER(XkbState))


def keycode(key):
    aliases = dict(Control='Control_L', Ctrl='Control_L', Meta='Super_L', Super='Super_L', Alt='Alt_L', Shift='Shift_L', Enter='Return', Esc='Escape', Space='space', ArrowLeft='Left', ArrowRight='Right', ArrowUp='Up', ArrowDown='Down', PageUp='Prior', PageDown='Next')
    code = x.XKeysymToKeycode(display, x.XStringToKeysym(("plus" if key == "+" else aliases.get(key, key)).encode()))
    if not code:
        fail('INVALID_KEY', 'The current keyboard layout has no key: ' + key)
    return code


def key_chord(value):
    names, token = [], ''
    for char in value:
        if char == '+' and token:
            names.append(token.strip())
            token = ''
        else:
            token += char
    names.append(token.strip())
    chord = []
    for name in names:
        code = keycode(name)
        if name == '+':
            state = XkbState()
            if x.XkbGetState(display, 0x0100, C.byref(state)):
                fail('INVALID_KEY', 'The current keyboard layout state is unavailable')
            if x.XkbKeycodeToKeysym(display, code, state.group, 0) != 43:
                if x.XkbKeycodeToKeysym(display, code, state.group, 1) != 43:
                    fail('INVALID_KEY', 'The current keyboard group has no unshifted or shifted plus key')
                shift = keycode('Shift')
                if shift not in chord:
                    chord.append(shift)
        if code not in chord:
            chord.append(code)
    return chord


def act(t, action, expected):
    check(t, expected, False)
    kind, mode = action['type'], action.get('inputMode', 'background')
    if mode not in ('background', 'foreground'):
        fail('INVALID_ACTION', 'inputMode must be background or foreground')
    if kind in ('set_value', 'ax_press') or mode == 'background' and kind in ('click', 'scroll', 'hit_test'):
        root = app_window(t)
        if action.get('elementId') is not None:
            selected = verify_window(element(t, action['elementId']), root, fail)
        elif kind == 'scroll' and 'x' not in action:
            selected = root
        else:
            px, py = point(t, action)
            selected = root.queryComponent().getAccessibleAtPoint(px, py, pyatspi.DESKTOP_COORDS)
            if selected is None:
                fail('ELEMENT_NOT_FOUND', 'No accessibility element at this point in the selected window')
            verify_window(selected, root, fail)
        if kind == 'hit_test':
            key = t['id'] + ':' + str(uuid.uuid4())
            elements[key] = selected
            return dict(element=dict(elementId=key, name=selected.name, role=selected.getRoleName()))
        return accessibility_action(root, selected, action, lambda: check(t, expected, False), fail)
    if kind != 'activate':
        if mode != 'foreground':
            fail('FOREGROUND_REQUIRED', 'XTest is global input; obtain user permission before focus and inputMode=foreground')
        foreground(t)
    def move(at):
        with input_lock:
            check(t, expected)
            if not xt.XTestFakeMotionEvent(display, -1, int(at[0]), int(at[1]), 0):
                fail('INPUT_REJECTED', 'XTest rejected pointer movement')
            x.XFlush(display)
            with output_lock:
                print(json.dumps(dict(event=dict(type='cursor', visible=True, targetId=t['id'], x=int(at[0]), y=int(at[1]), space='physical'))), flush=True)
    button = {'left': 1, 'middle': 2, 'right': 3}.get(action.get('button', 'left'), 1)
    if kind == 'activate':
        x.XRaiseWindow(display, t['windowId'])
        x.XSetInputFocus(display, t['windowId'], 1, 0)
        x.XFlush(display)
    elif kind == 'hit_test':
        px, py = point(t, action)
        hit = app_window(t).queryComponent().getAccessibleAtPoint(px, py, pyatspi.DESKTOP_COORDS)
        if not hit or hit.getApplication().get_process_id() != t['pid']:
            fail('TARGET_IDENTITY_CHANGED', 'Point does not belong to the selected application')
        key = t['id'] + ':' + str(uuid.uuid4())
        elements[key] = hit
        return dict(element=dict(elementId=key, name=hit.name, role=hit.getRoleName()))
    elif kind == 'set_value':
        if not element(t, action['elementId']).queryEditableText().setTextContents(str(action.get('value', action.get('text', '')))):
            fail('INPUT_REJECTED', 'Application rejected accessibility text input')
    elif kind == 'ax_press':
        a = element(t, action['elementId']).queryAction()
        if not a.nActions or not a.doAction(0):
            fail('ACTION_UNAVAILABLE', 'Element did not perform its action')
    elif kind == 'type_text':
        if pyatspi is None:
            fail('ACCESSIBILITY_UNAVAILABLE', 'Unicode typing requires python3-pyatspi')
        for char in action.get('text', ''):
            check(t, expected)
            if char in '\n\t':
                key = keycode('Return' if char == '\n' else 'Tab')
                input_event('key', key, True, expected)
                input_event('key', key, False)
            else:
                pyatspi.Registry.generateKeyboardEvent(0, char, pyatspi.KEY_STRING)
    elif kind in ('key_down', 'key_up'):
        input_event('key', keycode(action['key']), kind == 'key_down', expected)
    elif kind == 'press_key':
        chord = key_chord(action['key'])
        with input_lock:
            check(t, expected)
            if any(key in keys or held_key(key) for key in chord):
                raise ChordAlreadyHeld('INPUT_ALREADY_HELD', 'pressKey cannot reuse an already held key; no input was dispatched')
            acquired = []
            try:
                for key in chord:
                    check(t, expected)
                    try:
                        input_event('key', key, True, expected)
                    finally:
                        if key in keys:
                            acquired.append(key)
            finally:
                for key in reversed(acquired):
                    input_event('key', key, False)
    elif kind == 'scroll':
        if 'x' in action or 'elementId' in action:
            move(point(t, action))
        else:
            r, child, rx, ry, wx, wy, mask = U(), U(), I(), I(), I(), I(), C.c_uint()
            b = t['bounds']
            if not x.XQueryPointer(display, root, C.byref(r), C.byref(child), C.byref(rx), C.byref(ry), C.byref(wx), C.byref(wy), C.byref(mask)) or not (b['x'] <= rx.value < b['x'] + b['width'] and b['y'] <= ry.value < b['y'] + b['height']):
                fail('SCROLL_POINT_REQUIRED', 'Pointer is outside the selected window; specify a screenshot point or element')
        for axis, positive, negative in [('deltaY', 5, 4), ('deltaX', 7, 6)]:
            amount = action.get(axis, 0)
            for _ in range(min(100, int(abs(amount) / 100 + 0.99))):
                check(t, expected)
                code = positive if amount > 0 else negative
                input_event('button', code, True, expected)
                input_event('button', code, False)
    elif kind == 'mouse_up':
        input_event('button', button, False)
    elif kind == 'drag':
        samples = action.get('path')
        if samples is not None:
            if len(samples) < 2:
                fail('INVALID_ACTION', 'Drag requires at least two points')
            points = [point(t, dict(action, elementId=None, x=sample['x'], y=sample['y'])) for sample in samples]
        else:
            points = [point(t, dict(action, elementId=None, x=action['fromX'], y=action['fromY'])), point(t, action)]
        steps = max(1, 20 // (len(points) - 1))
        delay = .2 / ((len(points) - 1) * steps)
        move(points[0])
        input_event('button', button, True, expected)
        for first, last in zip(points, points[1:]):
            for step in range(1, steps + 1):
                move((first[0] + (last[0] - first[0]) * step / steps, first[1] + (last[1] - first[1]) * step / steps))
                time.sleep(delay)
        input_event('button', button, False)
    elif kind in ('move', 'click', 'double_click', 'right_click', 'mouse_down'):
        move(point(t, action))
        if kind != 'move':
            for _ in range(2 if kind == 'double_click' else 1):
                check(t, expected)
                input_event('button', 3 if kind == 'right_click' else button, True, expected)
                if kind != 'mouse_down':
                    input_event('button', 3 if kind == 'right_click' else button, False)
    else:
        fail('UNSUPPORTED_ACTION', kind)
    check(t, expected)
    return dict(performed=True, type=kind)


def perform(method, args, expected):
    global closing
    if method == 'hello':
        return dict(protocol=1, platform='linux')
    if method == 'permissions':
        return dict(sessionType='x11', accessibility=pyatspi is not None, screenCapture='per-window', postEvents='XTest', listenEvents=activity.available)
    if method == 'listTargets':
        return inventory()
    if method in ('release', 'close'):
        result = release()
        if method == 'close':
            if not result['released']:
                fail('RELEASE_FAILED', 'Held input could not be released')
            closing = True
        return result
    if method == 'stopPreview':
        return dict(released=True)
    if method == 'verify':
        try:
            t = resolve(args['target'])
            if args.get('options', {}).get('cold') and t['title'] != args['target']['title']:
                fail('TARGET_IDENTITY_CHANGED', 'Title changed during cold recovery')
            return dict(valid=True, target=t)
        except Exception as error:
            return dict(valid=False, reason=str(error))
    t = resolve(args['reference'] if method in ('select', 'focus') else args['target'])
    if method == 'select':
        activity.watch(t)
        return t
    if method == 'focus':
        x.XRaiseWindow(display, t['windowId'])
        x.XSetInputFocus(display, t['windowId'], 1, 0)
        x.XFlush(display)
        # Window managers update _NET_ACTIVE_WINDOW asynchronously after focus.
        deadline = time.monotonic() + 1
        while (prop(root, '_NET_ACTIVE_WINDOW') or [0])[0] != t['windowId'] and time.monotonic() < deadline:
            time.sleep(.01)
        foreground(t)
        activity.watch(t)
        return t
    if method == 'preview':
        return capture(t, True)
    if method == 'act':
        return act(t, args['action'], expected)
    if method == 'observe':
        options = args.get('options', {})
        activity.watch(t)
        result = dict(observationId=str(uuid.uuid4()), targetId=t['id'], identity=t['identity'], coordinateSpace='physical-screenshot-pixels', **activity.read(t))
        errors = []
        if options.get('format') != 'screenshot':
            try:
                result['ax'] = tree(t, options)
                result['text'] = result['ax']['text']
            except Exception as error:
                errors.append(dict(message=str(error)))
        if options.get('format') != 'ax':
            try:
                result['screenshot'] = capture(t)
            except Exception as error:
                errors.append(dict(message=str(error)))
        if 'ax' not in result and 'screenshot' not in result:
            fail('OBSERVATION_FAILED', json.dumps(errors))
        if errors:
            result.update(partial=True, errors=errors)
        return result
    fail('UNSUPPORTED_METHOD', method)


def reply(request):
    try:
        value = dict(id=request['id'], ok=True, result=perform(request['method'], request.get('params', {}), request['epoch']))
    except Exception as error:
        if isinstance(error, ChordAlreadyHeld):
            details = dict(inputDispatched=False, retryable=False)
        else:
            details = dict(release=release()) if request['method'] == 'act' else {}
        value = dict(id=request['id'], ok=False, error=dict(code=getattr(error, 'code', 'NATIVE_FAILURE'), message=str(error), details=details))
    with output_lock:
        print(json.dumps(value), flush=True)


def read_commands():
    global epoch, ended
    try:
        for line in sys.stdin:
            request = json.loads(line)
            if request['method'] in ('release', 'close'):
                epoch += 1
            request['epoch'] = epoch
            if request['method'] in ('preview', 'release', 'verify'):
                threading.Thread(target=reply, args=(request,), daemon=True).start()
            else:
                commands.put(request)
    finally:
        ended = True
        epoch += 1
        release()
        commands.put(None)


if os.path.exists(journal):
    with open(journal) as stream:
        saved = json.load(stream)
    keys.update(saved.get('keys', []))
    buttons.update(saved.get('buttons', []))
    if not release()['released']:
        fail('RELEASE_FAILED', 'Previous held input remains')
threading.Thread(target=read_commands, daemon=True).start()
try:
    while not closing:
        request = commands.get()
        if request is None:
            break
        reply(request)
finally:
    activity.close()
    if not release()['released']:
        sys.exit(2)
    # Process exit owns display teardown; monitor workers cannot hold shutdown open.
