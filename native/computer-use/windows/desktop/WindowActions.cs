using System.Text.Json;
using System.Windows.Automation;
using System.Windows.Automation.Text;

internal sealed partial class WindowObservation
{
    private sealed class Snapshot(WindowTarget target)
    {
        internal readonly WindowTarget Target = target;
        internal readonly Dictionary<string, AutomationElement> Elements = new();
        internal int ImageWidth, ImageHeight;
    }
    private readonly Dictionary<string, Snapshot> snapshots = new();
    private readonly WindowsInput input;
    private WindowsClipboard? clipboard;
    private static string Key(WindowTarget target) => target.process_identity + ":" + target.window_id;
    private Snapshot NewSnapshot(WindowTarget target)
    {
        var snapshot = new Snapshot(target);
        if (snapshots.TryGetValue(Key(target), out var prior) && prior.Target.bounds == target.bounds && prior.Target.dpi == target.dpi) { snapshot.ImageWidth = prior.ImageWidth; snapshot.ImageHeight = prior.ImageHeight; }
        snapshots[Key(target)] = snapshot; return snapshot;
    }
    internal Task RecordFrame(WindowTarget target, WindowFrame frame) => Run(() =>
    {
        if (roots.ContainsKey(target.window_id)) _ = ValidateRoot(target);
        if (!snapshots.TryGetValue(Key(target), out var snapshot) || snapshot.Target.bounds != target.bounds || snapshot.Target.dpi != target.dpi) snapshot = NewSnapshot(target);
        snapshot.ImageWidth = frame.Width; snapshot.ImageHeight = frame.Height; return true;
    });
    internal Task CloseInput() => Run(() => { RestoreClipboard(); input.Close(); snapshots.Clear(); return true; });
    private void RestoreClipboard()
    {
        if (clipboard is null) return;
        clipboard.Restore().GetAwaiter().GetResult(); clipboard.Dispose(); clipboard = null;
    }
    private static string[] Actions(AutomationElement element)
    {
        var supported = element.GetSupportedPatterns().ToHashSet(); var actions = new List<string>();
        if (supported.Contains(InvokePattern.Pattern)) actions.Add("press");
        if (supported.Contains(TogglePattern.Pattern)) actions.Add("toggle");
        if (supported.Contains(SelectionItemPattern.Pattern)) actions.Add("select");
        if (supported.Contains(ExpandCollapsePattern.Pattern)) actions.AddRange(["expand", "collapse"]);
        return actions.ToArray();
    }
    private AutomationElement Resolve(Snapshot snapshot, string reference)
    {
        if (!snapshot.Elements.TryGetValue(reference, out var element)) throw new NativeFailure("STALE_ELEMENT", "The element is not in this connection's latest observation");
        var root = ValidateRoot(snapshot.Target);
        var parent = element;
        for (int depth = 0; parent is not null && depth < 64; depth++)
        {
            if (Automation.Compare(parent, root))
            {
                if (!element.Current.IsEnabled) throw new NativeFailure("ELEMENT_DISABLED", "The observed control is disabled");
                return element;
            }
            parent = TreeWalker.ControlViewWalker.GetParent(parent);
        }
        throw new NativeFailure("STALE_ELEMENT", "The control no longer belongs to the selected window");
    }
    internal Task<object> Act(string method, WindowTarget target, JsonElement args, CancellationToken token) => Run(() =>
    {
        token.ThrowIfCancellationRequested();
        if (clipboard is not null) throw new NativeFailure("CLIPBOARD_RESTORE_PENDING", "The previous clipboard operation has not finished cleaning up; retry Stop");
        if (!snapshots.TryGetValue(Key(target), out var snapshot)) throw new NativeFailure("OBSERVATION_REQUIRED", "Observe this window on the controlling connection before sending input");
        if (snapshot.Target.bounds != target.bounds || snapshot.Target.dpi != target.dpi) throw new NativeFailure("WINDOW_MOVED", "The window geometry or DPI changed since observation; observe again");
        // Keyboard and coordinates also validate any previously observed UIA
        // root. Screenshot-only use must not require an accessible provider.
        if (roots.ContainsKey(target.window_id)) _ = ValidateRoot(target);
        string? reference = args.TryGetProperty("element_token", out var elementToken) ? elementToken.GetString() : null;
        AutomationElement? element = reference is not null ? Resolve(snapshot, reference) : null;
        if (method is not ("click" or "press_key" or "type_text" or "set_value" or "select_text" or "scroll" or "drag" or "paste")) throw new NativeFailure("UNSUPPORTED_CAPABILITY", "This Windows action has not been implemented");
        // Resolve and validate arguments before activating a window or claiming
        // the desktop. In particular malformed text cannot cause partial typing.
        WindowsInputEvent[]? chord = method == "press_key" ? WindowsInputEvents.Chord(args.GetProperty("key").GetString() ?? "", args.GetProperty("modifiers").EnumerateArray().Select(value => value.GetString() ?? ""), character => input.Translate(target, character), input.Tag) : null;
        string? text = method is "type_text" or "set_value" or "select_text" or "paste" ? args.GetProperty(method == "set_value" ? "value" : "text").GetString() ?? "" : null;
        if (method == "type_text") WindowsInputEvents.ValidateText(text!);
        int count = args.TryGetProperty("count", out var countValue) ? countValue.GetInt32() : 1;
        if (method == "click" && count < 1) throw new NativeFailure("INVALID_ARGUMENT", "Click count must be positive");
        string button = args.TryGetProperty("button", out var buttonValue) ? buttonValue.GetString() ?? "left" : "left";
        WindowsInputEvent[]? buttons = method == "click" ? WindowsInputEvents.Click(button, input.Tag) : null;
        string? action = args.TryGetProperty("action", out var actionValue) ? actionValue.GetString() : null;
        (int X, int Y)? point = null;
        (int X, int Y) MapPoint(string xKey, string yKey)
        {
            if (snapshot.ImageWidth == 0 || snapshot.ImageHeight == 0) throw new NativeFailure("SCREENSHOT_REQUIRED", "Capture this window before using image coordinates");
            double x = args.GetProperty(xKey).GetDouble(), y = args.GetProperty(yKey).GetDouble();
            if (!double.IsFinite(x) || !double.IsFinite(y) || x < 0 || y < 0 || x >= snapshot.ImageWidth || y >= snapshot.ImageHeight) throw new NativeFailure("INVALID_COORDINATE", "Point is outside the latest screenshot");
            return (target.bounds.x + (int)Math.Floor(x * target.bounds.width / snapshot.ImageWidth), target.bounds.y + (int)Math.Floor(y * target.bounds.height / snapshot.ImageHeight));
        }
        if (method is "click" or "scroll" && element is null)
        {
            point = MapPoint("x", "y");
        }
        var from = method == "drag" ? MapPoint("from_x", "from_y") : default;
        var to = method == "drag" ? MapPoint("to_x", "to_y") : default;
        input.Begin(target, token);
        try
        {
            if (method == "paste")
            {
                var focused = AutomationElement.FocusedElement;
                var root = AutomationElement.FromHandle(new IntPtr(target.window_id)); var parent = focused; bool inside = false;
                for (int i = 0; parent is not null && i < 64; i++) { if (Automation.Compare(parent, root)) { inside = true; break; } parent = TreeWalker.ControlViewWalker.GetParent(parent); }
                if (!inside) throw new NativeFailure("FOCUS_REQUIRED", "Focus a text control in the selected window before pasting");
                string? before = ReadValue(focused); string? selection = ReadSelection(focused);
                string? html = args.TryGetProperty("html", out var htmlValue) ? htmlValue.GetString() : null;
                clipboard = new WindowsClipboard();
                try
                {
                    clipboard.Publish(text!, html, target.pid, token).GetAwaiter().GetResult();
                    long targetReads = clipboard.TargetReads;
                    input.Send(target, WindowsInputEvents.Chord("v", ["ctrl"], character => input.Translate(target, character), input.Tag), token);
                    bool consumed = false;
                    var deadline = Environment.TickCount64 + 3000;
                    do
                    {
                        input.CheckUser(token);
                        if (!clipboard.IsOwner().GetAwaiter().GetResult()) throw new NativeFailure("CLIPBOARD_CHANGED", "The clipboard changed during paste; the newer clipboard was kept. Check the target before retrying");
                        long requested = clipboard.LastRead;
                        if (requested > 0 && ((before is not null && ReadValue(focused) != before) || (selection is not null && ReadSelection(focused) != selection) || (before is null && clipboard.TargetReads > targetReads && Environment.TickCount64 - clipboard.LastTargetRead > 100))) { consumed = true; break; }
                        token.WaitHandle.WaitOne(20);
                    } while (Environment.TickCount64 < deadline);
                    if (!consumed) throw new NativeFailure("PASTE_UNCONFIRMED", "The application has not confirmed reading the paste; inspect the target before retrying");
                }
                finally { RestoreClipboard(); }
            }
            else if (method == "drag")
            {
                input.RequirePoint(target, from.X, from.Y, token); input.RequirePoint(target, to.X, to.Y, token);
                input.Send(target, [input.Move(from.X, from.Y)], token);
                input.StartDragRecovery(token);
                try
                {
                    input.RequirePoint(target, from.X, from.Y, token);
                    input.Send(target, [WindowsInputEvent.Mouse(2, 0, 0, 0, input.Tag)], token);
                    for (int i = 1; i <= 25; i++)
                    {
                        token.WaitHandle.WaitOne(20);
                        int x = from.X + (int)Math.Round((to.X - from.X) * i / 25d), y = from.Y + (int)Math.Round((to.Y - from.Y) * i / 25d);
                        input.RequirePoint(target, x, y, token); input.Send(target, [input.Move(x, y)], token);
                    }
                }
                finally { input.EndDragRecovery(); }
            }
            else if (method == "press_key") input.Send(target, chord!, token);
            else if (method == "type_text") foreach (var packet in WindowsInputEvents.Text(text!, input.Tag)) input.Send(target, packet, token);
            else if (method == "set_value")
            {
                if (element is null || !element.TryGetCurrentPattern(ValuePattern.Pattern, out var raw) || ((ValuePattern)raw).Current.IsReadOnly) throw new NativeFailure("ACTION_UNAVAILABLE", "The observed element does not support setting its value");
                ((ValuePattern)raw).SetValue(text!);
                // Controlled editors may accept a UIA assignment and then undo
                // it asynchronously. Match the existing Mac retention check.
                for (int i = 0; i < 5; i++)
                {
                    if (i > 0) token.WaitHandle.WaitOne(100);
                    input.Check(target, token);
                    var same = Resolve(snapshot, reference!);
                    if (!same.TryGetCurrentPattern(ValuePattern.Pattern, out var pattern) || ((ValuePattern)pattern).Current.Value != text) throw new NativeFailure("VALUE_NOT_RETAINED", "The application did not retain the requested value; no fallback input was sent");
                }
            }
            else if (method == "select_text") SelectText(element ?? throw new NativeFailure("ELEMENT_REQUIRED", "Text selection requires an observed element"), text!, args, token);
            else if (method == "click")
            {
                if (action is not null)
                {
                    if (element is null || !Actions(element).Contains(action)) throw new NativeFailure("ACTION_UNAVAILABLE", "Use an action from the current element observation");
                    Perform(element, action);
                }
                else if (element is not null && count == 1 && button == "left" && Actions(element).FirstOrDefault(name => name is "press" or "toggle" or "select") is { } semantic) Perform(element, semantic);
                else
                {
                    if (element is not null)
                    {
                        if (!element.TryGetClickablePoint(out var clicked)) throw new NativeFailure("POINT_UNAVAILABLE", "The observed element has no clickable point");
                        point = ((int)Math.Floor(clicked.X), (int)Math.Floor(clicked.Y));
                    }
                    var location = point!.Value;
                    input.RequirePoint(target, location.X, location.Y, token);
                    for (int i = 0; i < count; i++)
                    {
                        input.RequirePoint(target, location.X, location.Y, token);
                        input.Send(target, [input.Move(location.X, location.Y), .. buttons!], token);
                        if (i + 1 < count) token.WaitHandle.WaitOne(40);
                    }
                }
            }
            else if (method == "scroll")
            {
                string direction = args.GetProperty("direction").GetString() ?? "";
                double amount = args.TryGetProperty("amount", out var amountValue) ? amountValue.GetDouble() : 1;
                if (!double.IsFinite(amount) || amount <= 0 || amount > 1000 || direction is not ("up" or "down" or "left" or "right")) throw new NativeFailure("INVALID_ARGUMENT", "Scroll requires a direction and a positive page amount no greater than 1000");
                if (element is null && point is { } scrollPoint)
                {
                    input.RequirePoint(target, scrollPoint.X, scrollPoint.Y, token);
                    var candidate = AutomationElement.FromPoint(new System.Windows.Point(scrollPoint.X, scrollPoint.Y));
                    var root = AutomationElement.FromHandle(new IntPtr(target.window_id));
                    var chain = new List<AutomationElement>();
                    for (int i = 0; candidate is not null && i < 64; i++) { chain.Add(candidate); if (Automation.Compare(candidate, root)) break; candidate = TreeWalker.ControlViewWalker.GetParent(candidate); }
                    if (chain.Count > 0 && Automation.Compare(chain[^1], root)) element = chain.FirstOrDefault(item => item.TryGetCurrentPattern(ScrollPattern.Pattern, out _));
                }
                if (element is not null)
                {
                    if (!element.TryGetCurrentPattern(ScrollPattern.Pattern, out var raw)) throw new NativeFailure("ACTION_UNAVAILABLE", "The selected element does not support structured scrolling");
                    var pattern = (ScrollPattern)raw; var current = pattern.Current;
                    bool horizontal = direction is "left" or "right";
                    double view = horizontal ? current.HorizontalViewSize : current.VerticalViewSize, position = horizontal ? current.HorizontalScrollPercent : current.VerticalScrollPercent;
                    if (position < 0 || view >= 100) throw new NativeFailure("ACTION_UNAVAILABLE", "The selected control cannot scroll in that direction");
                    double next = Math.Clamp(position + (direction is "up" or "left" ? -1 : 1) * amount * view / (100 - view) * 100, 0, 100);
                    input.Check(target, token); pattern.SetScrollPercent(horizontal ? next : ScrollPattern.NoScroll, horizontal ? ScrollPattern.NoScroll : next);
                }
                else throw new NativeFailure("ACTION_UNAVAILABLE", "Windows page scrolling currently requires an observed scrollable element");
            }
            input.CheckUser(token);
            return NativeProtocol.Result(new { status = "ok" });
        }
        finally { input.ReleaseInput(); }
    });
    private static void Perform(AutomationElement element, string action)
    {
        switch (action)
        {
            case "press": ((InvokePattern)element.GetCurrentPattern(InvokePattern.Pattern)).Invoke(); break;
            case "toggle": ((TogglePattern)element.GetCurrentPattern(TogglePattern.Pattern)).Toggle(); break;
            case "select": ((SelectionItemPattern)element.GetCurrentPattern(SelectionItemPattern.Pattern)).Select(); break;
            case "expand": ((ExpandCollapsePattern)element.GetCurrentPattern(ExpandCollapsePattern.Pattern)).Expand(); break;
            case "collapse": ((ExpandCollapsePattern)element.GetCurrentPattern(ExpandCollapsePattern.Pattern)).Collapse(); break;
            default: throw new NativeFailure("ACTION_UNAVAILABLE", "Use the corresponding value or text operation for this action");
        }
    }
    private static string? ReadValue(AutomationElement element)
    {
        if (element.Current.IsPassword) return null;
        if (element.TryGetCurrentPattern(ValuePattern.Pattern, out var value)) return ((ValuePattern)value).Current.Value;
        if (element.TryGetCurrentPattern(TextPattern.Pattern, out var text)) return ((TextPattern)text).DocumentRange.GetText(-1);
        return null;
    }
    private static string? ReadSelection(AutomationElement element) => element.TryGetCurrentPattern(TextPattern.Pattern, out var text) ? string.Join("\0", ((TextPattern)text).GetSelection().Select(range => range.GetText(-1))) : null;
    private static void SelectText(AutomationElement element, string text, JsonElement args, CancellationToken token)
    {
        if (text.Length == 0 || !element.TryGetCurrentPattern(TextPattern.Pattern, out var raw)) throw new NativeFailure("ACTION_UNAVAILABLE", "Text selection requires nonempty text in a supported text control");
        string kind = args.TryGetProperty("selection_type", out var selection) ? selection.GetString() ?? "select" : "select";
        if (kind is not ("select" or "before" or "after")) throw new NativeFailure("INVALID_ARGUMENT", "selection_type must be select, before or after");
        string? prefix = args.TryGetProperty("prefix", out var pre) ? pre.GetString() : null, suffix = args.TryGetProperty("suffix", out var post) ? post.GetString() : null;
        var document = ((TextPattern)raw).DocumentRange; var remaining = document.Clone(); TextPatternRange? match = null;
        for (int i = 0; ; i++)
        {
            token.ThrowIfCancellationRequested();
            if (i == 2000) throw new NativeFailure("TEXT_AMBIGUOUS", "Too many matching text ranges; choose a more specific text and context");
            var found = remaining.FindText(text, false, false); if (found is null) break;
            var before = document.Clone(); before.MoveEndpointByRange(TextPatternRangeEndpoint.End, found, TextPatternRangeEndpoint.Start);
            var after = document.Clone(); after.MoveEndpointByRange(TextPatternRangeEndpoint.Start, found, TextPatternRangeEndpoint.End);
            if ((prefix is null || before.GetText(-1).EndsWith(prefix, StringComparison.Ordinal)) && (suffix is null || after.GetText(suffix.Length).StartsWith(suffix, StringComparison.Ordinal)))
            { if (match is not null) throw new NativeFailure("TEXT_AMBIGUOUS", "Text occurs more than once; provide its prefix or suffix"); match = found.Clone(); }
            if (found.CompareEndpoints(TextPatternRangeEndpoint.End, remaining, TextPatternRangeEndpoint.Start) <= 0) throw new NativeFailure("TEXT_UNREADABLE", "The text provider did not advance its range");
            remaining.MoveEndpointByRange(TextPatternRangeEndpoint.Start, found, TextPatternRangeEndpoint.End);
        }
        if (match is null) throw new NativeFailure("TEXT_NOT_FOUND", "The requested text and context were not found");
        if (kind == "before") match.MoveEndpointByRange(TextPatternRangeEndpoint.End, match, TextPatternRangeEndpoint.Start);
        if (kind == "after") match.MoveEndpointByRange(TextPatternRangeEndpoint.Start, match, TextPatternRangeEndpoint.End);
        match.Select();
    }
}
