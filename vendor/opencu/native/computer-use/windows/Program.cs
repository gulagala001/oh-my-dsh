using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.ComponentModel;
using System.IO.Pipes;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.Principal;
using System.Text.Json;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

// Browser transport only. This executable never observes or inputs to desktop
// applications. stdout belongs exclusively to the selected wire protocol.
internal static class Program
{
    internal const int ChunkSize = 65536;
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private static readonly SemaphoreSlim OutputLock = new(1);
    private static readonly Stream Input = Console.OpenStandardInput(), Output = Console.OpenStandardOutput();
    private static readonly ConcurrentDictionary<uint, NamedPipeServerStream> Clients = new();
    private static uint nextClient;

    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (args.Length == 1 && args[0] == "info")
            {
                await Print(new { name = "oh-my-dsh-browser-bridge", protocol = 1, build = typeof(Program).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>().Single(a => a.Key == "TrisoulBuild").Value });
            }
            else if (args.Length == 2 && args[0] == "pipe-server") await Serve(PipeName(args[1]));
            else if (args.Length == 2 && args[0] == "install-lock") await Lock(args[1]);
            else if (args.Length >= 2 && args[0].StartsWith("registry-", StringComparison.Ordinal))
            {
                if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Windows registry is unavailable");
                await RegistryCommand(args);
            }
            else await Bridge(args);
            return 0;
        }
        catch (Exception error)
        {
            // Do not expose command lines or config contents in a browser popup.
            await Console.Error.WriteLineAsync(error is OperationCanceledException ? "Browser bridge cancelled" : error.Message);
            return 1;
        }
    }

    private static Task Print<T>(T value) => Console.Out.WriteLineAsync(JsonSerializer.Serialize(value, Json));
    private static string PipeName(string path)
    {
        const string prefix = @"\\.\pipe\";
        var name = path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) ? path[prefix.Length..] : path;
        if (name.Length is < 8 or > 160 || !name.All(c => char.IsAsciiLetterOrDigit(c) || c == '-')) throw new ArgumentException("Invalid local pipe name");
        return name;
    }

    private static async Task Bridge(string[] args)
    {
        var config = JsonSerializer.Deserialize<BridgeConfig>(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "bridge.json")), Json)
            ?? throw new InvalidDataException("Missing browser bridge configuration");
        // Chrome supplies the origin first and an optional parent window on
        // Windows (zero is valid for a service worker). No arbitrary arguments.
        if (args.Length is < 1 or > 2 || args[0] != config.Origin ||
            !System.Text.RegularExpressions.Regex.IsMatch(config.Origin, "^chrome-extension://[a-p]{32}/$", System.Text.RegularExpressions.RegexOptions.CultureInvariant) ||
            (args.Length == 2 && (!args[1].StartsWith("--parent-window=", StringComparison.Ordinal) || !ulong.TryParse(args[1][16..], out _))))
            throw new ArgumentException("Invalid native messaging origin or arguments");
        using var pipe = new NamedPipeClientStream(".", PipeName(config.Pipe), PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        using var cancelled = new CancellationTokenSource();
        await pipe.ConnectAsync(5000, cancelled.Token);
        var upstream = Input.CopyToAsync(pipe, cancelled.Token);
        var downstream = pipe.CopyToAsync(Output, cancelled.Token);
        var first = await Task.WhenAny(upstream, downstream);
        // Either EOF is terminal: Chrome's port or the DSH owner has gone away.
        // Cancellation plus process exit closes any pending pipe/stdio reads.
        try { await first; } finally { cancelled.Cancel(); pipe.Dispose(); }
    }
    private sealed record BridgeConfig(string Pipe, string Origin);

    // Multiplex only the byte streams, never the browser protocol. Node keeps
    // its existing lease, epoch, framing and stop acknowledgement logic.
    // Header: type:u8, connection:u32le, length:u32le; data <=64KiB.
    private static async Task Packet(byte type, uint id, ReadOnlyMemory<byte> data, CancellationToken token)
    {
        await OutputLock.WaitAsync(token);
        try
        {
            var header = new byte[9]; header[0] = type;
            BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(1), id);
            BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(5), (uint)data.Length);
            await Output.WriteAsync(header, token);
            if (!data.IsEmpty) await Output.WriteAsync(data, token);
            await Output.FlushAsync(token);
        }
        finally { OutputLock.Release(); }
    }

    private static async Task Serve(string name)
    {
        using var cancelled = new CancellationTokenSource();
        // Reserve the first instance before announcing readiness. A second
        // DSH/helper cannot attach itself to another instance's endpoint.
        using var first = CreatePipe(name, true);
        await Packet(0, 0, ReadOnlyMemory<byte>.Empty, cancelled.Token);
        var accept = Accept(name, first, cancelled.Token);
        try
        {
            var consume = ConsumeHost(cancelled.Token);
            await await Task.WhenAny(accept, consume);
        }
        finally
        {
            cancelled.Cancel(); first.Dispose();
            foreach (var client in Clients.Values) client.Dispose();
            try { await accept; } catch (Exception error) when (error is OperationCanceledException or ObjectDisposedException or IOException) { }
        }
    }
    private static async Task ConsumeHost(CancellationToken token)
    {
            var header = new byte[9];
            while (true)
            {
                int read = await Input.ReadAsync(header.AsMemory(0, 1));
                if (read == 0) break;
                await Input.ReadExactlyAsync(header.AsMemory(1));
                byte type = header[0]; uint id = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(1));
                int size = checked((int)BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(5)));
                if (id == 0 || type is not (2 or 3) || size > ChunkSize || (type == 3 && size != 0)) throw new InvalidDataException("Invalid host transport packet");
                var bytes = new byte[size]; await Input.ReadExactlyAsync(bytes);
                if (!Clients.TryGetValue(id, out var client)) continue; // Raced a terminal peer close.
                if (type == 3) { client.Dispose(); continue; }
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(5000);
                try { await client.WriteAsync(bytes, timeout.Token); }
                catch (Exception error) when (error is IOException or ObjectDisposedException or OperationCanceledException) { client.Dispose(); }
            }
    }
    private static async Task Accept(string name, NamedPipeServerStream first, CancellationToken token)
    {
        NamedPipeServerStream? waiting = first;
        try
        {
            while (!token.IsCancellationRequested)
            {
                await waiting.WaitForConnectionAsync(token);
                var connected = waiting;
                // Always keep an instance reserved, including while the last
                // browser disconnects. This also preserves first-owner identity.
                waiting = CreatePipe(name, false);
                uint id = checked(++nextClient); Clients[id] = connected;
                await Packet(1, id, ReadOnlyMemory<byte>.Empty, token);
                _ = ReadClient(id, connected, token);
            }
        }
        finally { waiting?.Dispose(); }
    }
    private static async Task ReadClient(uint id, NamedPipeServerStream pipe, CancellationToken token)
    {
        try
        {
            var buffer = new byte[ChunkSize];
            while (true)
            {
                int size = await pipe.ReadAsync(buffer, token); if (size == 0) break;
                await Packet(2, id, buffer.AsMemory(0, size), token);
            }
        }
        catch (Exception error) when (error is IOException or ObjectDisposedException or OperationCanceledException) { }
        finally
        {
            Clients.TryRemove(id, out _); pipe.Dispose();
            try { await Packet(3, id, ReadOnlyMemory<byte>.Empty, token); }
            catch (Exception error) when (error is IOException or ObjectDisposedException or OperationCanceledException) { }
        }
    }

    private static NamedPipeServerStream CreatePipe(string name, bool first)
    {
        if (OperatingSystem.IsWindows()) return CreateWindowsPipe(name, first);
        // Allows protocol tests on developer machines; production Unix hubs
        // continue to use their original Node Unix socket transport.
        return new NamedPipeServerStream(name, PipeDirection.InOut, 254, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly, ChunkSize, ChunkSize);
    }
    [SupportedOSPlatform("windows")]
    private static NamedPipeServerStream CreateWindowsPipe(string name, bool first)
    {
        using var identity = WindowsIdentity.GetCurrent();
        string sid = identity.User?.Value ?? throw new InvalidOperationException("No current Windows user");
        // Protected DACL grants only this user. PIPE_REJECT_REMOTE_CLIENTS is
        // required separately: a local user identity is not a network boundary.
        if (!ConvertStringSecurityDescriptorToSecurityDescriptorW($"D:P(A;;GA;;;{sid})", 1, out var descriptor, out _)) throw new Win32Exception();
        try
        {
            var security = new SecurityAttributes { Length = Marshal.SizeOf<SecurityAttributes>(), Descriptor = descriptor };
            var handle = CreateNamedPipeW(@"\\.\pipe\" + name, 0x40000003u | (first ? 0x00080000u : 0), 0x8, 254, ChunkSize, ChunkSize, 0, ref security);
            if (handle.IsInvalid) { int error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new Win32Exception(error); }
            try { return new NamedPipeServerStream(PipeDirection.InOut, true, false, handle); }
            catch { handle.Dispose(); throw; }
        }
        finally { LocalFree(descriptor); }
    }
    [StructLayout(LayoutKind.Sequential)] private struct SecurityAttributes { public int Length; public IntPtr Descriptor; public int Inherit; }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string value, uint revision, out IntPtr descriptor, out uint length);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern SafePipeHandle CreateNamedPipeW(string name, uint mode, uint pipeMode, uint instances, uint outputSize, uint inputSize, uint timeout, ref SecurityAttributes attributes);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);

    private static async Task Lock(string name)
    {
        // HKCU is shared by this user's interactive logon sessions. Include the
        // SID in a global mutex name so two DSH sessions serialize registration.
        string scope = "";
        if (OperatingSystem.IsWindows())
        {
            using var identity = WindowsIdentity.GetCurrent();
            scope = "Global\\"; name = identity.User?.Value + ":" + name;
        }
        var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(name)));
        using var mutex = new Mutex(false, scope + "OhMyDsh-" + hash);
        // Mutex ownership is thread-affine, so no await between WaitOne and
        // ReleaseMutex. EOF also releases it after a crashed Node installer.
        bool owned = false;
        try
        {
            Console.Error.WriteLine("Waiting for browser installation lock");
            try { owned = mutex.WaitOne(TimeSpan.FromSeconds(25)); } catch (AbandonedMutexException) { owned = true; }
            if (!owned) throw new TimeoutException("Another browser installation is in progress");
            Console.Out.WriteLine("locked"); Console.Out.Flush();
            var buffer = new byte[1]; while (Input.Read(buffer) != 0) { }
        }
        finally { if (owned) mutex.ReleaseMutex(); }
        await Task.CompletedTask;
    }

    private sealed record Registration(int View, bool KeyExists, bool HasValue, string? Value);
    [SupportedOSPlatform("windows")]
    private static async Task RegistryCommand(string[] args)
    {
        string host = args[1];
        if (!System.Text.RegularExpressions.Regex.IsMatch(host, "^[a-z0-9_]+(?:\\.[a-z0-9_]+)+$", System.Text.RegularExpressions.RegexOptions.CultureInvariant)) throw new ArgumentException("Invalid native messaging host name");
        string keyPath = @"Software\Google\Chrome\NativeMessagingHosts\" + host;
        var views = Environment.Is64BitOperatingSystem ? new[] { RegistryView.Registry32, RegistryView.Registry64 } : new[] { RegistryView.Registry32 };
        var before = views.Select(view => ReadRegistration(view, keyPath)).ToArray();
        if (args[0] == "registry-read" && args.Length == 2) { await Print(before); return; }
        if (args[0] == "registry-set" && args.Length == 3)
        {
            string path = Path.GetFullPath(args[2]);
            if (before.Any(entry => entry.HasValue && !string.Equals(entry.Value, path, StringComparison.OrdinalIgnoreCase))) throw new IOException("这个 Chrome 已连接其他实例，未替换注册表中的连接程序");
            try
            {
                foreach (var view in views) { using var hive = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, view); using var key = hive.CreateSubKey(keyPath); key.SetValue("", path, RegistryValueKind.String); }
            }
            catch { RestoreRegistration(keyPath, path, before); throw; }
            await Print(before); return;
        }
        if (args[0] == "registry-restore" && args.Length == 4)
        {
            RestoreRegistration(keyPath, Path.GetFullPath(args[2]), JsonSerializer.Deserialize<Registration[]>(args[3], Json) ?? throw new InvalidDataException("Invalid registration snapshot"));
            await Print(new { restored = true }); return;
        }
        throw new ArgumentException("Invalid registry operation");
    }
    [SupportedOSPlatform("windows")]
    private static Registration ReadRegistration(RegistryView view, string path)
    {
        using var hive = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, view); using var key = hive.OpenSubKey(path);
        bool hasValue = key?.GetValueNames().Contains("") ?? false;
        if (hasValue && key!.GetValueKind("") != RegistryValueKind.String) throw new IOException("Existing browser registration is not a string; it was not changed");
        return new Registration((int)view, key != null, hasValue, key?.GetValue("", null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string);
    }
    [SupportedOSPlatform("windows")]
    private static void RestoreRegistration(string path, string expected, Registration[] records)
    {
        foreach (var record in records)
        {
            var current = ReadRegistration((RegistryView)record.View, path);
            if (current.HasValue && current.Value != record.Value && !string.Equals(current.Value, expected, StringComparison.OrdinalIgnoreCase)) throw new IOException("Browser registration changed during recovery; it was not overwritten");
        }
        foreach (var record in records.Reverse())
        {
            using var hive = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, (RegistryView)record.View);
            using (var key = hive.OpenSubKey(path, true))
            {
                if (key == null) { if (record.HasValue) throw new IOException("Browser registration disappeared during recovery"); continue; }
                if (record.HasValue) key.SetValue("", record.Value!, RegistryValueKind.String); else key.DeleteValue("", false);
                if (record.KeyExists || key.ValueCount != 0 || key.SubKeyCount != 0) continue;
            }
            hive.DeleteSubKey(path, false);
        }
    }
}
