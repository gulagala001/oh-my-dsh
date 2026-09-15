Windows desktop behavior: actions use the selected foreground window. Reading a
window or its preview does not activate it. Mouse/keyboard intervention stops
control; wait for the user to resume before rebinding. Keep the desktop unlocked.
On Windows, super/meta/win mean the Windows key, not Command. Use ctrl+a for
Select All and ctrl+c/ctrl+v for clipboard shortcuts. Command/cmd and fn are not
Windows modifiers. Punctuation uses the target's keyboard layout. Ctrl+Alt+Delete
cannot be synthesized. Application discovery includes installed Windows Applications
folder entries and running application windows. getApp accepts an exact discovered
ID/name or a full .exe path, starts the application only when necessary, and binds
a window confirmed by application identity or executable path. Use an exact ID
and windowId when names or windows are ambiguous. Stale process/window references
are not relaunched. Stop releases control and leaves launched applications open.
Scrolling uses the selected UI Automation scroll area, or the nearest such area
at a screenshot point; controls without a readable scroll pattern report that
limitation. Windows cannot inject into a higher-privilege or secure desktop.
