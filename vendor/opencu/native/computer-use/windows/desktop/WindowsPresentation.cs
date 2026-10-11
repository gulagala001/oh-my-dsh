using System.Text.Json;

internal sealed class WindowsPresentation
{
    internal const string ProducerKind = "windows-wgc-png";
    private readonly WindowTarget target;
    private readonly Dictionary<string, object?> identity;
    private readonly string bridgeSessionId = Guid.NewGuid().ToString("N");
    private readonly int producerPid = Environment.ProcessId;
    private readonly string producerProcessIdentity = WindowCatalog.Identity(Environment.ProcessId);
    private readonly Func<object, Task> notify;
    private readonly WindowsPresentationWindow owner;
    private readonly CancellationTokenSource lifetime = new();
    private readonly object gate = new();
    private WindowCapture? capture;
    private Task? pumping;
    private Task<object>? stopping;
    private long sequence;
    private int width, height;
    private bool published, closed, captureStopped, hostDetached, visible;
    private object? failure;
    private string? closeReason;
    internal string Id => (string)identity["presentationID"]!;
    internal WindowsPresentation(WindowTarget source, JsonElement args, Func<object, Task> notify)
    {
        target = source; this.notify = notify;
        identity = new Dictionary<string, object?> { ["pid"] = source.pid, ["windowId"] = source.window_id, ["processIdentity"] = source.process_identity };
        foreach (string key in new[] { "presentationID", "threadID", "turnID", "targetId", "viewId", "captureId" })
        {
            if (!args.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()) || value.GetString()!.Length > 4096)
                throw new NativeFailure("INVALID_NATIVE_IDENTITY", "A Windows presentation requires its immutable " + key);
            identity[key] = value.GetString();
        }
        if (!args.TryGetProperty("sourceGeneration", out var generation) || !generation.TryGetInt64(out long number) || number <= 0 || number > 9007199254740991L)
            throw new NativeFailure("INVALID_NATIVE_IDENTITY", "A positive source generation is required");
        identity["sourceGeneration"] = number;
        if (args.TryGetProperty("windowId", out var window) && window.GetInt64() != source.window_id || args.TryGetProperty("processIdentity", out var process) && process.GetString() != source.process_identity)
            throw new NativeFailure("INVALID_NATIVE_IDENTITY", "The presentation identity does not match its source window");
        double maximum = Maximum(args) ?? 200;
        visible = !args.TryGetProperty("visible", out var shown) || shown.GetBoolean();
        owner = new WindowsPresentationWindow(maximum, visible, OwnerClosed, Activate);
    }
    internal void Match(JsonElement args)
    {
        if (!args.TryGetProperty("bridgeSessionId", out var bridge) || bridge.GetString() != bridgeSessionId)
            throw new NativeFailure("STALE_PRESENTATION", "The Windows presentation belongs to another producer binding");
        foreach (var field in identity)
        {
            if (!args.TryGetProperty(field.Key, out var value) || field.Value is string text && (value.ValueKind != JsonValueKind.String || value.GetString() != text)
                || field.Value is int integer && (!value.TryGetInt32(out int actual) || integer != actual)
                || field.Value is long number && (!value.TryGetInt64(out long actualLong) || number != actualLong))
                throw new NativeFailure("STALE_PRESENTATION", "The Windows presentation source identity changed");
        }
        if (!args.TryGetProperty("window_id", out var window) || window.GetInt64() != target.window_id || !args.TryGetProperty("process_identity", out var process) || process.GetString() != target.process_identity)
            throw new NativeFailure("STALE_PRESENTATION", "The source window binding changed");
    }
    internal object State()
    {
        lock (gate)
        {
            var result = new Dictionary<string, object?>(identity) { ["bridgeSessionId"] = bridgeSessionId, ["producerKind"] = ProducerKind,
                ["published"] = published, ["closed"] = closed, ["captureStopped"] = captureStopped, ["hostDetached"] = hostDetached,
                ["ownerWindowId"] = owner.Handle, ["producerPid"] = producerPid, ["producerProcessIdentity"] = producerProcessIdentity, ["visible"] = visible,
                ["nativeProducer"] = new { format = "image/png", sourceWidth = width, sourceHeight = height, frameSequence = sequence, maximumPixelDimension = 1600, hardwareSharedSurface = false } };
            if (failure is not null) result["error"] = failure;
            if (closeReason is not null) result["closeReason"] = closeReason;
            return result;
        }
    }
    private async Task Emit(string type, WindowFrame? frame = null, string? action = null)
    {
        var state = (Dictionary<string, object?>)State(); state["type"] = type;
        if (action is not null) { state["action"] = action; state["reason"] = "native-window-click"; }
        if (frame is not null) { state["data"] = frame.Data; state["mediaType"] = "image/png"; state["capturedAt"] = frame.At; state["sequence"] = sequence; }
        try { await notify(state); } catch (System.IO.IOException) { } catch (ObjectDisposedException) { }
    }
    internal async Task<object> Start(CancellationToken token)
    {
        using var starting = CancellationTokenSource.CreateLinkedTokenSource(token, lifetime.Token);
        try
        {
            starting.Token.ThrowIfCancellationRequested();
            capture = new WindowCapture(WindowCatalog.Read(target.pid, target.window_id, target.process_identity));
            await owner.Create();
            var frame = await capture.Next(1600, starting.Token);
            starting.Token.ThrowIfCancellationRequested();
            await owner.Present(frame);
            starting.Token.ThrowIfCancellationRequested();
            lock (gate) { width = frame.Width; height = frame.Height; sequence = 1; published = true; }
            await Emit("frame", frame);
            starting.Token.ThrowIfCancellationRequested();
            pumping = Pump();
            return State();
        }
        catch
        {
            await ReleaseResources();
            throw;
        }
    }
    private void OwnerClosed()
    {
        lock (gate) { closeReason = "native-window-closed"; visible = false; published = false; }
        lifetime.Cancel();
    }
    private async Task Activate()
    {
        lock (gate) { if (closed || !published) return; }
        try { await Emit("interaction", action: "activate"); }
        catch (Exception error)
        {
            lock (gate) { failure = new { code = "NATIVE_PRESENTATION_NOTIFICATION_FAILED", message = error.Message }; }
            try { lifetime.Cancel(); } catch (ObjectDisposedException) { }
        }
    }
    private async Task Pump()
    {
        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                var frame = await capture!.Next(1600, lifetime.Token);
                lifetime.Token.ThrowIfCancellationRequested();
                await owner.Present(frame);
                lock (gate) { width = frame.Width; height = frame.Height; sequence++; }
                await Emit("frame", frame);
                await Task.Delay(40, lifetime.Token);
            }
        }
        catch (Exception) when (lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            lock (gate) { failure = new { code = error is NativeFailure native ? native.Code : "NATIVE_PRESENTATION_FAILED", message = error.Message }; }
            await Emit("failure");
        }
        finally { await ReleaseResources(); }
    }
    private async Task ReleaseResources()
    {
        capture?.Dispose(); capture = null;
        lock (gate) captureStopped = true;
        await owner.Close();
        lock (gate) { hostDetached = true; published = false; closed = true; visible = false; }
        await Emit("closed");
    }
    internal Task<object> Stop()
    {
        lock (gate) return stopping ??= StopCore();
    }
    private async Task<object> StopCore()
    {
        lifetime.Cancel();
        if (pumping is not null) await pumping;
        else if (!closed) await ReleaseResources();
        lifetime.Dispose();
        return State();
    }
    internal async Task<object> Update(JsonElement args, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (closed) throw new NativeFailure("STALE_PRESENTATION", "The Windows presentation is already closed");
        _ = WindowCatalog.Read(target.pid, target.window_id, target.process_identity);
        bool? shown = args.TryGetProperty("visible", out var value) ? value.GetBoolean() : null;
        double? maximum = Maximum(args);
        WindowBounds? bounds = null;
        if (args.TryGetProperty("bounds", out var rectangle))
        {
            int x = rectangle.GetProperty("x").GetInt32(), y = rectangle.GetProperty("y").GetInt32(), w = rectangle.GetProperty("width").GetInt32(), h = rectangle.GetProperty("height").GetInt32();
            if (w is < 1 or > 16384 || h is < 1 or > 16384) throw new NativeFailure("INVALID_ARGUMENT", "Presentation bounds must have positive dimensions no greater than 16384 pixels");
            bounds = new WindowBounds(x, y, w, h);
        }
        await owner.Update(shown, maximum, bounds);
        token.ThrowIfCancellationRequested();
        if (shown is not null) lock (gate) visible = shown.Value;
        await Emit("state"); return State();
    }
    private static double? Maximum(JsonElement args)
    {
        if (!args.TryGetProperty("maximumDisplaySize", out var size)) return null;
        double value = size.GetDouble();
        if (!double.IsFinite(value) || value < 1 || value > 400) throw new NativeFailure("INVALID_ARGUMENT", "maximumDisplaySize must be between 1 and 400");
        return value;
    }
}
