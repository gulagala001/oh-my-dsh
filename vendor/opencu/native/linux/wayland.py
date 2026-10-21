import base64
import ctypes
import ctypes.util
import fcntl
import json
import math
import os
import queue
import sys
import threading
import time
import uuid
from accessibility_input import perform as accessibility_action, verify_window


class Failure(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class ChordAlreadyHeld(Failure):
    pass


def fail(code, message):
    raise Failure(code, message)


try:
    import gi
    gi.require_version('Gst', '1.0')
    from gi.repository import Gio, GLib, Gst
except (ImportError, ValueError) as error:
    print(json.dumps(dict(id=0, ok=False, error=dict(code='WAYLAND_DEPENDENCIES_MISSING', message='Wayland requires python3-gi, GStreamer introspection, gstreamer1.0-pipewire and PNG/video plugins: ' + str(error)))), flush=True)
    sys.exit(1)
try:
    import pyatspi
except ImportError:
    pyatspi = None

Gst.init(None)
directory = os.path.abspath(sys.argv[sys.argv.index('--data-dir') + 1])
os.makedirs(directory, mode=0o700, exist_ok=True)
owner = open(os.path.join(directory, 'owner.lock'), 'a+')
fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
loop = GLib.MainLoop()
threading.Thread(target=loop.run, daemon=True).start()
REMOTE = 'org.freedesktop.portal.RemoteDesktop'
SCREEN = 'org.freedesktop.portal.ScreenCast'
DEST = 'org.freedesktop.portal.Desktop'
PATH = '/org/freedesktop/portal/desktop'
input_lock, state_lock, output_lock = threading.RLock(), threading.RLock(), threading.Lock()
frames = threading.Condition()
commands = queue.Queue()
state = dict(session=None, devices=0, stream=None, pipeline=None, fd=None, frame=None, error=None)
requests, elements, mappings, windows = set(), {}, {}, {}
keys, buttons = set(), set()
epoch, ended, closing = 0, False, False
journal = os.path.join(directory, 'wayland-input.json')
keymap = ctypes.CDLL(ctypes.util.find_library('xkbcommon') or 'libxkbcommon.so.0')
keymap.xkb_keysym_from_name.argtypes = [ctypes.c_char_p, ctypes.c_int]
keymap.xkb_keysym_from_name.restype = ctypes.c_uint32


def call(interface, method, signature, values, path=PATH):
    return bus.call_sync(DEST, path, interface, method, GLib.Variant(signature, values), None, Gio.DBusCallFlags.NONE, 5000, None)


def portal_request(interface, method, signature, values, expected):
    if ended or expected != epoch:
        fail('PORTAL_CANCELLED', 'Desktop sharing was cancelled before the request')
    token = 'opencu_' + uuid.uuid4().hex
    handle = PATH + '/request/' + bus.get_unique_name()[1:].replace('.', '_') + '/' + token
    options = dict(values[-1], handle_token=GLib.Variant('s', token))
    completed, result = threading.Event(), {}
    def response(_connection, _sender, _path, _interface, _signal, params):
        status, data = params.unpack()
        result.update(status=status, data=data)
        completed.set()
    subscription = bus.signal_subscribe(DEST, 'org.freedesktop.portal.Request', 'Response', handle, None, Gio.DBusSignalFlags.NONE, response)
    with state_lock:
        requests.add(handle)
    try:
        actual = call(interface, method, signature, (*values[:-1], options)).unpack()[0]
        if actual != handle:
            call('org.freedesktop.portal.Request', 'Close', '()', (), actual)
            fail('PORTAL_PROTOCOL', 'Portal returned a different request identity')
        deadline = time.monotonic() + 110
        while not completed.wait(.05):
            if ended or expected != epoch or time.monotonic() > deadline:
                call('org.freedesktop.portal.Request', 'Close', '()', (), handle)
                fail('PORTAL_CANCELLED', 'Desktop sharing request was cancelled or timed out')
        if result['status'] != 0:
            fail('PERMISSION_DENIED', 'The system desktop-sharing permission was not granted')
        return result['data']
    finally:
        with state_lock:
            requests.discard(handle)
        bus.signal_unsubscribe(subscription)


def persist():
    with open(journal + '.tmp', 'w') as stream:
        json.dump(dict(session=state['session'], keys=list(keys), buttons=list(buttons)), stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(journal + '.tmp', 0o600)
    os.replace(journal + '.tmp', journal)


def closed_session(_connection, _sender, path, _interface, _signal, _params):
    with input_lock:
        if state['session'] != path:
            return
        state.update(session=None, devices=0, stream=None, frame=None, error='Desktop-sharing permission was revoked')
        keys.clear()
        buttons.clear()
        mappings.clear()
        try:
            persist()
        finally:
            try:
                stop_capture()
            finally:
                with frames:
                    frames.notify_all()
                with output_lock:
                    print(json.dumps(dict(event=dict(type='cursor', visible=False))), flush=True)


subscription = bus.signal_subscribe(DEST, 'org.freedesktop.portal.Session', 'Closed', None, None, Gio.DBusSignalFlags.NONE, closed_session)


def stop_capture():
    with input_lock:
        pipeline, fd = state['pipeline'], state['fd']
        state['frame'] = None
        try:
            if pipeline is not None:
                if pipeline.set_state(Gst.State.NULL) == Gst.StateChangeReturn.FAILURE:
                    fail('CAPTURE_STOP_FAILED', 'PipeWire capture could not stop')
                state['pipeline'] = None
        finally:
            if fd is not None:
                os.close(fd)
                state['fd'] = None


def close_session():
    with input_lock:
        try:
            session = state['session']
            if session:
                call('org.freedesktop.portal.Session', 'Close', '()', (), session)
                state.update(session=None, devices=0, stream=None)
            keys.clear()
            buttons.clear()
            mappings.clear()
            persist()
        finally:
            stop_capture()


def authorize(expected):
    close_session()
    created = portal_request(REMOTE, 'CreateSession', '(a{sv})', ({'session_handle_token': GLib.Variant('s', 'opencu_' + uuid.uuid4().hex)},), expected)
    session = created['session_handle']
    with input_lock:
        state['session'] = session
    def ensure_session():
        if ended or expected != epoch:
            fail('CONTROL_STOPPED', 'Desktop sharing was cancelled')
        if state['session'] != session:
            fail('TARGET_IDENTITY_CHANGED', 'Desktop-sharing permission ended during setup')
    try:
        portal_request(REMOTE, 'SelectDevices', '(oa{sv})', (session, {'types': GLib.Variant('u', 3)}), expected)
        portal_request(SCREEN, 'SelectSources', '(oa{sv})', (session, {'types': GLib.Variant('u', 1), 'multiple': GLib.Variant('b', False)}), expected)
        granted = portal_request(REMOTE, 'Start', '(osa{sv})', (session, '', {}), expected)
        with input_lock:
            ensure_session()
        streams = granted.get('streams', [])
        if len(streams) != 1:
            fail('PORTAL_STREAM_UNAVAILABLE', 'Select one monitor in the system sharing dialog')
        node, properties = streams[0]
        size = properties.get('logical_size', properties.get('size'))
        if not size or len(size) != 2 or min(size) <= 0:
            fail('PORTAL_COORDINATES_UNAVAILABLE', 'Portal did not provide the shared monitor logical size')
        with input_lock:
            ensure_session()
            state.update(devices=granted.get('devices', 0), stream=dict(node=node, properties=properties, size=size, position=properties.get('position')), error=None)
        reply, descriptors = bus.call_with_unix_fd_list_sync(DEST, PATH, SCREEN, 'OpenPipeWireRemote', GLib.Variant('(oa{sv})', (session, {})), GLib.VariantType.new('(h)'), Gio.DBusCallFlags.NONE, 5000, None, None)
        fd = descriptors.get(reply.unpack()[0])
        with input_lock:
            try:
                ensure_session()
            except Exception:
                os.close(fd)
                raise
            state['fd'] = fd
            pipeline = Gst.parse_launch('pipewiresrc name=source do-timestamp=true ! queue max-size-buffers=1 leaky=downstream ! videoconvert ! video/x-raw,format=RGB ! pngenc snapshot=false ! appsink name=frames emit-signals=true max-buffers=1 drop=true sync=false')
            state['pipeline'] = pipeline
            source = pipeline.get_by_name('source')
            source.set_property('fd', fd)
            if properties.get('pipewire-serial') is not None and source.find_property('target-object'):
                source.set_property('target-object', str(properties['pipewire-serial']))
            else:
                source.set_property('path', str(node))
            if source.find_property('always-copy'):
                source.set_property('always-copy', True)
            if source.find_property('keepalive-time'):
                source.set_property('keepalive-time', 1000)
            if source.find_property('on-disconnect'):
                source.set_property('on-disconnect', 2)
            def sample(sink):
                sample = sink.emit('pull-sample')
                if sample is None:
                    return Gst.FlowReturn.EOS
                buffer = sample.get_buffer()
                info = sample.get_caps().get_structure(0)
                frame = dict(png=bytes(buffer.extract_dup(0, buffer.get_size())), width=info.get_value('width'), height=info.get_value('height'), time=time.monotonic())
                with frames:
                    if state['session'] == session:
                        state['frame'] = frame
                        frames.notify_all()
                return Gst.FlowReturn.OK
            pipeline.get_by_name('frames').connect('new-sample', sample)
            if pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
                fail('CAPTURE_FAILED', 'PipeWire stream could not start')
            ensure_session()
            persist()
            return dict(granted=True, permissions=permissions())
    except Exception:
        close_session()
        raise


def permissions():
    return dict(sessionType='wayland', accessibility=pyatspi is not None, screenCapture=bool(state['session']), postEvents=state['devices'] & 3 == 3, listenEvents=False, permissionAction='remoteDesktop', dependency='xdg-desktop-portal RemoteDesktop + ScreenCast, PipeWire, python3-gi, GStreamer, libxkbcommon', reason=state['error'])


def desktop_target():
    if not state['session'] or not state['stream']:
        fail('WAYLAND_PERMISSION_REQUIRED', 'Authorize desktop sharing from Computer and browsers settings first')
    stream = state['stream']
    width, height = stream['size']
    identity = dict(portalSession=state['session'], nodeId=stream['node'], streamSerial=stream['properties'].get('pipewire-serial'))
    return dict(id='native:wayland:' + state['session'].rsplit('/', 1)[-1], kind='desktop', backend='native', platform='linux', targetType='desktop', title='Wayland shared monitor', name='Wayland shared monitor', identity=identity, bounds=dict(x=0, y=0, width=width, height=height))


def inventory():
    if not state['session'] or not state['stream']:
        return []
    result = [desktop_target()]
    current = {}
    if pyatspi is not None and state['stream']['position'] is not None:
        for app in pyatspi.Registry.getDesktop(0):
            try:
                pid = app.get_process_id()
                with open('/proc/%d/stat' % pid) as stream:
                    start = stream.read().rsplit(')', 1)[1].split()[19]
                executable = os.readlink('/proc/%d/exe' % pid)
                for child in app:
                    if not child.getState().contains(pyatspi.STATE_SHOWING):
                        continue
                    path = getattr(child, 'path', None)
                    if not path:
                        continue
                    r = child.queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
                    if r.width <= 0 or r.height <= 0:
                        continue
                    identity = dict(result[0]['identity'], pid=pid, processStart=start, accessiblePath=path, executable=executable)
                    key = result[0]['id'] + ':%d:%s' % (pid, path)
                    value = dict(id=key, kind='app', backend='native', platform='linux', targetType='window', pid=pid, windowId=path, bundleId=executable, name=app.name, title=child.name, identity=identity, bounds=dict(x=r.x, y=r.y, width=r.width, height=r.height))
                    result.append(value)
                    current[key] = child
            except (OSError, NotImplementedError, RuntimeError):
                continue
    with state_lock:
        windows.clear()
        windows.update(current)
    return result


def resolve(reference):
    matches = [value for value in inventory() if all(str(value.get(key)) == str(reference[key]) for key in ('id', 'pid', 'windowId', 'bundleId') if key in reference)]
    if len(matches) != 1:
        fail('TARGET_NOT_FOUND', 'Reference must identify one live authorized target')
    target = matches[0]
    if reference.get('identity') and reference['identity'] != target['identity']:
        fail('TARGET_IDENTITY_CHANGED', 'Desktop-sharing session or application occurrence changed')
    return target


def check(target, expected=None, require_foreground=True):
    if ended or expected is not None and epoch != expected:
        fail('CONTROL_STOPPED', 'Input was cancelled')
    if not state['session'] or state['session'] != target['identity']['portalSession']:
        fail('TARGET_IDENTITY_CHANGED', 'Desktop-sharing permission ended')
    if require_foreground and target['kind'] == 'app':
        window = windows.get(target['id'])
        if window is None or not window.getState().contains(pyatspi.STATE_ACTIVE):
            fail('TARGET_NOT_ACTIVE', 'The selected application must be active before input')


def capture(target, preview=False):
    check(target, require_foreground=False)
    if target['kind'] == 'app' and not windows[target['id']].getState().contains(pyatspi.STATE_ACTIVE):
        fail('BACKGROUND_CAPTURE_UNAVAILABLE', 'This portal shares a monitor, not unobscured application pixels; use AX or select the shared monitor explicitly')
    if state['pipeline'] is not None:
        message = state['pipeline'].get_bus().pop_filtered(Gst.MessageType.ERROR | Gst.MessageType.EOS)
        if message:
            state['error'] = str(message.parse_error()[0]) if message.type == Gst.MessageType.ERROR else 'PipeWire stream ended'
    if state['error']:
        fail('CAPTURE_FAILED', state['error'])
    deadline = time.monotonic() + 8
    with frames:
        while not state['frame'] or time.monotonic() - state['frame']['time'] > 2:
            check(target, require_foreground=False)
            pipeline = state['pipeline']
            if pipeline is None:
                fail('CAPTURE_UNAVAILABLE', 'Desktop sharing has no active capture stream')
            message = pipeline.get_bus().pop_filtered(Gst.MessageType.ERROR | Gst.MessageType.EOS)
            if message:
                fail('CAPTURE_FAILED', str(message.parse_error()[0]) if message.type == Gst.MessageType.ERROR else 'PipeWire stream ended')
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                fail('CAPTURE_TIMEOUT', 'No recent PipeWire frame is available')
            frames.wait(min(.2, remaining))
        frame = dict(state['frame'])
    if preview:
        return dict(dataUrl='data:image/png;base64,' + base64.b64encode(frame['png']).decode(), width=frame['width'], height=frame['height'], kind='native-frame', timestamp=int(time.time() * 1000))
    token = str(uuid.uuid4())
    path = os.path.join(directory, token + '.png')
    with open(path, 'xb') as stream:
        stream.write(frame['png'])
    os.chmod(path, 0o600)
    result = dict(path=path, mediaType='image/png', width=frame['width'], height=frame['height'], bounds=desktop_target()['bounds'], mappingId=token, coordinateSpace='physical-screenshot-pixels', captureScope='shared-monitor')
    mappings[target['id']] = dict(result, identity=target['identity'], targetBounds=target['bounds'])
    return result


def tree(target, options):
    if target['kind'] != 'app' or target['id'] not in windows:
        fail('ACCESSIBILITY_UNAVAILABLE', 'Select an AT-SPI application window to read its accessibility tree')
    prefix = target['id'] + ':'
    for key in list(elements):
        if key.startswith(prefix):
            del elements[key]
    nodes, lines = [], []
    deadline = time.monotonic() + min(10, options.get('timeoutMs', 5000) / 1000)
    def visit(element, depth):
        if len(nodes) >= min(3000, options.get('maxNodes', 1000)) or depth > min(80, options.get('maxDepth', 40)) or time.monotonic() >= deadline:
            return
        key = prefix + str(uuid.uuid4())
        elements[key] = element
        node = dict(elementId=key, name=element.name, role=element.getRoleName())
        if element.getRole() != pyatspi.ROLE_PASSWORD_TEXT:
            try:
                text = element.queryText()
                node['value'] = text.getText(0, min(8000, text.characterCount))
            except NotImplementedError:
                pass
        nodes.append(node)
        lines.append('  ' * depth + '[' + key + '] ' + node['role'] + ' ' + node['name'] + ' ' + node.get('value', ''))
        for child in element:
            if child:
                visit(child, depth + 1)
    visit(windows[target['id']], 0)
    return dict(nodes=nodes, text='\n'.join(lines), truncated=time.monotonic() >= deadline or len(nodes) >= options.get('maxNodes', 1000))


def element(target, key):
    value = elements.get(key)
    if not str(key).startswith(target['id'] + ':') or value is None:
        fail('STALE_ELEMENT', 'Observe the selected application again')
    if value.getState().contains(pyatspi.STATE_DEFUNCT):
        fail('STALE_ELEMENT', 'Accessibility element is no longer available')
    return verify_window(value, windows[target['id']], fail)


def point(target, action):
    stream = state['stream']
    origin = stream['position']
    if action.get('elementId') is not None:
        if origin is None:
            fail('PORTAL_COORDINATES_UNAVAILABLE', 'Portal did not provide a desktop coordinate origin')
        r = element(target, action['elementId']).queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
        px, py = r.x + r.width / 2 - origin[0], r.y + r.height / 2 - origin[1]
    else:
        mapping = mappings.get(target['id'])
        frame = state['frame']
        if not mapping or not frame or mapping['identity'] != target['identity'] or mapping['targetBounds'] != target['bounds'] or (mapping['width'], mapping['height']) != (frame['width'], frame['height']) or action.get('mappingId', mapping['mappingId']) != mapping['mappingId']:
            fail('STALE_SCREENSHOT', 'Capture the current target before using coordinates')
        px, py = action.get('x', -1), action.get('y', -1)
        if not (0 <= px < mapping['width'] and 0 <= py < mapping['height']):
            fail('INVALID_COORDINATES', 'Point is outside the screenshot')
        px, py = px * stream['size'][0] / mapping['width'], py * stream['size'][1] / mapping['height']
    if not (math.isfinite(px) and math.isfinite(py) and 0 <= px < stream['size'][0] and 0 <= py < stream['size'][1]):
        fail('INVALID_COORDINATES', 'Point is outside the authorized monitor')
    if target['kind'] == 'app':
        b = target['bounds']
        if origin is None or not (b['x'] <= px + origin[0] < b['x'] + b['width'] and b['y'] <= py + origin[1] < b['y'] + b['height']):
            fail('TARGET_MISMATCH', 'Point is outside the selected application')
    return px, py


def notify(method, signature, *values):
    if not state['session']:
        fail('PERMISSION_DENIED', 'Desktop-sharing session ended')
    call(REMOTE, method, '(oa{sv}' + signature + ')', (state['session'], {}, *values))


def input_event(kind, code, down, target=None, expected=None):
    with input_lock:
        if down:
            check(target, expected)
        held = keys if kind == 'key' else buttons
        if (down and code in held) or (not down and code not in held):
            return
        if down:
            if not state['devices'] & (1 if kind == 'key' else 2):
                fail('PERMISSION_DENIED', 'The requested input device was not granted by the portal')
            held.add(code)
            persist()
        notify('NotifyKeyboardKeysym' if kind == 'key' else 'NotifyPointerButton', 'iu', code, int(down))
        if not down:
            held.remove(code)
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


def keysym(key):
    aliases = dict(Control='Control_L', Ctrl='Control_L', ControlOrMeta='Control_L', Meta='Super_L', Super='Super_L', Alt='Alt_L', Shift='Shift_L', Enter='Return', Esc='Escape', Space='space', ArrowLeft='Left', ArrowRight='Right', ArrowUp='Up', ArrowDown='Down', PageUp='Prior', PageDown='Next')
    if len(key) == 1:
        return ord(key) if ord(key) < 256 else 0x01000000 + ord(key)
    value = keymap.xkb_keysym_from_name(aliases.get(key, key).encode(), 0)
    if not value:
        fail('INVALID_KEY', 'Unknown keyboard symbol: ' + key)
    return value


def key_chord(value):
    names, token = [], ''
    for char in value:
        if char == '+' and token:
            names.append(token.strip())
            token = ''
        else:
            token += char
    names.append(token.strip())
    return [keysym(name) for name in names]


def activate(target):
    if target['kind'] == 'app':
        if not windows[target['id']].queryComponent().grabFocus():
            fail('FOCUS_REJECTED', 'The compositor rejected application focus')
    check(target)


def act(target, action, expected):
    check(target, expected, False)
    kind, mode = action['type'], action.get('inputMode', 'background')
    if mode not in ('background', 'foreground'):
        fail('INVALID_ACTION', 'inputMode must be background or foreground')
    if kind in ('set_value', 'ax_press') or mode == 'background' and kind in ('click', 'scroll', 'hit_test'):
        if target['kind'] != 'app':
            fail('FOREGROUND_REQUIRED', 'A shared monitor has no target-local accessibility actions; select an application window')
        root = windows[target['id']]
        if action.get('elementId') is not None:
            selected = verify_window(element(target, action['elementId']), root, fail)
        elif kind == 'scroll' and 'x' not in action:
            selected = root
        else:
            px, py = point(target, action)
            origin = state['stream']['position']
            if origin is None:
                fail('PORTAL_COORDINATES_UNAVAILABLE', 'Use an observed elementId; desktop coordinate origin is unavailable')
            selected = root.queryComponent().getAccessibleAtPoint(int(px + origin[0]), int(py + origin[1]), pyatspi.DESKTOP_COORDS)
            if selected is None:
                fail('ELEMENT_NOT_FOUND', 'No accessibility element at this point in the selected window')
            verify_window(selected, root, fail)
        if kind == 'hit_test':
            key = target['id'] + ':' + str(uuid.uuid4())
            elements[key] = selected
            return dict(element=dict(elementId=key, name=selected.name, role=selected.getRoleName()))
        return accessibility_action(root, selected, action, lambda: check(target, expected, False), fail)
    if kind != 'activate' and mode != 'foreground':
        fail('FOREGROUND_REQUIRED', 'Wayland portal input is global; obtain user permission before focus and inputMode=foreground')
    if kind == 'activate':
        with input_lock:
            if ended or expected != epoch:
                fail('CONTROL_STOPPED', 'Input was cancelled')
            activate(target)
        return dict(performed=True, type=kind)
    check(target, expected)
    def move(at):
        with input_lock:
            check(target, expected)
            if not state['devices'] & 2:
                fail('PERMISSION_DENIED', 'Pointer access was not granted')
            notify('NotifyPointerMotionAbsolute', 'udd', state['stream']['node'], float(at[0]), float(at[1]))
            stream = state['stream']
            origin = dict(x=stream['position'][0], y=stream['position'][1]) if stream['position'] is not None else None
            with output_lock:
                print(json.dumps(dict(event=dict(type='cursor', visible=True, targetId=target['id'], x=float(at[0]), y=float(at[1]), space='logical', origin=origin, size=dict(width=stream['size'][0], height=stream['size'][1])))), flush=True)
    button = {'left': 272, 'right': 273, 'middle': 274}.get(action.get('button', 'left'))
    if button is None:
        fail('INVALID_ARGUMENT', 'Unknown pointer button')
    if kind == 'hit_test':
        px, py = point(target, action)
        origin = state['stream']['position']
        if target['kind'] != 'app' or origin is None:
            fail('ACCESSIBILITY_UNAVAILABLE', 'Hit testing requires a selected AT-SPI application')
        window = windows[target['id']]
        hit = window.queryComponent().getAccessibleAtPoint(int(px + origin[0]), int(py + origin[1]), pyatspi.DESKTOP_COORDS)
        if hit is None:
            fail('ELEMENT_NOT_FOUND', 'No accessibility element at this point in the selected window')
        verify_window(hit, window, fail)
        key = target['id'] + ':' + str(uuid.uuid4())
        elements[key] = hit
        return dict(element=dict(elementId=key, name=hit.name, role=hit.getRoleName()))
    elif kind in ('set_value', 'ax_press'):
        with input_lock:
            check(target, expected)
            selected = element(target, action['elementId'])
            accepted = selected.queryEditableText().setTextContents(str(action.get('value', action.get('text', '')))) if kind == 'set_value' else selected.queryAction().doAction(0)
            if not accepted:
                fail('INPUT_REJECTED', 'Application rejected accessibility action')
    elif kind in ('type_text', 'press_key', 'key_down', 'key_up'):
        if kind == 'type_text':
            for char in action.get('text', ''):
                key = keysym('Return' if char == '\n' else 'Tab' if char == '\t' else char)
                input_event('key', key, True, target, expected)
                input_event('key', key, False)
        elif kind == 'press_key':
            chord = key_chord(action['key'])
            with input_lock:
                check(target, expected)
                if any(key in keys for key in chord):
                    raise ChordAlreadyHeld('INPUT_ALREADY_HELD', 'pressKey cannot reuse an already held key; no input was dispatched')
                acquired = []
                try:
                    for key in chord:
                        try:
                            input_event('key', key, True, target, expected)
                        finally:
                            if key in keys:
                                acquired.append(key)
                finally:
                    for key in reversed(acquired):
                        input_event('key', key, False)
        else:
            input_event('key', keysym(action['key']), kind == 'key_down', target, expected)
    elif kind == 'scroll':
        if 'x' in action or 'elementId' in action:
            move(point(target, action))
        with input_lock:
            check(target, expected)
            dx, dy = float(action.get('deltaX', 0)), float(action.get('deltaY', 0))
            if not math.isfinite(dx) or not math.isfinite(dy):
                fail('INVALID_COORDINATES', 'Scroll deltas must be finite')
            notify('NotifyPointerAxis', 'dd', dx, dy)
    elif kind == 'mouse_up':
        input_event('button', button, False)
    elif kind == 'drag':
        samples = action.get('path')
        if samples is not None:
            if len(samples) < 2:
                fail('INVALID_ACTION', 'Drag requires at least two points')
            points = [point(target, dict(action, elementId=None, x=sample['x'], y=sample['y'])) for sample in samples]
        else:
            points = [point(target, dict(action, elementId=None, x=action['fromX'], y=action['fromY'])), point(target, action)]
        steps = max(1, 20 // (len(points) - 1))
        delay = .2 / ((len(points) - 1) * steps)
        move(points[0])
        input_event('button', button, True, target, expected)
        for first, last in zip(points, points[1:]):
            for step in range(1, steps + 1):
                move((first[0] + (last[0] - first[0]) * step / steps, first[1] + (last[1] - first[1]) * step / steps))
                time.sleep(delay)
        input_event('button', button, False)
    elif kind in ('move', 'click', 'double_click', 'right_click', 'mouse_down'):
        move(point(target, action))
        if kind != 'move':
            for _ in range(2 if kind == 'double_click' else 1):
                input_event('button', 273 if kind == 'right_click' else button, True, target, expected)
                if kind != 'mouse_down':
                    input_event('button', 273 if kind == 'right_click' else button, False)
    else:
        fail('UNSUPPORTED_ACTION', kind)
    check(target, expected)
    return dict(performed=True, type=kind)


def perform(method, args, expected):
    global closing
    if method == 'hello':
        return dict(protocol=1, platform='linux', sessionType='wayland')
    if method == 'permissions':
        return permissions()
    if method == 'openPermissionSettings':
        return authorize(expected)
    if method == 'listTargets':
        return inventory()
    if method in ('release', 'close'):
        result = release()
        if method == 'close':
            close_session()
            closing = True
            return dict(released=True, sessionClosed=True)
        return result
    if method == 'stopPreview':
        return dict(released=True)
    if method == 'verify':
        try:
            return dict(valid=True, target=resolve(args['target']))
        except Exception as error:
            return dict(valid=False, reason=str(error))
    target = resolve(args['reference'] if method in ('select', 'focus') else args['target'])
    if method == 'select':
        check(target, expected, False)
        return target
    if method == 'focus':
        with input_lock:
            if ended or expected != epoch:
                fail('CONTROL_STOPPED', 'Selection was cancelled')
            activate(target)
        return target
    if method == 'act':
        return act(target, args['action'], expected)
    if method == 'preview':
        return capture(target, True)
    if method == 'observe':
        options = args.get('options', {})
        result = dict(observationId=str(uuid.uuid4()), targetId=target['id'], identity=target['identity'], coordinateSpace='physical-screenshot-pixels', userActivityMonitoring=dict(available=False, reason='The Wayland portal does not expose global user input events'))
        errors = []
        if options.get('format') != 'screenshot':
            try:
                result['ax'] = tree(target, options)
                result['text'] = result['ax']['text']
            except Exception as error:
                errors.append(dict(message=str(error)))
        if options.get('format') != 'ax':
            try:
                result['screenshot'] = capture(target)
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
    global ended, epoch
    try:
        for line in sys.stdin:
            request = json.loads(line)
            if request['method'] in ('release', 'close'):
                with input_lock:
                    epoch += 1
            request['epoch'] = epoch
            if request['method'] in ('release', 'preview', 'verify', 'permissions', 'listTargets'):
                threading.Thread(target=reply, args=(request,), daemon=True).start()
            else:
                commands.put(request)
    finally:
        with input_lock:
            ended = True
            epoch += 1
        release()
        commands.put(None)


threading.Thread(target=read_commands, daemon=True).start()
try:
    while not closing:
        request = commands.get()
        if request is None:
            break
        reply(request)
finally:
    try:
        close_session()
    finally:
        bus.signal_unsubscribe(subscription)
        loop.quit()
        bus.close_sync(None)
