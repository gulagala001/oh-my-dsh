using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

internal static class DesktopProgram
{
    internal static readonly string[] Capabilities = ["windows", "applications", "launch-app", "accessibility", "screenshots", "preview", "keyboard", "click", "drag", "paste", "uia-actions", "structured-scroll"];
    internal static readonly string Build = typeof(DesktopProgram).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>().Single(a => a.Key == "TrisoulBuild").Value ?? "development";
    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length == 2 && args[0] == "install-lock") { DesktopInstallLock.Hold(args[1]); return 0; }
            if (args.Length == 4 && args[0] == "input-recovery") { WindowsInput.RecoverInput(args); return 0; }
            if (args.SequenceEqual(new[] { "info" }))
            {
                Console.WriteLine(JsonSerializer.Serialize(new { name = "oh-my-dsh-windows-desktop", protocol = 1, build = Build, capabilities = Capabilities, input = true }));
                return 0;
            }
            if (!args.SequenceEqual(new[] { "mcp" })) throw new ArgumentException("Use info or mcp");
            if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 19041)) throw new PlatformNotSupportedException("Windows 10 version 2004 or newer is required");
            var dpiContext = new IntPtr(-4);
            if (!SetProcessDpiAwarenessContext(dpiContext) && !AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), dpiContext)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Could not enable physical per-monitor coordinates");
            NativeProtocol? protocol = null;
            using var desktop = new DesktopObservation(value => { try { protocol?.Notify("notifications/trisoul/cursor", value).GetAwaiter().GetResult(); } catch (System.IO.IOException) { } catch (ObjectDisposedException) { } });
            var info = new { protocolVersion = "2024-11-05", serverInfo = new { name = "trisoul-computer-use", version = "0.1.1" }, capabilities = new { tools = new { } }, _meta = new { trisoul = new { protocol = 1, build = Build, pid = Environment.ProcessId, platform = "win32", input = true, observation = true } } };
            protocol = new NativeProtocol(desktop.Execute, desktop.Cleanup, info, desktop.Start);
            await protocol.Run(Console.OpenStandardInput(), Console.OpenStandardOutput());
            return 0;
        }
        catch (Exception error) { await Console.Error.WriteLineAsync(error.Message); return 1; }
    }
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern IntPtr GetThreadDpiAwarenessContext();
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool AreDpiAwarenessContextsEqual(IntPtr left, IntPtr right);
}

internal sealed class DesktopObservation : IDisposable
{
    private readonly WindowObservation observation;
    private AppCatalog? apps;
    internal DesktopObservation(Action<object>? pointer = null) { observation = new WindowObservation(pointer); }
    private readonly Dictionary<string, WindowCapture> captures = new();
    private WindowTarget? preview;
    private long sequence;
    private bool readOnly;
    internal void Start(JsonElement args) { readOnly = args.TryGetProperty("read_only", out var mode) && mode.GetBoolean(); }
    internal Task<object> Execute(string name, JsonElement args, CancellationToken token) => Task.Run(async () =>
    {
        token.ThrowIfCancellationRequested();
        if (name == "check_permissions")
        {
            bool interactive = true; try { WindowCatalog.RequireInteractive(); } catch (NativeFailure) { interactive = false; }
            return NativeProtocol.Result(new { platform = "win32", interactive, capture_supported = WindowCapture.Supported, input = !readOnly, permission_model = "interactive-user" });
        }
        if (name == "list_apps")
        {
            return await (apps ??= new AppCatalog()).List(token);
        }
        if (name == "launch_app")
        {
            if (readOnly) throw new NativeFailure("READ_ONLY_SESSION", "An observation connection cannot launch an application");
            string query = args.TryGetProperty("bundle_id", out var appId) ? appId.GetString() ?? "" : args.GetProperty("name").GetString() ?? "";
            if (string.IsNullOrWhiteSpace(query)) throw new NativeFailure("INVALID_ARGUMENT", "An exact application name, ID, or executable path is required");
            long? selected = args.TryGetProperty("window_id", out var id) ? id.GetInt64() : null;
            bool launched = false;
            // Resolve waits on the Shell STA. Its lease callback must resume
            // outside that dispatcher or both threads wait for each other.
            var target = await (apps ??= new AppCatalog()).Resolve(query, selected, async () => { await observation.BeforeLaunch(token).ConfigureAwait(false); launched = true; }, token);
            if (launched) await observation.AfterLaunch(token);
            return NativeProtocol.Result(target);
        }
        if (name is "list_windows" or "list_share_windows")
        {
            WindowCatalog.RequireInteractive();
            int? pid = args.TryGetProperty("pid", out var owner) ? owner.GetInt32() : null;
            return NativeProtocol.Result(new { windows = WindowCatalog.List(pid), process_identity = pid is not null ? WindowCatalog.Identity(pid.Value) : null });
        }
        if (name == "start_preview") { preview = Target(args); _ = Capture(preview); sequence = 0; return NativeProtocol.Result(new { status = "started" }); }
        if (name == "preview_frame")
        {
            if (preview is null) throw new NativeFailure("PREVIEW_NOT_STARTED", "Start a preview for this connection first");
            using var interval = CancellationTokenSource.CreateLinkedTokenSource(token); interval.CancelAfter(750);
            try
            {
                var frame = await Capture(preview).Next(1600, interval.Token);
                return NativeProtocol.Result(new { status = "live", sequence = ++sequence, data = frame.Data, mediaType = "image/png", pixelWidth = frame.Width, pixelHeight = frame.Height, bounds = frame.Bounds, geometryVerified = true, capturedAt = frame.At, cursor = (object?)null });
            }
            catch (OperationCanceledException) when (!token.IsCancellationRequested) { return NativeProtocol.Result(new { status = sequence > 0 ? "live" : "waiting", sequence }); }
        }
        if (name is "get_window_state" or "get_window_share")
        {
            var target = Target(args);
            bool tree = name == "get_window_share" || !args.TryGetProperty("include_accessibility_tree", out var treeValue) || treeValue.GetBoolean();
            bool shot = name == "get_window_share" || !args.TryGetProperty("include_screenshot", out var shotValue) || shotValue.GetBoolean();
            if (!tree && !shot) throw new NativeFailure("EMPTY_OBSERVATION", "Request a tree, screenshot, or both");
            var state = tree ? await observation.Read(target, token, !readOnly && name != "get_window_share") : new Dictionary<string, object?> { ["window_id"] = target.window_id, ["window_title"] = target.title, ["bounds"] = target.bounds };
            var content = new List<object>();
            if (shot)
            {
                int maximum = args.TryGetProperty("max_dimension", out var maximumValue) ? maximumValue.GetInt32() : 1600;
                if (maximum is < 64 or > 4096) throw new NativeFailure("INVALID_ARGUMENT", "max_dimension must be between 64 and 4096");
                var frame = await Capture(target).Next(maximum, token);
                if (frame.Bounds != target.bounds) throw new NativeFailure("WINDOW_MOVED", "Window geometry changed between accessibility and screenshot observation");
                state["screenshot_width"] = frame.Width; state["screenshot_height"] = frame.Height;
                state["screenshot_scale"] = (double)frame.Width / frame.Bounds.width;
                if (!readOnly && name != "get_window_share") await observation.RecordFrame(target, frame);
                content.Add(new { type = "image", mimeType = "image/png", data = frame.Data });
            }
            content.Add(new { type = "text", text = JsonSerializer.Serialize(state) });
            return NativeProtocol.Result(state, content.ToArray());
        }
        if (name is "click" or "press_key" or "type_text" or "set_value" or "select_text" or "scroll" or "drag" or "paste")
        {
            if (readOnly) throw new NativeFailure("READ_ONLY_SESSION", "This observation connection cannot send input");
            return await observation.Act(name, Target(args), args, token);
        }
        throw new NativeFailure("UNSUPPORTED_CAPABILITY", "This Windows action has not been implemented yet");
    }, token);
    private static WindowTarget Target(JsonElement args)
    {
        if (!args.TryGetProperty("pid", out var pid) || !pid.TryGetInt32(out int owner) || owner <= 0 || !args.TryGetProperty("window_id", out var window) || !window.TryGetInt64(out long id) || id <= 0 || !args.TryGetProperty("process_identity", out var identity) || identity.ValueKind != JsonValueKind.String)
            throw new NativeFailure("INVALID_TARGET", "Choose a current window with pid, window_id, and process_identity from discovery");
        WindowCatalog.RequireInteractive();
        return WindowCatalog.Read(owner, id, identity.GetString());
    }
    private WindowCapture Capture(WindowTarget target)
    {
        string key = target.process_identity + ":" + target.window_id;
        if (!captures.TryGetValue(key, out var capture)) { capture = new WindowCapture(target); captures.Add(key, capture); }
        return capture;
    }
    internal async Task Cleanup()
    {
        await observation.CloseInput();
        foreach (var capture in captures.Values) capture.Dispose();
        captures.Clear(); preview = null;
        apps?.Dispose(); apps = null;
    }
    public void Dispose() { Cleanup().GetAwaiter().GetResult(); observation.Dispose(); }
}
