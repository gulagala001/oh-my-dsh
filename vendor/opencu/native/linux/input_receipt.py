"""Track attempted input on the command thread, independently of release/read workers."""
import threading

_current = threading.local()


def begin():
    _current.dispatched = False


def dispatch(work, *args, **kwargs):
    # A failed transport or accessibility call may already have taken effect.
    _current.dispatched = True
    return work(*args, **kwargs)


def failure(error, release, preserve=False):
    details = dict(getattr(error, 'details', None) or {})
    dispatched = getattr(_current, 'dispatched', False) or details.get('inputDispatched') is True
    details['inputDispatched'] = dispatched
    if not preserve or dispatched:
        details['release'] = release()
    return details
