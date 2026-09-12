using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Threading;
using Microsoft.Win32.SafeHandles;

// Shell automation stays on a dedicated STA; only plain records leave it.
// Window matching uses application IDs or executable paths, never window titles.
internal sealed class AppCatalog : IDisposable
{
    private sealed record App(string Key, string Name, string? Executable, string Arguments, string? ModelId, string? UnavailableReason = null)
    {
        internal string Id => "win-app:" + Key;
        internal string Path => Executable ?? (Key.StartsWith("shortcut:", StringComparison.Ordinal) ? Key[9..] : "shell:AppsFolder\\" + Key);
    }
    private sealed record Running(WindowTarget Window, string? Executable, string? ModelId);
    private readonly Thread thread;
    private readonly Dispatcher dispatcher;
    private App[]? cached;
    private long scanned;
    internal AppCatalog()
    {
        var ready = new TaskCompletionSource<Dispatcher>(TaskCreationOptions.RunContinuationsAsynchronously);
        thread = new Thread(() => { ready.SetResult(Dispatcher.CurrentDispatcher); Dispatcher.Run(); }) { IsBackground = true, Name = "OhMyDsh application discovery" };
        thread.SetApartmentState(ApartmentState.STA); thread.Start(); dispatcher = ready.Task.GetAwaiter().GetResult();
    }
    private Task<T> Run<T>(Func<T> action, CancellationToken token) => dispatcher.InvokeAsync(() => { token.ThrowIfCancellationRequested(); return action(); }, DispatcherPriority.Normal, token).Task;
    private static void Release(object? value) { if (value is not null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value); }
    private static string? Property(object item, string name)
    {
        try { var value = ((dynamic)item).ExtendedProperty(name); return value is string text && text.Length > 0 ? text : null; }
        catch (COMException) { return null; }
    }
    private static bool SameLauncher(App left, App right) => left.Key == right.Key ||
        (left.ModelId is not null && left.ModelId == right.ModelId) ||
        (left.Executable is not null && string.Equals(left.Executable, right.Executable, StringComparison.OrdinalIgnoreCase) && left.Arguments == right.Arguments);
    private App[] Read(CancellationToken token, App? open = null)
    {
        object? shell = null, folder = null, items = null;
        try
        {
            shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application") ?? throw new NativeFailure("APP_DISCOVERY_UNAVAILABLE", "Windows application discovery is unavailable"));
            folder = ((dynamic)shell!).NameSpace("shell:::{4234d49b-0245-4df3-b780-3893943456e1}");
            if (folder is null) throw new NativeFailure("APP_DISCOVERY_UNAVAILABLE", "The Windows Applications folder is unavailable");
            items = ((dynamic)folder).Items(); int count = ((dynamic)items).Count;
            if (count > 4096) throw new NativeFailure("APP_DISCOVERY_LIMIT", "The Windows application catalog exceeds the discovery limit; use an executable path");
            var result = new List<App>(); bool opened = false;
            void Add(App app, object? item)
            {
                result.Add(app);
                if (result.Count > 4096) throw new NativeFailure("APP_DISCOVERY_LIMIT", "The Windows application catalog exceeds the discovery limit; use an executable path");
                if (open?.Key != app.Key) return;
                if (app.UnavailableReason is not null) throw new NativeFailure("APP_UNAVAILABLE", app.UnavailableReason);
                if (!string.Equals(open.Executable, app.Executable, StringComparison.OrdinalIgnoreCase) || open.Arguments != app.Arguments || open.ModelId != app.ModelId)
                    throw new NativeFailure("APP_CHANGED", "The application launcher changed; refresh discovery before launching it");
                token.ThrowIfCancellationRequested(); WindowCatalog.RequireInteractive();
                ((dynamic)item!).InvokeVerb("open"); opened = true;
            }
            for (int i = 0; i < count; i++)
            {
                token.ThrowIfCancellationRequested(); object? item = null;
                try
                {
                    item = ((dynamic)items).Item(i);
                    string key = Property(item!, "System.AppUserModel.ID") ?? (string)((dynamic)item!).Path;
                    string name = (string)((dynamic)item!).Name;
                    if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(name)) continue;
                    var executable = Property(item!, "System.Link.TargetParsingPath");
                    if (executable is not null && (!System.IO.Path.IsPathFullyQualified(executable) || !executable.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))) executable = null;
                    var app = new App(key, name, executable is null ? null : System.IO.Path.GetFullPath(executable), Property(item!, "System.Link.Arguments") ?? "", key);
                    Add(app, item!); if (opened) return result.ToArray();
                }
                finally { Release(item); }
            }
            // Desktop shortcuts are installed applications even before the
            // Shell's AppsFolder index notices them. Read the actual Start
            // menu alongside packaged applications, without launching links.
            foreach (var directory in new[] { Environment.GetFolderPath(Environment.SpecialFolder.Programs), Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms) }.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!Directory.Exists(directory)) continue;
                var options = new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint };
                foreach (var path in Directory.EnumerateFiles(directory, "*.lnk", options))
                {
                    token.ThrowIfCancellationRequested(); object? container = null, item = null, link = null;
                    string key = "shortcut:" + System.IO.Path.GetFullPath(path);
                    try
                    {
                        container = ((dynamic)shell!).NameSpace(System.IO.Path.GetDirectoryName(path));
                        if (container is null) continue;
                        item = ((dynamic)container).ParseName(System.IO.Path.GetFileName(path)); if (item is null) continue;
                        link = ((dynamic)item).GetLink; if (link is null) continue;
                        string executable = Environment.ExpandEnvironmentVariables((string)((dynamic)link).Path);
                        if (!System.IO.Path.IsPathFullyQualified(executable) || !executable.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) continue;
                        var app = new App(key, (string)((dynamic)item).Name, System.IO.Path.GetFullPath(executable), (string)((dynamic)link).Arguments, Property(item, "System.AppUserModel.ID"));
                        Add(app, item); if (opened) return result.ToArray();
                    }
                    catch (Exception error) when (error is COMException or UnauthorizedAccessException)
                    {
                        if (open?.Key == key) throw;
                        // An inaccessible shortcut must not hide the rest of
                        // the application catalog or look like a usable app.
                        Add(new App(key, System.IO.Path.GetFileNameWithoutExtension(path), null, "", null, "Windows could not read this shortcut: " + error.Message), null);
                    }
                    finally { Release(link); Release(item); Release(container); }
                }
            }
            if (open is not null && !opened) throw new NativeFailure("APP_NOT_FOUND", "The installed application changed or was removed; refresh application discovery");
            return result.ToArray();
        }
        finally { Release(items); Release(folder); Release(shell); }
    }
    private App[] Installed(CancellationToken token)
    {
        if (cached is null || Environment.TickCount64 - scanned > 5000) { cached = Read(token); scanned = Environment.TickCount64; }
        return cached;
    }
    private static Running[] Windows()
    {
        var processes = new Dictionary<int, (string? Path, string? Id)>();
        return WindowCatalog.List().Select(window =>
        {
            if (!processes.TryGetValue(window.pid, out var process))
            {
                using var handle = OpenProcess(0x1000, false, window.pid);
                string? path = null, id = null;
                if (!handle.IsInvalid)
                {
                    var buffer = new StringBuilder(32768); uint size = (uint)buffer.Capacity;
                    if (QueryFullProcessImageNameW(handle, 0, buffer, ref size)) path = System.IO.Path.GetFullPath(buffer.ToString());
                    uint length = 0;
                    if (GetApplicationUserModelId(handle, ref length, null) == 122 && length is > 0 and <= 4096)
                    { var value = new StringBuilder((int)length); if (GetApplicationUserModelId(handle, ref length, value) == 0) id = value.ToString(); }
                }
                process = (path, id); processes.Add(window.pid, process);
            }
            return new Running(window, process.Path, WindowModelId(window.window_id) ?? process.Id);
        }).ToArray();
    }
    private static bool Matches(App app, Running running) => (app.ModelId is not null && running.ModelId == app.ModelId) ||
        (app.Executable is not null && app.Arguments.Length == 0 && string.Equals(app.Executable, running.Executable, StringComparison.OrdinalIgnoreCase));
    internal Task<object> List(CancellationToken token) => Run(() =>
    {
        WindowCatalog.RequireInteractive(); var apps = Installed(token); var windows = Windows(); var result = new List<object>(); var known = new HashSet<long>();
        var shown = new List<App>();
        foreach (var app in apps)
        {
            if (shown.Any(previous => string.Equals(previous.Name, app.Name, StringComparison.OrdinalIgnoreCase) && SameLauncher(previous, app))) continue;
            shown.Add(app);
            token.ThrowIfCancellationRequested(); var running = windows.Where(window => Matches(app, window)).ToArray();
            foreach (var window in running) known.Add(window.Window.window_id);
            int[] pids = running.Select(window => window.Window.pid).Distinct().ToArray();
            result.Add(new { bundle_id = app.Id, name = app.Name, pid = pids.Length == 1 ? pids[0] : 0, running = running.Length > 0, launch_path = app.Path, discovery_error = app.UnavailableReason, windows = running.Select(window => new { window.Window.pid, window.Window.window_id, window.Window.title }).ToArray() });
        }
        foreach (var group in windows.Where(window => !known.Contains(window.Window.window_id)).GroupBy(window => window.Window.app_id))
        { var first = group.First(); result.Add(new { bundle_id = group.Key, name = first.Window.app_name, pid = first.Window.pid, running = true, launch_path = first.Executable, windows = group.Select(window => new { window.Window.pid, window.Window.window_id, window.Window.title }).ToArray() }); }
        return NativeProtocol.Result(new { apps = result });
    }, token);
    internal Task<WindowTarget> Resolve(string query, long? windowId, Func<Task> beforeLaunch, CancellationToken token) => Run(() =>
    {
        WindowCatalog.RequireInteractive(); var windows = Windows(); App? selected = null; string? path = null;
        Running[] candidates;
        if (query.StartsWith("win-process:", StringComparison.Ordinal))
        {
            candidates = windows.Where(window => window.Window.app_id == query).ToArray();
            if (candidates.Length == 0) throw new NativeFailure("STALE_PROCESS", "The referenced process exited; discover its current application instance");
        }
        else
        {
            if (System.IO.Path.IsPathFullyQualified(query))
            {
                path = System.IO.Path.GetFullPath(query);
                if (!path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || !File.Exists(path)) throw new NativeFailure("APP_NOT_FOUND", "Use an existing executable path or an application ID from discovery");
                candidates = windows.Where(window => string.Equals(window.Executable, path, StringComparison.OrdinalIgnoreCase)).ToArray();
            }
            else
            {
                var matches = Installed(token).Where(app => string.Equals(app.Id, query, StringComparison.OrdinalIgnoreCase) || string.Equals(app.Name, query, StringComparison.OrdinalIgnoreCase) || string.Equals(app.Path, query, StringComparison.OrdinalIgnoreCase)).ToArray();
                if (matches.Length > 1 && matches.Skip(1).Any(app => !SameLauncher(matches[0], app))) throw new NativeFailure("APP_AMBIGUOUS", "Application names are ambiguous; select an exact discovered application ID");
                selected = matches.FirstOrDefault();
                if (selected?.UnavailableReason is not null) throw new NativeFailure("APP_UNAVAILABLE", selected.UnavailableReason);
                candidates = selected is not null ? windows.Where(window => Matches(selected, window)).ToArray() : windows.Where(window => string.Equals(window.Window.app_name, query, StringComparison.OrdinalIgnoreCase)).ToArray();
                if (selected is null && candidates.Length == 0) throw new NativeFailure("APP_NOT_FOUND", "No exact installed or running application matched; discover its ID or use its executable path");
            }
        }
        if (windowId is not null)
        {
            candidates = candidates.Where(window => window.Window.window_id == windowId).ToArray();
            if (candidates.Length == 0) throw new NativeFailure("STALE_WINDOW", "The referenced window is no longer available; choose a current window");
        }
        if (candidates.Length == 0)
        {
            // Acquire the same desktop lease as input before opening an app,
            // since Windows may bring its new window to the foreground.
            beforeLaunch().GetAwaiter().GetResult(); token.ThrowIfCancellationRequested();
            if (selected is not null) Read(token, selected);
            else { using var process = Process.Start(new ProcessStartInfo(path!) { UseShellExecute = true, WorkingDirectory = System.IO.Path.GetDirectoryName(path!)! }); }
            long deadline = Environment.TickCount64 + 12000;
            do
            {
                token.ThrowIfCancellationRequested(); windows = Windows();
                candidates = windows.Where(window => selected is not null ? Matches(selected, window) : string.Equals(window.Executable, path, StringComparison.OrdinalIgnoreCase)).ToArray();
                if (candidates.Length > 0) break;
                token.WaitHandle.WaitOne(100);
            } while (Environment.TickCount64 < deadline);
            if (candidates.Length == 0) throw new NativeFailure("APP_LAUNCH_UNCONFIRMED", "The launch was requested but no matching window appeared; inspect discovery before retrying");
        }
        token.ThrowIfCancellationRequested();
        if (windowId is null && candidates.Count(window => window.Window.focused) == 1) candidates = candidates.Where(window => window.Window.focused).ToArray();
        if (candidates.Length != 1) throw new NativeFailure("WINDOW_AMBIGUOUS", "Choose an exact windowId for this application: " + System.Text.Json.JsonSerializer.Serialize(candidates.Select(window => new { window.Window.pid, window.Window.window_id, window.Window.title })));
        var target = candidates[0].Window;
        return selected is null ? target : target with { app_id = selected.Id, app_name = selected.Name };
    }, token);
    public void Dispose()
    {
        if (!dispatcher.HasShutdownStarted) dispatcher.InvokeShutdown();
        if (!thread.Join(2000)) throw new NativeFailure("APP_DISCOVERY_CLEANUP_PENDING", "Application discovery is still shutting down; retry Stop");
    }
    private static string? WindowModelId(long window)
    {
        var iid = typeof(PropertyStore).GUID;
        if (SHGetPropertyStoreForWindow(new IntPtr(window), ref iid, out var store) < 0 || store is null) return null;
        try
        {
            var key = new PropertyKey { Format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), Id = 5 };
            if (store.GetValue(ref key, out var value) < 0) return null;
            try { return value.Type == 31 ? Marshal.PtrToStringUni(value.Pointer) : null; } finally { PropVariantClear(ref value); }
        }
        finally { Release(store); }
    }
    [StructLayout(LayoutKind.Sequential)] private struct PropertyKey { public Guid Format; public uint Id; }
    [StructLayout(LayoutKind.Explicit, Size = 24)] private struct PropertyValue { [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public IntPtr Pointer; }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] private interface PropertyStore
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropertyValue value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropertyValue value);
        [PreserveSig] int Commit();
    }
    [DllImport("shell32.dll", ExactSpelling = true)] private static extern int SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out PropertyStore? store);
    [DllImport("ole32.dll", ExactSpelling = true)] private static extern int PropVariantClear(ref PropertyValue value);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern SafeProcessHandle OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, int pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool QueryFullProcessImageNameW(SafeProcessHandle process, uint flags, StringBuilder path, ref uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int GetApplicationUserModelId(SafeProcessHandle process, ref uint length, StringBuilder? id);
}
