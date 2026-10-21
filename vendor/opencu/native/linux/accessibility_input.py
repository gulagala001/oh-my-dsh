"""Target-local AT-SPI actions; never synthesize global input or grab focus."""


def verify_window(element, root, fail):
    current = element
    for _ in range(100):
        if current == root:
            return element
        if current is None:
            break
        current = current.parent
    fail('TARGET_IDENTITY_CHANGED', 'Accessibility element is outside the selected window')


def perform(root, element, action, check, fail):
    verify_window(element, root, fail)
    check()
    kind = action['type']
    try:
        if kind == 'set_value':
            accepted = element.queryEditableText().setTextContents(str(action.get('value', action.get('text', ''))))
        elif kind in ('click', 'ax_press'):
            if kind == 'click' and action.get('button', 'left') != 'left':
                fail('FOREGROUND_REQUIRED', 'AT-SPI has no matching background right or middle click')
            interface = element.queryAction()
            names = [interface.getName(index).lower() for index in range(interface.nActions)]
            index = next((names.index(name) for name in ('click', 'press', 'activate', 'toggle', 'select') if name in names), None)
            if index is None:
                fail('FOREGROUND_REQUIRED', 'Element has no matching accessibility action; no global input was sent')
            accepted = interface.doAction(index)
        elif kind == 'scroll':
            dx, dy = action.get('deltaX', 0), action.get('deltaY', 0)
            if dx and dy:
                fail('BACKGROUND_ACTION_UNAVAILABLE', 'AT-SPI scrolling supports one named direction per action')
            if not dx and not dy:
                return dict(performed=True, type=kind, inputMode='background', delivery='no-op')
            direction = ('right' if dx > 0 else 'left') if dx else ('down' if dy > 0 else 'up')
            current, selected = element, None
            for _ in range(100):
                if current is None:
                    break
                try:
                    interface = current.queryAction()
                    for index in range(interface.nActions):
                        name = interface.getName(index).lower().replace('_', ' ').replace('-', ' ')
                        if name in ('scroll ' + direction, 'page ' + direction):
                            selected = interface, index
                            break
                except NotImplementedError:
                    pass
                if selected or current == root:
                    break
                current = current.parent
            else:
                fail('TARGET_IDENTITY_CHANGED', 'Scroll ancestor chain did not reach the selected window')
            if not selected:
                fail('FOREGROUND_REQUIRED', 'Element has no named AT-SPI scroll action; no global wheel event was sent')
            verify_window(current, root, fail)
            check()
            accepted = selected[0].doAction(selected[1])
        else:
            fail('FOREGROUND_REQUIRED', 'This action requires explicit foreground input permission')
    except NotImplementedError:
        fail('BACKGROUND_ACTION_UNAVAILABLE', 'Application does not implement this AT-SPI interface')
    if not accepted:
        fail('INPUT_REJECTED', 'Application rejected the accessibility action')
    check()
    return dict(performed=True, type=kind, inputMode='background', delivery='accessibility-acknowledged', effectVerified=False,
                **({'scrollUnit': 'application-defined named direction; pixel magnitude is not supported'} if kind == 'scroll' else {}))
