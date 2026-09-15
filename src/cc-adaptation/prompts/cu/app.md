# Native app API

Use the App returned by cua.getApp. Actions always address that bound window.
Without an explicit windowId, getApp prefers a visible modal window, then the
focused window, then a single standard window. If the choice remains ambiguous,
use the window IDs reported in the error with getApp({id: bundleId, windowId}).
```ts
interface App extends Target {
  paste(text: string, options?: {format?: 'text' | 'md' | 'html'}): Promise<void>;
  scroll(idOrPoint: number | Point, direction: 'up' | 'down' | 'left' | 'right', pages?: number): Promise<void>;
  selectText(elementId: number, text: string, options?: {
    prefix?: string; suffix?: string; selectionType?: 'select' | 'before' | 'after'
  }): Promise<void>;
  performSecondaryAction(elementId: number, observedActionName: string): Promise<void>;
}
```
Native element IDs stay stable for the same control across observations. Removed
or replaced controls and released targets invalidate their old IDs. Read the
current state after UI changes; do not infer new controls from old positions.
Native AX observations return changes by default: ~ changed or moved, + added,
and removed element IDs. The focused element is always reported when available.
Use {disableDiffing:true} for a complete tree, including when searching for an
unchanged control in the returned string. {emit:false} suppresses display but
still returns the observation and advances that window's difference baseline.
Select repeated text with unique prefix/suffix context. Invoke only secondary actions listed for the
element in AX state. super is Command on macOS; e.g. await app.pressKey('super+a').
Native scrolling addresses the selected scroll area or screenshot point; pages
may be fractional. paste inserts at the focused input's selection, with plain
text by default or rendered Markdown/HTML when requested. It preserves the
previous clipboard; a newer copy during paste is kept and reported as an
interruption. Check the app after a paste error before retrying. An app may
finish reading a submitted paste while stop waits; it cannot be retracted.

After switching windows, verify focus and the target’s current state before
typing. A previous window’s element IDs and screenshot are not interchangeable.
Native key chords accept aliases such as Control_L, Shift_L, Super_L, Page_Down,
and KP_0; spaces around + are ignored. Uppercase letters and shifted punctuation
preserve Shift. A chord must contain a non-modifier key. typeText sends keyboard
input at the focused control: newline presses Return and tab presses Tab, so an
application may submit or move focus. Use setValue for direct value replacement,
or paste when text should be inserted without those key actions. Element clicks
honor mouseButton and clickCount; middle clicks and multiple clicks use actual
pointer events at the observed element's visible input surface.
