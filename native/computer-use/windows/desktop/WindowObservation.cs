using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Automation;

// UIA objects remain on one long-lived MTA. In particular, no provider call
// runs on the stdin reader, a WPF UI thread or WGC's FrameArrived callback.
internal sealed partial class WindowObservation : IDisposable
{
    private readonly BlockingCollection<Action> work = new();
    private readonly Thread worker;
    private readonly Dictionary<long, AutomationElement> roots = new();
    internal WindowObservation(Action<object>? pointer = null)
    {
        input = new WindowsInput(pointer);
        worker = new Thread(() => { foreach (var action in work.GetConsumingEnumerable()) action(); }) { IsBackground = true, Name = "OhMyDsh UI Automation" };
        worker.SetApartmentState(ApartmentState.MTA); worker.Start();
    }
    private Task<T> Run<T>(Func<T> action)
    {
        var result = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        work.Add(() => { try { result.SetResult(action()); } catch (Exception error) { result.SetException(error); } });
        return result.Task;
    }
    internal Task<Dictionary<string, object?>> Read(WindowTarget target, CancellationToken token, bool actionable = false) => Run(() => Observe(target, token, actionable));
    internal Task BeforeLaunch(CancellationToken token) => Run(() => { input.BeginLaunch(token); return true; });
    internal Task AfterLaunch(CancellationToken token) => Run(() => { input.CheckUser(token); return true; });
    private Dictionary<string, object?> Observe(WindowTarget target, CancellationToken token, bool actionable)
    {
        token.ThrowIfCancellationRequested(); WindowCatalog.RequireInteractive();
        _ = WindowCatalog.Read(target.pid, target.window_id, target.process_identity);
        var root = AutomationElement.FromHandle(new IntPtr(target.window_id));
        if (root.Current.ProcessId != target.pid) throw new NativeFailure("STALE_WINDOW", "The accessibility root belongs to a different process");
        if (roots.TryGetValue(target.window_id, out var previous) && !Automation.Compare(previous, root)) throw new NativeFailure("STALE_WINDOW", "The window accessibility root was replaced; bind its current window");
        roots[target.window_id] = root;
        var snapshot = NewSnapshot(target);
        var elements = new List<Dictionary<string, object?>>();
        bool truncated = false, unreadable = false; int? focused = null;
        var pending = new Stack<(AutomationElement Element, int Depth)>(); pending.Push((root, 0));
        var clock = Stopwatch.StartNew();
        var cache = new CacheRequest { TreeScope = TreeScope.Element, AutomationElementMode = AutomationElementMode.Full };
        foreach (var property in new[] { AutomationElement.ControlTypeProperty, AutomationElement.NameProperty, AutomationElement.IsEnabledProperty, AutomationElement.IsPasswordProperty, AutomationElement.HasKeyboardFocusProperty, AutomationElement.BoundingRectangleProperty, AutomationElement.AutomationIdProperty, ValuePattern.ValueProperty }) cache.Add(property);
        while (pending.TryPop(out var next))
        {
            token.ThrowIfCancellationRequested();
            if (elements.Count >= 2000 || clock.ElapsedMilliseconds > 2500) { truncated = true; break; }
            if (next.Depth > 40) { truncated = true; continue; }
            try
            {
                var element = next.Element.GetUpdatedCache(cache); var current = element.Cached;
                int index = elements.Count;
                var rectangle = current.BoundingRectangle;
                var row = new Dictionary<string, object?>
                {
                    ["element_index"] = index, ["element_id"] = target.process_identity + ":" + string.Join(".", element.GetRuntimeId()),
                    ["depth"] = next.Depth, ["role"] = current.ControlType.ProgrammaticName.Replace("ControlType.", ""),
                    ["label"] = Limit(current.Name), ["enabled"] = current.IsEnabled, ["automation_id"] = current.AutomationId,
                    ["actions"] = actionable ? Actions(element) : Array.Empty<string>()
                };
                if (actionable) { string reference = Guid.NewGuid().ToString("N"); row["element_token"] = reference; snapshot.Elements[reference] = element; }
                if (!rectangle.IsEmpty && double.IsFinite(rectangle.Width) && double.IsFinite(rectangle.Height)) row["bounds"] = new { x = rectangle.X, y = rectangle.Y, width = rectangle.Width, height = rectangle.Height };
                if (current.IsPassword) row["value"] = "[password]";
                else if (element.GetCachedPropertyValue(ValuePattern.ValueProperty, true) is string value) row["value"] = Limit(value);
                if (current.HasKeyboardFocus) focused = index;
                elements.Add(row);
                // Traverse a bounded number of siblings without materializing
                // an unbounded provider subtree in one FindAll request.
                var children = new List<AutomationElement>();
                var child = TreeWalker.ControlViewWalker.GetFirstChild(element);
                while (child is not null)
                {
                    token.ThrowIfCancellationRequested();
                    if (children.Count + elements.Count + pending.Count >= 2000 || clock.ElapsedMilliseconds > 2500) { truncated = true; break; }
                    children.Add(child); child = TreeWalker.ControlViewWalker.GetNextSibling(child);
                }
                for (int i = children.Count - 1; i >= 0; i--) pending.Push((children[i], next.Depth + 1));
            }
            catch (Exception error) when (error is ElementNotAvailableException or COMException or InvalidOperationException) { unreadable = true; }
        }
        token.ThrowIfCancellationRequested();
        WindowCatalog.RequireInteractive();
        if (WindowCatalog.Read(target.pid, target.window_id, target.process_identity).bounds != target.bounds) throw new NativeFailure("WINDOW_MOVED", "The window moved or resized during observation; capture it again");
        return new Dictionary<string, object?> { ["window_id"] = target.window_id, ["window_title"] = target.title, ["pid"] = target.pid, ["process_identity"] = target.process_identity, ["app_id"] = target.app_id, ["app_name"] = target.app_name, ["bounds"] = target.bounds, ["elements"] = elements, ["focused_element_index"] = focused, ["truncated"] = truncated, ["unreadable"] = unreadable };
    }
    private static string Limit(string value) => value.Length <= 8192 ? value : value[..8192] + " [truncated]";
    public void Dispose() { CloseInput().GetAwaiter().GetResult(); work.CompleteAdding(); worker.Join(); work.Dispose(); }
}
