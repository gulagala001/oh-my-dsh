"""Hyprland backend: hyprctl for windows, grim for frames, ydotool/wtype for input.

Hyprland implements no xdg-desktop-portal RemoteDesktop, so the portal backend in
wayland.py can neither inject input nor learn window geometry there. Hyprland does
expose its own IPC (window inventory, focus, absolute pointer placement, monitor
scale) and accepts wlroots-style input injection through uinput, which is what this
helper drives. Anything the compositor cannot answer is reported as a failure rather
than guessed: there is no screen-wide fallback and no synthetic accessibility tree.
"""
import base64
import ctypes as C
import ctypes.util
import fcntl
import json
import os
import queue
import re
import shutil
import signal
import struct
import subprocess
import sys
import threading
import time
import uuid
from accessibility_input import perform as accessibility_action, verify_window
import input_receipt


class Failure(Exception):
    def __init__(self, code, message, details=None):
        super().__init__(message)
        self.code = code
        self.details = details


class ChordAlreadyHeld(Failure):
    pass


def fail(code, message, details=None):
    raise Failure(code, message, details)


def rejected(code, message):
    """A refusal raised before any input reached the desktop.

    The host only keeps the session usable for these when it can see that
    nothing was dispatched, so every pre-dispatch refusal says so.
    """
    raise Failure(code, message, dict(inputDispatched=False, retryable=True))


def execute(argv, text=True, timeout=20):
    try:
        return subprocess.run(argv, capture_output=True, text=text, timeout=timeout)
    except FileNotFoundError:
        fail('DEPENDENCY_UNAVAILABLE', argv[0] + ' is not installed')
    except subprocess.TimeoutExpired:
        fail('COMMAND_TIMEOUT', ' '.join(argv[:2]) + ' did not finish in time')


def execute_input(argv, expected=None, timeout=20):
    """Track input subprocesses so cancellation stops them before releasing keys.

    Release commands have no expected epoch: they must finish even after stop.
    The reader uses a separate lock to kill a sender that owns input_lock.
    """
    with process_lock:
        if expected is not None and (expected != epoch or ended or closing):
            fail('CONTROL_STOPPED', 'Input was cancelled')
        try:
            process = input_receipt.dispatch(subprocess.Popen, argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        except FileNotFoundError:
            fail('DEPENDENCY_UNAVAILABLE', argv[0] + ' is not installed')
        if expected is not None:
            input_processes.add(process)
    try:
        try:
            out, err = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            fail('COMMAND_TIMEOUT', ' '.join(argv[:2]) + ' did not finish in time')
        if expected is not None and (expected != epoch or ended or closing):
            fail('CONTROL_STOPPED', 'Input was cancelled')
        return subprocess.CompletedProcess(argv, process.returncode, out, err)
    finally:
        with process_lock:
            input_processes.discard(process)


def cancel_input_processes():
    with process_lock:
        for process in input_processes:
            try:
                process.kill()
            except ProcessLookupError:
                pass


def stdout(value):
    stream = value.stdout or ''
    return stream if isinstance(stream, str) else stream.decode('utf-8', 'replace')


def stderr(value):
    stream = value.stderr or ''
    return stream if isinstance(stream, str) else stream.decode('utf-8', 'replace')


def hypr_json(*command):
    value = execute(['hyprctl', '-j', *command])
    if value.returncode:
        fail('HYPRLAND_UNAVAILABLE', 'hyprctl ' + command[0] + ' failed: ' + (stderr(value) or stdout(value)).strip())
    try:
        return json.loads(stdout(value) or '{}')
    except ValueError:
        fail('HYPRLAND_UNAVAILABLE', 'hyprctl returned malformed JSON for ' + command[0])


def dispatch(*dispatcher):
    value = input_receipt.dispatch(execute, ['hyprctl', 'dispatch', *dispatcher])
    message = stdout(value).strip()
    if value.returncode or message.startswith('error:'):
        fail('DISPATCH_REJECTED', (message or stderr(value).strip()) or 'Hyprland rejected the dispatcher')
    return message


DIALECT = None


def dialect():
    """Hyprland 0.56 reads dispatch arguments as Lua; older releases take plain words."""
    global DIALECT
    if DIALECT is None:
        value = execute(['hyprctl', 'dispatch', 'hl.dsp.no_op()'])
        DIALECT = 'lua' if value.returncode == 0 and not stdout(value).strip().startswith('error:') else 'string'
    return DIALECT


def warp(x, y):
    if dialect() == 'lua':
        dispatch('hl.dsp.cursor.move({x=%d, y=%d})' % (x, y))
    else:
        dispatch('movecursor', str(int(x)), str(int(y)))


def move_pointer(x, y, expected):
    """Warp onto the point and hand the clients a real pointer motion.

    Hyprland's cursor dispatcher moves the pointer without telling its clients, and
    a surface that never received a motion drops the wheel events aimed at it. One
    relative pixel produces that motion while leaving the pointer on the point.
    """
    position = None
    for _ in range(2):
        warp(x, y)
        if ydotool:
            value = execute_input(['ydotool', 'mousemove', '-x', '1', '-y', '0'], expected)
            if value.returncode:
                fail('INPUT_REJECTED', 'ydotool rejected pointer motion: ' + stderr(value).strip())
        position = cursor_position()
        if position is None or (abs(position[0] - x) <= 2 and abs(position[1] - y) <= 2):
            return
    fail('INPUT_REJECTED', 'Hyprland left the pointer at %d,%d instead of %d,%d'
         % (position[0], position[1], x, y))


def focus_window(address):
    if dialect() == 'lua':
        dispatch('hl.dsp.focus({ window = "address:%s" })' % address)
    else:
        dispatch('focuswindow', 'address:' + address)


def cursor_position():
    value = execute(['hyprctl', 'cursorpos'])
    match = re.match(r'^\s*(-?\d+)\s*,\s*(-?\d+)\s*$', stdout(value))
    return (int(match.group(1)), int(match.group(2))) if match else None


def monitors():
    return [monitor for monitor in hypr_json('monitors') if not monitor.get('disabled')]


def monitor_rect(monitor):
    scale = float(monitor.get('scale') or 1)
    return dict(name=monitor['name'], x=int(monitor['x']), y=int(monitor['y']),
                width=int(round(monitor['width'] / scale)), height=int(round(monitor['height'] / scale)), scale=scale)


def desktops():
    """Monitors report physical pixels; Hyprland places windows in layout pixels."""
    rects = [monitor_rect(monitor) for monitor in monitors()]
    if not rects:
        fail('DISPLAY_UNAVAILABLE', 'Hyprland reports no enabled monitor')
    return rects


def clip(bounds):
    """Clip a layout rectangle to the monitor holding most of it."""
    best, cover = None, 0
    for rect in desktops():
        width = min(bounds['x'] + bounds['width'], rect['x'] + rect['width']) - max(bounds['x'], rect['x'])
        height = min(bounds['y'] + bounds['height'], rect['y'] + rect['height']) - max(bounds['y'], rect['y'])
        if width > 0 and height > 0 and width * height > cover:
            best, cover = dict(rect, x=max(bounds['x'], rect['x']), y=max(bounds['y'], rect['y']),
                               width=width, height=height), width * height
    if best is None:
        fail('CAPTURE_UNAVAILABLE', 'The window is outside every enabled monitor')
    return best


def windows():
    return hypr_json('clients')


def active_address():
    value = hypr_json('activewindow')
    return value.get('address') if isinstance(value, dict) else None


def bounds(window):
    at, size = window.get('at') or [0, 0], window.get('size') or [0, 0]
    return dict(x=int(at[0]), y=int(at[1]), width=int(size[0]), height=int(size[1]))


def target(window, active, applications=None):
    pid = window.get('pid')
    if not pid or pid <= 0:
        fail('TARGET_IDENTITY_UNAVAILABLE', 'Window has no process identity')
    with open('/proc/%d/stat' % pid) as stream:
        start = stream.read().rsplit(')', 1)[1].split()[19]
    executable = os.readlink('/proc/%d/exe' % pid)
    address = window['address']
    identity = dict(pid=pid, processStart=start, executable=executable, windowId=address)
    reach = accessibility(pid, applications)
    # The display server states the capture route, and the input route says whether
    # this particular window can be driven without accessibility support.
    return dict(id='native:%d:window:%s' % (pid, address), kind='app', backend='native', platform='linux',
                targetType='window', pid=pid, windowId=address, bundleId=executable,
                name=window.get('class') or os.path.basename(executable), title=window.get('title') or '',
                identity=identity, bounds=bounds(window), active=window['address'] == active,
                workspace=(window.get('workspace') or {}).get('id'), monitor=window.get('monitor'),
                fullscreen=int(window.get('fullscreen') or 0), floating=bool(window.get('floating')),
                displayServer='wayland', a11y=reach,
                input='accessibility-only' if reach == 'application' else 'posted-events-foreground',
                backgroundActions=['set_value', 'ax_press', 'click', 'scroll', 'hitTest'] if reach == 'application' else [])


def inventory():
    active = active_address()
    applications = accessible_applications()
    result = []
    for window in windows():
        if not window.get('mapped') or window.get('hidden'):
            continue
        try:
            result.append(target(window, active, applications))
        except (OSError, KeyError, Failure):
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


ISOLATION = 'opencu'
isolated = {}
view_origin = None  # The workspace the user was looking at before the screen was taken.
view_taken = None   # The workspace we left them on, so a later hand-back can tell they stayed.
indicator, indicator_lock = None, threading.Lock()
indicator_status, status_lock = dict(text='已连接，等待指令', at=0.0), threading.Lock()
indicator_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hyprland_indicator.py')


def workspace_of(window):
    workspace = window.get('workspace') or {}
    identifier = workspace.get('id')
    name = workspace.get('name') or str(identifier)
    return dict(id=identifier, name=name)


def active_workspace():
    value = hypr_json('activeworkspace')
    if not isinstance(value, dict):
        return None
    return dict(id=value.get('id'), name=value.get('name') or str(value.get('id')))


def window_for(address):
    for window in windows():
        if window['address'] == address:
            return window
    return None


def companions(window):
    """Windows that share the target's workspace and would shrink it."""
    workspace = (window.get('workspace') or {}).get('id')
    return [other for other in windows()
            if other['address'] != window['address'] and not other.get('hidden')
            and (other.get('workspace') or {}).get('id') == workspace]


def workspace_argument(workspace):
    """Name the workspace the way the current dispatcher dialect expects."""
    return '"%s"' % workspace if isinstance(workspace, str) else str(workspace)


def move_window(address, workspace):
    if dialect() == 'lua':
        # follow=false is what keeps the view put in the Lua dispatch dialect;
        # the legacy `silent` spelling is accepted but ignored here.
        dispatch('hl.dsp.window.move({ window = "address:%s", workspace = %s, follow = false })'
                 % (address, workspace_argument(workspace)))
    else:
        dispatch('movetoworkspacesilent', '%s,address:%s' % (workspace, address))


def focus_workspace(workspace):
    if dialect() == 'lua':
        dispatch('hl.dsp.focus({ workspace = %s })' % workspace_argument(workspace))
    else:
        dispatch('workspace', str(workspace))


def origin_argument(origin):
    return 'name:' + origin['name'] if origin['id'] is not None and origin['id'] < 0 else origin['name']


def record_view(workspace):
    """Remember the workspace the user was looking at before we take the screen."""
    global view_origin
    if view_origin is None and workspace is not None:
        view_origin = workspace


def note_taken():
    """Remember the workspace we left the user looking at."""
    global view_taken
    view_taken = active_workspace()


def hand_back_view():
    """Put the view back where the user had it, if they are still where we left them.

    A user who switched workspace in the meantime is not dragged back: only the
    view we took is given back.
    """
    global view_origin, view_taken
    origin, taken = view_origin, view_taken
    if origin is None or taken is None or origin['id'] == taken['id']:
        view_origin, view_taken = None, None
        return False
    current = active_workspace()
    if current is None or current['id'] != taken['id']:
        view_origin, view_taken = None, None
        return False
    focus_workspace(origin_argument(origin))
    view_origin, view_taken = None, None
    return True


def remember_view(t):
    """Record the view only when the screen is about to show another workspace.

    A window that already sits on the workspace the user is looking at takes no
    view away from them, so there is nothing to hand back later; a window that is
    moved to the isolation workspace always does, even when it was sharing the
    user's workspace before the move.
    """
    window = window_for(t['windowId'])
    current = active_workspace()
    if window is None or current is None:
        return
    if current['id'] != workspace_of(window)['id']:
        record_view(current)


def away(relinquish=False):
    """Stop holding the screen, in one of the two ways a model yields.

    Asking the user something only interrupts the step: the window stays on its
    workspace with the control bar up, and the view returns to where the user was
    so the question is readable. Resuming foreground work requires explicit
    focus again; passive previews never reclaim the screen.

    Ending a turn hands the whole desktop back: the window returns to the
    workspace the user had it on, and the bar goes away, because a session that
    is not driving must not keep warning the user away from their own desktop.
    The selection survives, so the next turn needs no reselecting.
    """
    result = release()
    if not result['released']:
        fail('RELEASE_FAILED', 'Held input could not be released before handing back the desktop', dict(release=result))
    if relinquish:
        handed = hand_back_view() or bool(isolated)
        restore_isolation()
        stop_indicator()
        report('会话暂停，桌面已交还')
        notify('OpenCU 已暂停，桌面已交还')
        return handed
    if not hand_back_view():
        return False
    report('已交还桌面 · 等待你的回复')
    notify('模型在等你回答，桌面已交还')
    return True


def isolate(t):
    """Give the target a workspace of its own so nothing can squeeze it.

    A tiled desktop shares one workspace per monitor: every window opened beside
    the target takes part of its area, and a capture of a sliver is useless. The
    target therefore moves to its own workspace, which also keeps the user's own
    layout untouched. A target that already has its workspace to itself would
    gain nothing from moving, so it stays where it is.
    """
    address = t['windowId']
    if address in isolated:
        return False
    window = window_for(address)
    if window is None:
        return False
    origin = workspace_of(window)
    if origin['name'] == ISOLATION or not companions(window):
        return False
    record_view(active_workspace())
    isolated[address] = origin
    move_window(address, 'name:' + ISOLATION)
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        landed = window_for(address)
        if landed is not None and workspace_of(landed)['name'] == ISOLATION:
            break
        time.sleep(.02)
    focus_workspace('name:' + ISOLATION)
    focus_window(address)
    note_taken()
    start_indicator()
    notify('%s 已移到专用工作区 %s' % (t['name'], ISOLATION))
    return True


def restore_isolation():
    """Put every window this helper moved back where the user had it."""
    for address, previous in list(isolated.items()):
        window = window_for(address)
        if window is None or workspace_of(window)['name'] != ISOLATION:
            isolated.pop(address, None)
            continue  # Gone, or the user already moved it somewhere on purpose.
        move_window(address, origin_argument(previous))
        isolated.pop(address, None)
    hand_back_view()


def settle_view(t):
    """Wait until the compositor presents the workspace we just switched to.

    Hyprland applies focus and workspace changes asynchronously and then slides
    the new workspace in: grim started in the same instant returns the screen
    from before the switch, with the old workspace still on its way out, so the
    model would read - and then click - a screen it is not driving. Only a real
    switch pays for this wait.
    """
    window = window_for(t['windowId'])
    if window is not None:
        wanted = workspace_of(window)['id']
        deadline = time.monotonic() + 1
        current = active_workspace()
        while current is not None and current['id'] != wanted and time.monotonic() < deadline:
            time.sleep(.02)
            current = active_workspace()
    # The workspace slide itself lasts about half a second here: measured left
    # edge residue 0.17 at 300ms, 0.10 at 400ms, gone by 550ms. Hyprland 0.56
    # refuses `hyprctl keyword` for animations, so the slide cannot be skipped
    # for this one switch and the frame has to wait it out.
    time.sleep(.55)


def notify(message, color='rgb(ffaa00)'):
    """Tell the user why the desktop just moved under them."""
    try:
        execute(['hyprctl', 'notify', '-1', '3000', color, message], timeout=5)
    except Exception:
        pass  # A compositor without inline notifications must not break control.


def status_file():
    return os.path.join(directory, 'indicator.status')


def report(text):
    """Publish the step the helper is on for the bar the user watches.

    A file rather than a pipe: the bar is its own process and may start,
    restart or die without the helper noticing straight away.
    """
    stamp = time.time()
    with status_lock:
        indicator_status['text'], indicator_status['at'] = text, stamp
    try:
        # Written through a temp file so the bar never reads half a document.
        temporary = status_file() + '.tmp'
        with open(temporary, 'w') as stream:
            json.dump(dict(text=text, at=stamp), stream, ensure_ascii=False)
        os.replace(temporary, status_file())
    except OSError:
        pass


def keep_alive():
    """Hold the bar on screen for as long as this session is open.

    The heartbeat used to be refreshed only when an action ran, so the bar
    vanished after a few seconds of quiet and read as "control finished" while
    the session was still live. Refreshing it from a thread keeps the bar tied
    to the helper's lifetime instead: it goes away when control ends, not when
    the model pauses to think.
    """
    heartbeat = os.path.join(directory, 'indicator.heartbeat')
    while True:
        time.sleep(2)
        with indicator_lock:
            live = indicator is not None and indicator.poll() is None
        if not live:
            continue
        try:
            os.utime(heartbeat, None)
        except OSError:
            pass


def start_indicator():
    """Show the control bar while the helper is driving the desktop.

    The bar is a layer-shell surface that ignores input, so it never becomes a
    target and never swallows a click. It exits on its own once the heartbeat
    file goes stale, which also covers a helper that dies without cleaning up.
    """
    global indicator
    heartbeat = os.path.join(directory, 'indicator.heartbeat')
    with indicator_lock:
        if indicator is not None and indicator.poll() is None:
            try:
                os.utime(heartbeat, None)
                return
            except OSError:
                pass
        if not os.path.exists(indicator_script):
            return
        try:
            with open(heartbeat, 'w') as stream:
                stream.write(str(time.time()))
            if not os.path.exists(status_file()):
                report('已连接，等待指令')
            indicator = subprocess.Popen([sys.executable, indicator_script, '--heartbeat', heartbeat, '--status', status_file()],
                                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                         stderr=subprocess.DEVNULL, start_new_session=True)
        except OSError:
            indicator = None


def stop_indicator():
    global indicator
    with indicator_lock:
        process, indicator = indicator, None
    if process is None or process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        process.kill()
    except OSError:
        pass


def foreground(t):
    if active_address() != t['windowId']:
        fail('TARGET_NOT_ACTIVE', 'The selected window must be foreground: focus it, then repeat this action')


def focus(t, expected):
    # Workspace changes are restricted to this explicit focus operation. Release
    # waits for it to settle before restoring the workspace it moved.
    with input_lock:
        check(t, expected, False)
        moved = isolate(t)
        t = resolve(t)
        changed = active_address() != t['windowId']
        remember_view(t)
        focus_window(t['windowId'])
        deadline = time.monotonic() + 2
        while active_address() != t['windowId'] and time.monotonic() < deadline:
            check(t, expected, False)
            time.sleep(.02)
        check(t, expected)
        note_taken()
        if moved or changed:
            settle_view(t)
        check(t, expected)
        start_indicator()


if not shutil.which('hyprctl'):
    fail('HYPRCTL_UNAVAILABLE', 'hyprctl is required for Hyprland window, focus and pointer control')
if 'hyprland' not in (os.environ.get('XDG_CURRENT_DESKTOP') or '').lower() and not os.environ.get('HYPRLAND_INSTANCE_SIGNATURE'):
    fail('HYPRLAND_REQUIRED', 'The Hyprland backend requires a running Hyprland compositor')
hydrated = monitors()
grim, wtype, ydotool = shutil.which('grim'), shutil.which('wtype'), shutil.which('ydotool')
try:
    import pyatspi
except ImportError:
    pyatspi = None

atspi_applications, atspi_expiry = {}, 0.0


def accessible_applications():
    """Applications that publish an accessibility tree, keyed by process id.

    Importing pyatspi says nothing about a given window: terminals and other
    GPU-rendered toolkits never publish a tree, so reachability is decided per
    application instead of once for the whole session.
    """
    global atspi_applications, atspi_expiry
    if pyatspi is None:
        return {}
    now = time.monotonic()
    if now < atspi_expiry:
        return atspi_applications
    found = {}
    try:
        for app in pyatspi.Registry.getDesktop(0):
            try:
                # Chromium registers a stub application with no windows and a pid of its
                # own, so a registration alone does not make a window reachable.
                if app.childCount:
                    found.setdefault(app.get_process_id(), app)
            except Exception:  # Applications may exit while the desktop is walked.
                continue
    except Exception:  # A missing or restarting accessibility bus leaves no tree.
        found = {}
    atspi_applications, atspi_expiry = found, now + 1.0
    return found


def accessibility(pid, applications=None):
    """How far this window can be driven through accessibility."""
    if pyatspi is None:
        return 'client-unavailable'
    applications = accessible_applications() if applications is None else applications
    return 'application' if pid in applications else 'not-exposed'


directory = os.path.abspath(sys.argv[sys.argv.index('--data-dir') + 1])
os.makedirs(directory, mode=0o700, exist_ok=True)
owner = open(os.path.join(directory, 'owner.lock'), 'a+')
try:
    fcntl.flock(owner, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    # A stale helper left behind by a previous run still owns the data directory;
    # without this the interpreter reports an opaque traceback instead.
    print(f'Another OpenCU native helper already owns {directory} (owner.lock is held).', file=sys.stderr)
    sys.exit(2)
journal = os.path.join(directory, 'held-input.json')
keys, buttons, elements, mappings = set(), set(), {}, {}
input_lock, output_lock = threading.RLock(), threading.Lock()
process_lock, input_processes = threading.RLock(), set()
commands = queue.Queue()
epoch, ended, closing = 0, False, False


def emit(value):
    """Write one protocol line, tolerating a peer that walked away.

    The reader thread and `release()` both write from inside `input_lock`, so a
    BrokenPipeError raised here would skip the queue shutdown and leave the main
    loop waiting for a request that never comes. Point stdout at /dev/null once
    the pipe is gone and let the caller notice `closing` instead.
    """
    global closing
    try:
        with output_lock:
            print(json.dumps(value), flush=True)
    except (BrokenPipeError, ValueError, OSError):
        closing = True
        try:
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        except OSError:
            pass


class Keymap:
    """Resolve keysyms to uinput keycodes through the layout the compositor is using."""
    aliases = {'control': 'Control_L', 'ctrl': 'Control_L', 'meta': 'Super_L', 'super': 'Super_L', 'logo': 'Super_L', 'alt': 'Alt_L',
               'shift': 'Shift_L', 'enter': 'Return', 'esc': 'Escape', 'escape': 'Escape', 'space': 'space', 'tab': 'Tab',
               'arrowleft': 'Left', 'arrowright': 'Right', 'arrowup': 'Up', 'arrowdown': 'Down', 'pageup': 'Prior', 'pagedown': 'Next'}

    class Names(C.Structure):
        _fields_ = [('rules', C.c_char_p), ('model', C.c_char_p), ('layout', C.c_char_p), ('variant', C.c_char_p), ('options', C.c_char_p)]

    def __init__(self):
        self.keys = {}
        xkb = C.CDLL(ctypes.util.find_library('xkbcommon') or 'libxkbcommon.so.0')

        def bind(name, result, *args):
            function = getattr(xkb, name)
            function.restype, function.argtypes = result, args
            return function

        P, U = C.c_void_p, C.c_uint32
        bind('xkb_context_new', P, C.c_int)
        bind('xkb_context_unref', None, P)
        bind('xkb_keymap_new_from_names', P, P, C.POINTER(self.Names), C.c_int)
        bind('xkb_keymap_unref', None, P)
        bind('xkb_keymap_min_keycode', U, P)
        bind('xkb_keymap_max_keycode', U, P)
        bind('xkb_keymap_key_get_syms_by_level', C.c_int, P, U, U, U, C.POINTER(C.POINTER(U)))
        bind('xkb_keysym_from_name', U, C.c_char_p, C.c_int)
        bind('xkb_keysym_to_utf32', U, U)
        bind('xkb_utf32_to_keysym', U, U)
        keyboards = [keyboard for keyboard in hypr_json('devices').get('keyboards', []) if keyboard.get('layout')]
        main = next((keyboard for keyboard in keyboards if keyboard.get('main')), keyboards[0] if keyboards else {})
        layout, index = (main.get('layout') or 'us'), int(main.get('active_layout_index') or 0)
        self.xkb, self.index = xkb, index
        context = xkb.xkb_context_new(0)
        self.options = self.Names(None, None, layout.encode(), None, None)
        self.keymap = xkb.xkb_keymap_new_from_names(context, C.byref(self.options), 0)
        xkb.xkb_context_unref(context)
        if not self.keymap:
            fail('KEYMAP_UNAVAILABLE', 'xkbcommon could not load the keyboard layout ' + layout)
        self.first, self.last = xkb.xkb_keymap_min_keycode(self.keymap), xkb.xkb_keymap_max_keycode(self.keymap)

    def __del__(self):
        if getattr(self, 'keymap', None):
            self.xkb.xkb_keymap_unref(self.keymap)

    def sym(self, name):
        # Accept the canonical chord names from the client, their xkb spellings and
        # the lowercase aliases callers write by hand.
        for candidate in (name, name.capitalize(), self.aliases.get(name.lower(), '')):
            keysym = candidate and self.xkb.xkb_keysym_from_name(candidate.encode(), 0)
            if keysym:
                return keysym
        fail('INVALID_KEY', 'The current keyboard layout has no key: ' + name)

    def find(self, keysym):
        """Return (uinput keycode, shift level) for a keysym in the active layout group."""
        if keysym in self.keys:
            return self.keys[keysym]
        for code in range(self.first, self.last + 1):
            for level in (0, 1):
                symbols = C.POINTER(C.c_uint32)()
                if self.xkb.xkb_keymap_key_get_syms_by_level(self.keymap, code, self.index, level, C.byref(symbols)) > 0 and symbols[0] == keysym:
                    self.keys[keysym] = (code - 8, level)
                    return self.keys[keysym]
        self.keys[keysym] = None
        return None

    def key(self, name):
        found = self.find(self.sym(name))
        if not found:
            fail('INVALID_KEY', 'The current keyboard layout has no key: ' + name)
        return found

    def character(self, char):
        return self.find(self.xkb.xkb_utf32_to_keysym(ord(char)))


keymap = None
shift = None


def keys_ready():
    global keymap, shift
    if keymap is None:
        keymap = Keymap()
        shift = keymap.key('Shift_L')[0]
    return keymap


def keycode(key):
    return keys_ready().key(key)[0]


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
        code, level = keys_ready().key(name)
        if level > 1:
            fail('INVALID_KEY', 'Only the base and Shift levels of the current layout are supported: ' + name)
        if level == 1 and shift not in chord:
            chord.append(shift)
        if code not in chord:
            chord.append(code)
    return chord


def persist():
    with open(journal + '.tmp', 'w') as stream:
        json.dump(dict(keys=list(keys), buttons=list(buttons)), stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(journal + '.tmp', journal)


# ydotool numbers buttons as the uinput bitmask: left, right, then middle.
BUTTONS = dict(left=0x00, right=0x01, middle=0x02)


def button_index(name):
    return BUTTONS.get(name, BUTTONS['left'])


def send(kind, code, down, expected=None):
    if not ydotool:
        fail('INPUT_UNAVAILABLE', 'Install ydotool and run ydotoold to send pointer and key input on Hyprland')
    arguments = ['key', '%d:%d' % (code, int(down))] if kind == 'key' else ['click', hex((0x40 if down else 0x80) | code)]
    value = execute_input(['ydotool', *arguments], expected)
    if value.returncode:
        fail('INPUT_REJECTED', 'ydotool rejected ' + arguments[0] + ': ' + (stderr(value) or stdout(value)).strip())


def input_event(kind, code, down, expected=None):
    with input_lock:
        if down and (expected != epoch or ended or closing):
            fail('CONTROL_STOPPED', 'Input was cancelled')
        held = keys if kind == 'key' else buttons
        if not down and code not in held:
            return
        if down:
            if code in held:
                return
            # The daemon owns the device, so killing the helper does not release
            # it. Journal intent first, including dispatches with unknown outcome.
            held.add(code)
            try:
                persist()
            except Exception:
                held.discard(code)
                raise
            send(kind, code, True, expected)
            return
        send(kind, code, False)
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
        emit(dict(event=dict(type='cursor', visible=False)))
    return dict(released=not failures, failures=failures, heldKeys=list(keys), heldButtons=list(buttons))


def png_size(data):
    if len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        fail('CAPTURE_FORMAT', 'grim did not return a PNG stream')
    width, height = struct.unpack('!II', data[16:24])
    if width <= 0 or height <= 0:
        fail('CAPTURE_FORMAT', 'grim returned an empty frame')
    return width, height


def capture(t, preview=False):
    if not grim:
        fail('CAPTURE_UNAVAILABLE', 'Install grim to capture windows on Hyprland')
    # Hyprland offers no per-window capture protocol, so the frame comes from the
    # screen: the window has to be visible already. Monitoring and observation
    # must never move windows, change focus or restart a surrendered takeover.
    t = resolve(t)
    if active_address() != t['windowId']:
        fail('BACKGROUND_CAPTURE_UNAVAILABLE', 'Hyprland can only capture the visible foreground window; explicitly focus it first')
    if not preview:
        report('截图 %s' % t['name'])
    region = clip(t['bounds'])
    value = execute(['grim', '-g', '%d,%d %dx%d' % (region['x'], region['y'], region['width'], region['height']), '-'], text=False)
    if value.returncode:
        fail('CAPTURE_FAILED', 'grim failed: ' + stderr(value).strip())
    current = resolve(t)
    if active_address() != t['windowId'] or current['bounds'] != t['bounds']:
        fail('BACKGROUND_CAPTURE_UNAVAILABLE', 'The window changed during capture; observe again after explicitly focusing it')
    data, (width, height) = value.stdout, png_size(value.stdout)
    if not preview:
        report('截图 %s · %d×%d' % (t['name'], width, height))
    if preview:
        return dict(dataUrl='data:image/png;base64,' + base64.b64encode(data).decode(), width=width, height=height, kind='native-frame', timestamp=int(time.time() * 1000))
    token = str(uuid.uuid4())
    path = os.path.join(directory, token + '.png')
    with open(path, 'wb') as stream:
        stream.write(data)
    os.chmod(path, 0o600)
    result = dict(path=path, mediaType='image/png', width=width, height=height, bounds=dict(x=region['x'], y=region['y'], width=region['width'], height=region['height']),
                  mappingId=token, scale=height / region['height'], coordinateSpace='physical-screenshot-pixels', captureScope='screen-region', captureMonitor=region['name'])
    mappings[t['id']] = dict(result, targetBounds=t['bounds'])
    return result


def app_window(t):
    if pyatspi is None:
        fail('ACCESSIBILITY_UNAVAILABLE', 'Install python3-pyatspi to read and edit application accessibility objects')
    app = accessible_applications().get(t['pid'])
    if app is None:
        fail('ACCESSIBILITY_UNAVAILABLE',
             'This application publishes no accessibility tree (terminals and other GPU-rendered toolkits never do): '
             'observe it as a screenshot and drive it with foreground input')
    candidates = []
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
    report('读取 %s 的无障碍树' % t['name'])
    prefix = t['id'] + ':'
    for key in list(elements):
        if key.startswith(prefix):
            del elements[key]
    nodes, lines = [], []
    max_nodes, max_depth = min(3000, max(1, options.get('maxNodes', 1000))), min(80, max(0, options.get('maxDepth', 40)))
    truncated = False
    deadline = time.monotonic() + min(15, options.get('timeoutMs', 5000) / 1000)

    def visit(element, depth, parent=None):
        nonlocal truncated
        if len(nodes) >= max_nodes or depth > max_depth or time.monotonic() >= deadline:
            truncated = True
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
            if len(nodes) >= max_nodes or depth >= max_depth or time.monotonic() >= deadline:
                truncated = True
                break
            if child:
                visit(child, depth + 1, key)
    visit(app_window(t), 0)
    report('无障碍树 %s · %d 个节点' % (t['name'], len(nodes)))
    return dict(nodes=nodes, text='\n'.join(lines), truncated=truncated)


def element(t, key):
    if not str(key).startswith(t['id'] + ':') or key not in elements:
        fail('STALE_ELEMENT', 'Observe the selected application again')
    return verify_window(elements[key], app_window(t), fail)


def point(t, action):
    if action.get('elementId') is not None:
        r = element(t, action['elementId']).queryComponent().getExtents(pyatspi.DESKTOP_COORDS)
        if r.width <= 0 or r.height <= 0:
            fail('ELEMENT_NOT_VISIBLE', 'Element has no usable bounds')
        return r.x + r.width // 2, r.y + r.height // 2
    mapping = mappings.get(t['id'])
    if not mapping or action.get('mappingId', mapping['mappingId']) != mapping['mappingId'] or t['bounds'] != mapping['targetBounds']:
        if not mapping:
            stale = 'this window has no capture yet'
        elif t['bounds'] != mapping['targetBounds']:
            stale = 'the window moved to %s from %s' % (t['bounds'], mapping['targetBounds'])
        else:
            stale = 'that capture is not the latest one'
        rejected('STALE_OBSERVATION', 'Observe the window again before using coordinates: ' + stale)
    px, py = action.get('x', -1), action.get('y', -1)
    if not (0 <= px < mapping['width'] and 0 <= py < mapping['height']):
        rejected('INVALID_ARGUMENT', 'Point %sx%s is outside the latest %sx%s screenshot' % (px, py, mapping['width'], mapping['height']))
    # The frame is physical pixels of a scaled compositor; the window is in layout pixels.
    return int(mapping['bounds']['x'] + px * mapping['bounds']['width'] / mapping['width']), int(mapping['bounds']['y'] + py * mapping['bounds']['height'] / mapping['height'])


def check(t, expected, require_foreground=True):
    if epoch != expected or ended or closing:
        fail('CONTROL_STOPPED', 'Input was cancelled')
    resolve(t)
    if require_foreground:
        foreground(t)


def type_direct(t, piece, expected):
    """Type through uinput so keys held by key_down also apply to typed text.

    wtype types on a virtual keyboard of its own, so a modifier pressed through
    key_down would not reach those characters; ASCII runs therefore stay on the
    uinput device and only unreachable characters fall back to wtype.
    """
    characters = []
    for char in piece:
        found = keys_ready().character(char)
        if not found:
            return False
        characters.append(found)
    with input_lock:
        if any(code in keys for code, _level in characters):
            raise ChordAlreadyHeld('INPUT_ALREADY_HELD', 'Typing cannot reuse an already held character key')
    for code, level in characters:
        with input_lock:
            check(t, expected)
            acquired = []
            try:
                for key in ([shift] if level and shift not in keys else []) + [code]:
                    foreground(t)
                    try:
                        input_event('key', key, True, expected)
                    finally:
                        if key in keys:
                            acquired.append(key)
            finally:
                for key in reversed(acquired):
                    input_event('key', key, False)
    return True


def type_text(t, text, expected):
    # Refuse unsupported or already-held characters before any piece is sent;
    # a later refusal must not pretend earlier pieces were never dispatched.
    check(t, expected)
    for char in text:
        if expected != epoch or ended or closing:
            fail('CONTROL_STOPPED', 'Input was cancelled')
        found = (keycode('Return' if char == '\n' else 'Tab'), 0) if char in ('\n', '\t') else keys_ready().character(char)
        if found and found[0] in keys:
            raise ChordAlreadyHeld('INPUT_ALREADY_HELD', 'Typing cannot reuse an already held character key')
        if not found:
            if keys or buttons:
                rejected('UNSUPPORTED_ACTION', 'Release held input before typing characters through a separate virtual keyboard')
            if not wtype:
                rejected('UNSUPPORTED_ACTION', 'Install wtype for characters the current keyboard layout cannot reach')
    for piece in re.findall(r'[^\n\t]+|[\n\t]', text):
        check(t, expected)
        if piece in ('\n', '\t'):
            code = keycode('Return' if piece == '\n' else 'Tab')
            input_event('key', code, True, expected)
            input_event('key', code, False)
        elif type_direct(t, piece, expected):
            continue
        elif wtype:
            for char in piece:
                check(t, expected)
                value = execute_input(['wtype', '--', char], expected)
                if value.returncode:
                    fail('INPUT_REJECTED', 'wtype rejected the text: ' + (stderr(value) or stdout(value)).strip())
        else:
            fail('INVALID_TEXT', 'The current keyboard layout cannot type this text; install wtype for characters it cannot reach')


def move(at, t, expected):
    with input_lock:
        check(t, expected)
        move_pointer(int(at[0]), int(at[1]), expected)
        emit(dict(event=dict(type='cursor', visible=True, targetId=t['id'], x=int(at[0]), y=int(at[1]), space='logical')))


def describe(kind, t, action):
    """One line naming what the model is doing, for the user watching the bar."""
    name = t['name']
    verbs = dict(click='点击', double_click='双击', right_click='右键点击', move='移动指针',
                 mouse_down='按下', drag='拖拽', scroll='滚动', activate='激活')
    if kind in verbs:
        where = ''
        for keys in (('x', 'y'), ('fromX', 'fromY')):
            if action.get(keys[0]) is not None and action.get(keys[1]) is not None:
                where = ' (%s,%s)' % (action[keys[0]], action[keys[1]])
                break
        return '%s %s%s' % (verbs[kind], name, where)
    if kind == 'type_text':
        body = str(action.get('text', ''))
        return '键入 %d 个字符 → %s' % (len(body), name)
    if kind in ('press_key', 'key_down', 'key_up'):
        return '按键 %s → %s' % (action.get('key', ''), name)
    if kind in ('set_value', 'ax_press'):
        return '无障碍操作 %s' % name
    return '%s %s' % (kind, name)


def act(t, action, expected):
    t = resolve(t)
    check(t, expected, False)
    kind, mode = action['type'], action.get('inputMode', 'background')
    if mode not in ('background', 'foreground'):
        fail('INVALID_ACTION', 'inputMode must be background or foreground')
    report(describe(kind, t, action))
    reach = accessibility(t['pid'])
    if reach != 'application' and kind in ('set_value', 'ax_press'):
        rejected('UNSUPPORTED_ACTION',
                 ('Install python3-pyatspi to drive this window through accessibility objects'
                  if reach == 'client-unavailable' else 'This application publishes no accessibility tree')
                 + '; use coordinate clicks and keystrokes instead')
    if reach != 'application' and mode == 'background' and kind in ('click', 'scroll', 'hit_test'):
        rejected('FOREGROUND_REQUIRED',
                 'Hyprland offers no background input route without accessibility support: '
                 'ask the user, then repeat this action with inputMode=foreground')
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
        return accessibility_action(root, selected, action, lambda: check(t, expected, False), fail, input_receipt.dispatch)
    if kind != 'activate':
        if mode != 'foreground':
            rejected('FOREGROUND_REQUIRED', 'uinput is global input; obtain user permission, then focus the window and repeat with inputMode=foreground')
        if active_address() != t['windowId']:
            rejected('TARGET_NOT_ACTIVE', 'Explicitly focus the selected window before foreground input')
    if kind == 'activate':
        focus(t, expected)
    elif kind == 'hit_test':
        px, py = point(t, action)
        root = app_window(t)
        hit = root.queryComponent().getAccessibleAtPoint(px, py, pyatspi.DESKTOP_COORDS)
        if hit is None:
            fail('ELEMENT_NOT_FOUND', 'No accessibility element at this point in the selected window')
        verify_window(hit, root, fail)
        key = t['id'] + ':' + str(uuid.uuid4())
        elements[key] = hit
        return dict(element=dict(elementId=key, name=hit.name, role=hit.getRoleName()))
    elif kind == 'set_value':
        if not input_receipt.dispatch(element(t, action['elementId']).queryEditableText().setTextContents, str(action.get('value', action.get('text', '')))):
            fail('INPUT_REJECTED', 'Application rejected accessibility text input')
    elif kind == 'ax_press':
        a = element(t, action['elementId']).queryAction()
        if not a.nActions or not input_receipt.dispatch(a.doAction, 0):
            fail('ACTION_UNAVAILABLE', 'Element did not perform its action')
    elif kind == 'type_text':
        type_text(t, action.get('text', ''), expected)
    elif kind in ('key_down', 'key_up'):
        input_event('key', keycode(action['key']), kind == 'key_down', expected)
    elif kind == 'press_key':
        chord = key_chord(action['key'])
        with input_lock:
            check(t, expected)
            if any(key in keys for key in chord):
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
            move(point(t, action), t, expected)
        else:
            # Hyprland keeps its own wheel routing, so the pointer has to be inside.
            position, b = cursor_position(), t['bounds']
            if position is None or not (b['x'] <= position[0] < b['x'] + b['width'] and b['y'] <= position[1] < b['y'] + b['height']):
                fail('SCROLL_POINT_REQUIRED', 'Pointer is outside the selected window; specify a screenshot point or element')
        for axis, horizontal in [('deltaY', False), ('deltaX', True)]:
            amount = action.get(axis, 0)
            notches = min(100, int(abs(amount) / 100 + 0.99))
            if not notches:
                continue
            check(t, expected)
            # REL_WHEEL counts up for scrolling up; the request counts down for deltaY.
            # One event per notch keeps discrete clients in step with the X11 and
            # Windows backends, which also send separate wheel steps.
            step = '1' if (amount > 0) == horizontal else '-1'
            arguments = ['mousemove', '-w', '-x', step if horizontal else '0', '-y', '0' if horizontal else step]
            if not ydotool:
                fail('INPUT_UNAVAILABLE', 'Install ydotool and run ydotoold to send pointer and key input on Hyprland')
            for _ in range(notches):
                check(t, expected)
                value = execute_input(['ydotool', *arguments], expected)
                if value.returncode:
                    fail('INPUT_REJECTED', 'ydotool rejected the wheel event: ' + (stderr(value) or stdout(value)).strip())
    elif kind == 'mouse_up':
        input_event('button', button_index(action.get('button', 'left')), False)
    elif kind == 'drag':
        button = button_index(action.get('button', 'left'))
        samples = action.get('path')
        if samples is not None:
            if len(samples) < 2:
                fail('INVALID_ACTION', 'Drag requires at least two points')
            points = [point(t, dict(action, elementId=None, x=sample['x'], y=sample['y'])) for sample in samples]
        else:
            points = [point(t, dict(action, elementId=None, x=action['fromX'], y=action['fromY'])), point(t, action)]
        steps = max(1, 20 // (len(points) - 1))
        delay = .2 / ((len(points) - 1) * steps)
        move(points[0], t, expected)
        input_event('button', button, True, expected)
        for first, last in zip(points, points[1:]):
            for step in range(1, steps + 1):
                move((first[0] + (last[0] - first[0]) * step / steps, first[1] + (last[1] - first[1]) * step / steps), t, expected)
                time.sleep(delay)
        input_event('button', button, False)
    elif kind in ('move', 'click', 'double_click', 'right_click', 'mouse_down'):
        button = button_index(action.get('button', 'left'))
        move(point(t, action), t, expected)
        if kind != 'move':
            for _ in range(2 if kind == 'double_click' else 1):
                check(t, expected)
                input_event('button', button_index('right') if kind == 'right_click' else button, True, expected)
                if kind != 'mouse_down':
                    input_event('button', button_index('right') if kind == 'right_click' else button, False)
    else:
        fail('UNSUPPORTED_ACTION', kind)
    check(t, expected)
    # Stamp the same line again: the bar then reads "just now" instead of
    # counting from when a slow keystroke run started.
    report(describe(kind, t, action))
    return dict(performed=True, type=kind)


def permissions():
    return dict(sessionType='wayland', compositor='hyprland', dispatcher=dialect(), accessibility=pyatspi is not None,
                screenCapture='grim' if grim else False, postEvents='ydotool' if ydotool else False, listenEvents=False, permissionAction='none',
                dependency='Hyprland IPC (hyprctl) + grim + ydotool/uinput + wtype; Hyprland implements no xdg-desktop-portal RemoteDesktop',
                reason=None if grim and ydotool else 'Install grim and ydotool (with ydotoold running) to capture and control windows',
                monitors=[dict(rect, focused=bool(monitor.get('focused')), workspace=(monitor.get('activeWorkspace') or {}).get('id')) for rect, monitor in zip(desktops(), monitors())])


def perform(method, args, expected):
    global closing
    if method == 'hello':
        return dict(protocol=1, platform='linux', sessionType='wayland', compositor='hyprland', dispatcher=dialect(), monitors=len(hydrated))
    if method == 'permissions':
        return permissions()
    if method == 'openPermissionSettings':
        # The compositor grants no switchable permission: access follows from the
        # session running hyprctl, grim and an ydotoold uinput device.
        return dict(granted=bool(grim and ydotool), permissions=permissions(), permissionAction='none',
                    detail='Hyprland needs no portal dialog: install grim, ydotool (with ydotoold running) and wtype in the session that runs DSH.')
    if method == 'listTargets':
        return inventory()
    if method in ('release', 'close'):
        with input_lock:
            result = release()
            if result['released']:
                restore_isolation()
                report('会话结束，桌面已交还')
                notify('OpenCU 已结束操作，桌面已交还')
                stop_indicator()
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
    if method == 'away':
        return dict(away=away(args.get('relinquish') is True))
    t = resolve(args['reference'] if method in ('select', 'focus') else args['target'])
    if method == 'select':
        return t
    if method == 'focus':
        focus(t, expected)
        report('聚焦 %s' % t['name'])
        return resolve(t)
    if method == 'preview':
        return capture(t, True)
    if method == 'act':
        return act(t, args['action'], expected)
    if method == 'observe':
        options = args.get('options', {})
        result = dict(observationId=str(uuid.uuid4()), targetId=t['id'], identity=t['identity'], coordinateSpace='physical-screenshot-pixels',
                      userActivityMonitoring=dict(available=False, reason='Hyprland exposes no global input events to unprivileged clients'))
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
    input_receipt.begin()
    try:
        value = dict(id=request['id'], ok=True, result=perform(request['method'], request.get('params', {}), request['epoch']))
    except Exception as error:
        preserve = isinstance(error, ChordAlreadyHeld) or (getattr(error, 'details', None) or {}).get('inputDispatched') is False
        details = input_receipt.failure(error, release, preserve) if request['method'] == 'act' else dict(getattr(error, 'details', None) or {})
        value = dict(id=request['id'], ok=False, error=dict(code=getattr(error, 'code', 'NATIVE_FAILURE'), message=str(error), details=details))
    emit(value)


def read_commands():
    global epoch, ended
    try:
        for line in sys.stdin:
            request = json.loads(line)
            if request['method'] in ('release', 'close'):
                epoch += 1
                cancel_input_processes()
            request['epoch'] = epoch
            if request['method'] in ('preview', 'release', 'verify'):
                threading.Thread(target=reply, args=(request,), daemon=True).start()
            else:
                commands.put(request)
    finally:
        ended = True
        epoch += 1
        cancel_input_processes()
        try:
            release()
        finally:
            commands.put(None)


if os.path.exists(journal):
    with open(journal) as stream:
        saved = json.load(stream)
    keys.update(saved.get('keys', []))
    buttons.update(saved.get('buttons', []))
    if not release()['released']:
        fail('RELEASE_FAILED', 'Previous held input remains')
threading.Thread(target=read_commands, daemon=True).start()
threading.Thread(target=keep_alive, daemon=True).start()


def interrupted(signum, frame):
    """Let a signal end the session the same way a closed pipe does.

    The controlled window only returns to its own workspace through the cleanup
    below, so being killed by a restart script must not skip it.
    """
    global closing
    closing = True
    cancel_input_processes()
    commands.put(None)


for handled in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
    signal.signal(handled, interrupted)

try:
    while not closing:
        try:
            request = commands.get(timeout=0.5)
        except queue.Empty:
            continue
        if request is None or ended:
            break
        reply(request)
finally:
    with input_lock:
        try:
            if not release()['released']:
                sys.exit(2)
            restore_isolation()
        finally:
            stop_indicator()
    # ydotoold owns the device; failed releases remain in the durable journal.
