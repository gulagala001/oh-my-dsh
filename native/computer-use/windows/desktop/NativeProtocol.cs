using System.Collections.Concurrent;
using System.IO;
using System.Text;
using System.Text.Json;

// One transport owns one revocable session. Reading stays independent of the
// operation queue so Stop/EOF can cancel queued and in-flight observations.
internal sealed class NativeProtocol(
    Func<string, JsonElement, CancellationToken, Task<object>> execute,
    Func<Task> cleanup, object info, Action<JsonElement>? start = null)
{
    private readonly SemaphoreSlim output = new(1), serial = new(1);
    private readonly ConcurrentDictionary<long, CancellationTokenSource> requests = new();
    private CancellationTokenSource lease = new();
    private string? label;
    private bool ending;
    private bool readOnly;
    private StreamWriter? notifications;
    internal async Task Notify(string method, object parameters)
    {
        if (notifications is null) return;
        await output.WaitAsync();
        try { await notifications.WriteLineAsync(JsonSerializer.Serialize(new { jsonrpc = "2.0", method, @params = parameters })); await notifications.FlushAsync(); }
        finally { output.Release(); }
    }
    internal static object Result(object value, object[]? content = null) => new
    {
        structuredContent = value,
        content = content ?? [new { type = "text", text = JsonSerializer.Serialize(value) }]
    };
    internal static object Error(Exception error) => new
    {
        isError = true,
        structuredContent = new { error = new { code = error is NativeFailure failure ? failure.Code : error is OperationCanceledException ? "CANCELLED" : "NATIVE_ERROR", message = error.Message } },
        content = new[] { new { type = "text", text = error.Message } }
    };
    private async Task Reply(StreamWriter writer, long id, object value)
    {
        await output.WaitAsync();
        try { await writer.WriteLineAsync(JsonSerializer.Serialize(new { jsonrpc = "2.0", id, result = value })); await writer.FlushAsync(); }
        finally { output.Release(); }
    }
    internal async Task Run(Stream input, Stream destination)
    {
        using var reader = new StreamReader(input, new UTF8Encoding(false, true), false, 4096, leaveOpen: true);
        await using var writer = new StreamWriter(destination, new UTF8Encoding(false), 4096, leaveOpen: true);
        notifications = writer;
        var active = new List<Task>();
        try
        {
            while (await reader.ReadLineAsync() is { } line)
            {
                if (line.Length > 4 * 1024 * 1024) throw new InvalidDataException("Native request exceeds 4 MiB");
                using var document = JsonDocument.Parse(line);
                var message = document.RootElement;
                var method = message.GetProperty("method").GetString();
                var args = message.TryGetProperty("params", out var parameters) ? parameters.Clone() : JsonSerializer.SerializeToElement(new { });
                if (method == "notifications/cancelled")
                {
                    if (args.TryGetProperty("requestId", out var request) && request.TryGetInt64(out var requestId) && requests.TryGetValue(requestId, out var cancellation))
                    { try { cancellation.Cancel(); } catch (ObjectDisposedException) { /* Request completed while its notification was read. */ } }
                    continue;
                }
                if (!message.TryGetProperty("id", out var identifier) || !identifier.TryGetInt64(out long id)) continue;
                if (method == "initialize") { await Reply(writer, id, info); continue; }
                if (method != "tools/call") { await Reply(writer, id, Error(new NativeFailure("UNKNOWN_METHOD", "Unsupported native method"))); continue; }
                var name = args.GetProperty("name").GetString() ?? "";
                var arguments = args.GetProperty("arguments").Clone();
                if (name == "start_session")
                {
                    string? requested = arguments.GetProperty("session").GetString();
                    if (label is not null || ending || string.IsNullOrWhiteSpace(requested)) await Reply(writer, id, Error(new NativeFailure("INVALID_SESSION", "This connection already has a session or is stopping")));
                    else
                    {
                        try { start?.Invoke(arguments); readOnly = arguments.TryGetProperty("read_only", out var mode) && mode.GetBoolean(); label = requested; await Reply(writer, id, Result(new { status = "started", session = label, read_only = readOnly })); }
                        catch (Exception error) { await Reply(writer, id, Error(error)); }
                    }
                    continue;
                }
                if ((ending && name != "end_session") || label is null || !arguments.TryGetProperty("session", out var session) || session.GetString() != label)
                { await Reply(writer, id, Error(new NativeFailure("INVALID_SESSION", "The native session is absent, stopping, or belongs to another connection"))); continue; }
                if (name == "end_session")
                {
                    ending = true; lease.Cancel();
                    // Keep reading: EOF and cancellation must not wait behind a
                    // slow UI Automation provider. ACK only after real cleanup.
                    active.Add(End(writer, id));
                    continue;
                }
                if (readOnly && name is not ("check_permissions" or "list_apps" or "list_windows" or "list_share_windows" or "get_window_share" or "get_window_state" or "start_preview" or "preview_frame"))
                { await Reply(writer, id, Error(new NativeFailure("READ_ONLY_SESSION", "This observation connection cannot send input or modify an application"))); continue; }
                var source = CancellationTokenSource.CreateLinkedTokenSource(lease.Token);
                if (!requests.TryAdd(id, source)) { source.Dispose(); throw new InvalidDataException("Duplicate active request id"); }
                active.RemoveAll(task => task.IsCompletedSuccessfully);
                active.Add(Execute(writer, id, name, arguments, source));
            }
        }
        finally
        {
            ending = true; lease.Cancel();
            try { await Task.WhenAll(active); }
            finally { await cleanup(); lease.Dispose(); }
        }
    }
    private async Task Execute(StreamWriter writer, long id, string name, JsonElement args, CancellationTokenSource cancellation)
    {
        bool acquired = false; object value;
        try
        {
            await serial.WaitAsync(cancellation.Token); acquired = true;
            cancellation.Token.ThrowIfCancellationRequested();
            value = await execute(name, args, cancellation.Token);
            cancellation.Token.ThrowIfCancellationRequested();
        }
        catch (Exception error) { value = Error(error); }
        finally { if (acquired) serial.Release(); requests.TryRemove(id, out _); cancellation.Dispose(); }
        await Reply(writer, id, value);
    }
    private async Task End(StreamWriter writer, long id)
    {
        await serial.WaitAsync();
        try { await cleanup(); await Reply(writer, id, Result(new { status = "ended", session = label })); }
        catch (Exception error) { await Reply(writer, id, Error(error)); }
        finally { serial.Release(); }
    }
}

internal sealed class NativeFailure(string code, string message) : Exception(message)
{
    internal string Code { get; } = code;
}
