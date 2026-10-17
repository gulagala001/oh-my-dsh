import ctypes as C
import ctypes.util
import datetime
import select
import threading
import uuid


class Activity:
    """XInput2 raw events exclude XTEST devices and retain no key or text content."""
    def __init__(self):
        self.lock = threading.Lock()
        self.stopped = threading.Event()
        self.targets, self.latest = {}, {}
        self.sequence, self.available = 0, False
        self.occurrence, self.error = str(uuid.uuid4()), 'XInput2 listener is starting'
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def watch(self, target):
        with self.lock:
            self.targets[target['windowId']] = target['id']

    def read(self, target):
        with self.lock:
            result = dict(userActivityMonitoring=dict(available=self.available, reason=self.error))
            if target['id'] in self.latest:
                result['userActivity'] = self.latest[target['id']]
            return result

    def close(self):
        self.stopped.set()
        self.thread.join(.5)

    def run(self):
        P, I, U = C.c_void_p, C.c_int, C.c_ulong

        def bind(lib, name, result, *args):
            fn = getattr(lib, name)
            fn.restype, fn.argtypes = result, args
            return fn

        class Cookie(C.Structure):
            _fields_ = [('type', I), ('serial', U), ('send_event', I), ('display', P), ('extension', I), ('evtype', I), ('cookie', C.c_uint), ('data', P)]

        class Event(C.Union):
            _fields_ = [('cookie', Cookie), ('pad', C.c_long * 24)]

        class Raw(C.Structure):
            _fields_ = [('type', I), ('serial', U), ('send_event', I), ('display', P), ('extension', I), ('evtype', I), ('time', U), ('deviceid', I), ('sourceid', I), ('detail', I), ('flags', I)]

        class Mask(C.Structure):
            _fields_ = [('deviceid', I), ('mask_len', I), ('mask', C.POINTER(C.c_ubyte))]

        class Device(C.Structure):
            _fields_ = [('deviceid', I), ('name', C.c_char_p), ('use', I), ('attachment', I), ('enabled', I), ('num_classes', I), ('classes', P)]

        display = None
        try:
            x = C.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
            xi = C.CDLL(ctypes.util.find_library('Xi') or 'libXi.so.6')
            bind(x, 'XOpenDisplay', P, C.c_char_p)
            bind(x, 'XCloseDisplay', I, P)
            bind(x, 'XDefaultRootWindow', U, P)
            bind(x, 'XConnectionNumber', I, P)
            bind(x, 'XQueryExtension', I, P, C.c_char_p, C.POINTER(I), C.POINTER(I), C.POINTER(I))
            bind(x, 'XInternAtom', U, P, C.c_char_p, I)
            bind(x, 'XGetWindowProperty', I, P, U, U, C.c_long, C.c_long, I, U, C.POINTER(U), C.POINTER(I), C.POINTER(U), C.POINTER(U), C.POINTER(P))
            bind(x, 'XFree', I, P)
            bind(x, 'XPending', I, P)
            bind(x, 'XNextEvent', I, P, C.POINTER(Event))
            bind(x, 'XGetEventData', I, P, C.POINTER(Cookie))
            bind(x, 'XFreeEventData', None, P, C.POINTER(Cookie))
            bind(x, 'XFlush', I, P)
            bind(xi, 'XIQueryVersion', I, P, C.POINTER(I), C.POINTER(I))
            bind(xi, 'XISelectEvents', I, P, U, C.POINTER(Mask), I)
            bind(xi, 'XIQueryDevice', C.POINTER(Device), P, I, C.POINTER(I))
            bind(xi, 'XIFreeDeviceInfo', None, C.POINTER(Device))
            display = x.XOpenDisplay(None)
            if not display:
                raise RuntimeError('X11 rejected the activity connection')
            opcode, first_event, first_error = I(), I(), I()
            if not x.XQueryExtension(display, b'XInputExtension', C.byref(opcode), C.byref(first_event), C.byref(first_error)):
                raise RuntimeError('XInput2 is unavailable')
            major, minor = I(2), I(0)
            if xi.XIQueryVersion(display, C.byref(major), C.byref(minor)) != 0:
                raise RuntimeError('XInput2 version 2 is required')
            root = x.XDefaultRootWindow(display)
            bits = (C.c_ubyte * 2)(0, 0xa0)  # XI_RawKeyPress and XI_RawButtonPress.
            mask = Mask(1, 2, bits)  # XIAllMasterDevices.
            if xi.XISelectEvents(display, root, C.byref(mask), 1) != 0:
                raise RuntimeError('XInput2 rejected raw event subscription')
            active_atom = x.XInternAtom(display, b'_NET_ACTIVE_WINDOW', 0)
            x.XFlush(display)
            with self.lock:
                self.available, self.error = True, None
            while not self.stopped.is_set():
                if not x.XPending(display):
                    select.select([x.XConnectionNumber(display)], [], [], .25)
                    continue
                event = Event()
                x.XNextEvent(display, C.byref(event))
                cookie = event.cookie
                if cookie.type != 35 or cookie.extension != opcode.value or not x.XGetEventData(display, C.byref(cookie)):
                    continue
                try:
                    if cookie.evtype not in (13, 15):
                        continue
                    raw = C.cast(cookie.data, C.POINTER(Raw)).contents
                    count = I()
                    devices = xi.XIQueryDevice(display, raw.sourceid, C.byref(count))
                    try:
                        physical = bool(devices and count.value and b'xtest' not in (devices[0].name or b'').lower())
                    finally:
                        if devices:
                            xi.XIFreeDeviceInfo(devices)
                    if not physical:
                        continue
                    actual, form, count, rest, data = U(), I(), U(), U(), P()
                    x.XGetWindowProperty(display, root, active_atom, 0, 1, 0, 0, C.byref(actual), C.byref(form), C.byref(count), C.byref(rest), C.byref(data))
                    try:
                        window = C.cast(data, C.POINTER(U))[0] if data and count.value and form.value == 32 else 0
                    finally:
                        if data:
                            x.XFree(data)
                    with self.lock:
                        target = self.targets.get(window)
                        if target:
                            self.sequence += 1
                            self.latest[target] = dict(documentId=self.occurrence, sequence=self.sequence, kind='keyboard' if cookie.evtype == 13 else 'wheel' if raw.detail in (4, 5, 6, 7) else 'pointerdown', at=datetime.datetime.now(datetime.timezone.utc).isoformat())
                finally:
                    x.XFreeEventData(display, C.byref(cookie))
        except Exception as error:
            with self.lock:
                self.error = str(error)
        finally:
            with self.lock:
                self.available = False
            if display:
                x.XCloseDisplay(display)
