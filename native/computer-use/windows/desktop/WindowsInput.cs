using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

// A Windows desktop has one foreground input stream. Its session lease is
// owned and released on the same MTA as UIA actions; observation has no lease.
internal sealed class WindowsInput(Action<object>? pointer = null)
{
    // Windows mouse hooks can return only the low DWORD of SendInput's
    // pointer-sized extra information. Use a nonzero positive 31-bit marker
    // so keyboard, mouse and recovery processes compare the same value.
    internal readonly ulong Tag = (uint)RandomNumberGenerator.GetInt32(1, int.MaxValue);
    private Mutex? mutex;
    private InputIntervention? intervention;
    private bool ownsMutex;
    private long baseline;
    private long activatedWindow;
    private bool foregroundLost;
    private Point? expectedCursor;
    private bool cursorIntervened;
    private WindowsInputEvent[] pendingReleases = [];
    private readonly List<WindowsInputEvent> acceptedInputs = new();
    private Process? recovery;
    private bool recoveryArmed;
    private long pointerSequence;
    internal static string MutexName(string suffix)
    {
        using var identity = WindowsIdentity.GetCurrent(); using var process = Process.GetCurrentProcess();
        return "Local\\OhMyDsh-DesktopInput-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity.User?.Value + ":" + process.SessionId))) + suffix;
    }

    internal void Begin(WindowTarget target, CancellationToken token)
    {
        BeginLaunch(token);
        var current = WindowCatalog.Read(target.pid, target.window_id, target.process_identity);
        if (!current.is_on_screen) throw new NativeFailure("WINDOW_NOT_VISIBLE", "Restore the target window before controlling it");
        if (GetForegroundWindow() != new IntPtr(target.window_id))
        {
            if (activatedWindow == target.window_id) { foregroundLost = true; throw new NativeFailure("FOREGROUND_LOST", "The selected window lost foreground after control began; bind its current window again"); }
            if (!SetForegroundWindow(new IntPtr(target.window_id))) throw new NativeFailure("FOREGROUND_REQUIRED", "Windows did not allow this window to become foreground. Bring the selected window forward and resume control");
            for (int i = 0; i < 20 && GetForegroundWindow() != new IntPtr(target.window_id); i++) { CheckUser(token); token.WaitHandle.WaitOne(10); }
        }
        activatedWindow = target.window_id;
        Check(target, token);
    }
    internal void BeginLaunch(CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (pendingReleases.Length != 0) throw new NativeFailure("INPUT_CLEANUP_PENDING", "The previous input release has not been confirmed; retry Stop");
        if (!ownsMutex)
        {
            mutex ??= new Mutex(false, MutexName(""));
            try { ownsMutex = mutex.WaitOne(0); } catch (AbandonedMutexException) { ownsMutex = true; }
            if (!ownsMutex) throw new NativeFailure("INPUT_BUSY", "Another conversation is controlling this Windows desktop; stop it before taking control");
            using var recovering = new Mutex(false, MutexName("-Recovery")); bool recoveryClear;
            try { recoveryClear = recovering.WaitOne(0); } catch (AbandonedMutexException) { recoveryClear = true; }
            if (!recoveryClear) { mutex.ReleaseMutex(); ownsMutex = false; throw new NativeFailure("INPUT_CLEANUP_PENDING", "The previous controller is still releasing native input"); }
            recovering.ReleaseMutex();
            try { intervention = new InputIntervention(Tag); baseline = intervention.Revision; }
            catch { mutex.ReleaseMutex(); ownsMutex = false; throw; }
        }
        CheckUser(token); WindowCatalog.RequireInteractive();
    }
    internal void CheckUser(CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (foregroundLost) throw new NativeFailure("FOREGROUND_LOST", "Foreground control was interrupted; bind the current target again");
        if (intervention is null || !intervention.Alive) throw new NativeFailure("INPUT_MONITOR_LOST", "The desktop input monitor stopped; bind the application again");
        if (recovery is not null && recovery.HasExited) throw new NativeFailure("INPUT_MONITOR_LOST", "The drag recovery process stopped unexpectedly");
        if (intervention.Revision != baseline)
        {
            if (Environment.GetEnvironmentVariable("TRISOUL_CU_INPUT_DIAGNOSTICS") == "1") Console.Error.WriteLine(intervention.LastIntervention);
            throw new NativeFailure("USER_INTERVENTION", "Desktop control stopped because the user or another input source intervened");
        }
        // SetCursorPos can move the pointer without producing a low-level
        // mouse hook. Also compare the real desktop position between our own
        // sends, so software pointer changes cannot silently inherit control.
        if (!GetCursorPos(out var current)) throw new NativeFailure("INPUT_MONITOR_LOST", "Could not read the desktop cursor position");
        if (expectedCursor is { } expected && (expected.X != current.X || expected.Y != current.Y)) cursorIntervened = true;
        expectedCursor ??= current;
        if (cursorIntervened) throw new NativeFailure("USER_INTERVENTION", "Desktop control stopped because the cursor moved outside the controller's input");
    }
    internal void Check(WindowTarget target, CancellationToken token)
    {
        CheckUser(token); WindowCatalog.RequireInteractive();
        var current = WindowCatalog.Read(target.pid, target.window_id, target.process_identity);
        if (!current.is_on_screen || GetForegroundWindow() != new IntPtr(target.window_id)) { foregroundLost = true; throw new NativeFailure("FOREGROUND_LOST", "The selected window is no longer foreground; control has stopped"); }
        if (current.bounds != target.bounds || current.dpi != target.dpi) throw new NativeFailure("WINDOW_MOVED", "The target geometry or DPI changed; observe it before continuing");
    }
    internal void Send(WindowTarget target, WindowsInputEvent[] events, CancellationToken token)
    {
        Check(target, token);
        // Never release a physical key held by the user to make input succeed.
        foreach (int key in new[] { 1, 2, 4, 0x10, 0x11, 0x12, 0x5b, 0x5c }) if ((GetAsyncKeyState(key) & 0x8000) != 0 && !(key == 1 && pendingReleases.Any(item => item.Type == 0 && item.Value.Mouse.Flags == 4))) throw new NativeFailure("USER_INTERVENTION", "A mouse button or modifier is already held; control has stopped");
        uint accepted = SendInput((uint)events.Length, events, Marshal.SizeOf<WindowsInputEvent>());
        acceptedInputs.AddRange(events.Take(checked((int)accepted)));
        pendingReleases = WindowsInputEvents.Releases(acceptedInputs);
        if (pendingReleases.Length == 0) acceptedInputs.Clear();
        if (events.Take(checked((int)accepted)).Any(item => item.Type == 0))
        {
            if (!GetCursorPos(out var current)) throw new NativeFailure("INPUT_MONITOR_LOST", "Could not confirm the cursor position after native input");
            expectedCursor = current;
        }
        if (accepted == events.Length)
        {
            if (events.Any(item => item.Type == 0) && GetCursorPos(out var at)) Report(target, at.X, at.Y, events.Any(item => item.Type == 0 && (item.Value.Mouse.Flags & (2 | 8 | 32)) != 0));
            return;
        }
        ReleaseInput();
        throw new NativeFailure("INPUT_REJECTED", "Windows rejected native input; the target may have a higher privilege level. No automatic retry was sent");
    }
    internal WindowsInputEvent Move(int x, int y) => WindowsInputEvents.Move(x, y, GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79), Tag);
    internal void Report(WindowTarget target, int x, int y, bool pressed)
    {
        long sequence = ++pointerSequence;
        pointer?.Invoke(new { pid = target.pid, window_id = target.window_id, process_identity = target.process_identity, x = x - target.bounds.x, y = y - target.bounds.y, geometry = target.bounds, buttons = pendingReleases.Any(item => item.Type == 0) ? 1 : 0, sequence, at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), press = pressed ? new { sequence, x = x - target.bounds.x, y = y - target.bounds.y } : null });
    }
    internal short Translate(WindowTarget target, char character)
    {
        uint thread = GetWindowThreadProcessId(new IntPtr(target.window_id), out _);
        return VkKeyScanExW(character, GetKeyboardLayout(thread));
    }
    internal void RequirePoint(WindowTarget target, int x, int y, CancellationToken token)
    {
        Check(target, token);
        if (x < target.bounds.x || y < target.bounds.y || (long)x >= (long)target.bounds.x + target.bounds.width || (long)y >= (long)target.bounds.y + target.bounds.height || GetAncestor(WindowFromPoint(new Point { X = x, Y = y }), 2) != new IntPtr(target.window_id))
            throw new NativeFailure("POINT_OBSCURED", "The requested point is outside the selected window or covered by another window");
    }
    internal void ReleaseInput()
    {
        if (pendingReleases.Length == 0) return;
        uint accepted = SendInput((uint)pendingReleases.Length, pendingReleases, Marshal.SizeOf<WindowsInputEvent>());
        pendingReleases = pendingReleases.Skip(checked((int)accepted)).ToArray();
        if (pendingReleases.Length != 0) throw new NativeFailure("INPUT_CLEANUP_PENDING", "Windows has not confirmed releasing all injected input; retry Stop");
        acceptedInputs.Clear();
        pointer?.Invoke(new { hidden = true });
    }
    internal void StartDragRecovery(CancellationToken token)
    {
        if (recovery is not null) throw new NativeFailure("INPUT_CLEANUP_PENDING", "The previous drag recovery has not stopped");
        using var parent = Process.GetCurrentProcess();
        var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        foreach (string arg in new[] { "input-recovery", parent.Id.ToString(), parent.StartTime.ToUniversalTime().Ticks.ToString(), Tag.ToString() }) start.ArgumentList.Add(arg);
        recovery = Process.Start(start) ?? throw new NativeFailure("INPUT_MONITOR_LOST", "Could not start drag recovery");
        try { RecoveryReply("ready", token); recovery.StandardInput.WriteLine("arm"); recovery.StandardInput.Flush(); RecoveryReply("armed", token); recoveryArmed = true; }
        catch { EndDragRecovery(); throw; }
    }
    private void RecoveryReply(string expected, CancellationToken token)
    {
        var response = recovery!.StandardOutput.ReadLineAsync();
        if (!response.Wait(5000, token) || response.GetAwaiter().GetResult() != expected) throw new NativeFailure("INPUT_MONITOR_LOST", "Drag recovery did not acknowledge its state");
    }
    internal void EndDragRecovery()
    {
        if (recovery is null) return;
        ReleaseInput();
        if (!recovery.HasExited)
        {
            try { if (recoveryArmed) { recovery.StandardInput.WriteLine("clear"); recovery.StandardInput.Flush(); RecoveryReply("cleared", CancellationToken.None); } }
            finally { recovery.StandardInput.Close(); }
        }
        if (!recovery.WaitForExit(5000)) throw new NativeFailure("INPUT_CLEANUP_PENDING", "Drag recovery has not finished; retry Stop");
        // The primary process has just confirmed its own releases. A dead
        // watchdog cannot send later input, so nonzero exit does not prevent
        // cleanup (the active operation already reports monitor loss).
        recovery.Dispose(); recovery = null; recoveryArmed = false;
    }
    internal static void RecoverInput(string[] args)
    {
        int pid = int.Parse(args[1]); long identity = long.Parse(args[2]); ulong tag = ulong.Parse(args[3]);
        using var parent = Process.GetProcessById(pid);
        bool Alive() { try { return !parent.HasExited && parent.StartTime.ToUniversalTime().Ticks == identity; } catch (InvalidOperationException) { return false; } }
        var released = new[] { WindowsInputEvent.Mouse(4, 0, 0, 0, tag) };
        InputRecovery.Run(MutexName("-Recovery"), Alive, () => SendInput(1, released, Marshal.SizeOf<WindowsInputEvent>()) == 1, Console.In, Console.Out);
    }
    internal void Close()
    {
        pointer?.Invoke(new { hidden = true });
        ReleaseInput();
        EndDragRecovery();
        intervention?.Dispose(); intervention = null;
        if (ownsMutex) { mutex!.ReleaseMutex(); ownsMutex = false; }
        mutex?.Dispose(); mutex = null;
    }
    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, WindowsInputEvent[] inputs, int size);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] private static extern IntPtr GetKeyboardLayout(uint thread);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern short VkKeyScanExW(char character, IntPtr layout);
}

internal sealed class InputIntervention : IDisposable
{
    private readonly Thread thread;
    private readonly ulong tag;
    private readonly Hook keyboard, mouse;
    private readonly ManualResetEventSlim ready = new();
    private long revision;
    private string? lastIntervention;
    internal string? LastIntervention => Volatile.Read(ref lastIntervention);
    private uint threadId;
    private Exception? failure;
    private volatile bool alive;
    internal long Revision => Interlocked.Read(ref revision);
    internal bool Alive => alive;
    internal InputIntervention(ulong tag)
    {
        this.tag = tag;
        void Changed(string kind, uint flags, UIntPtr extra)
        {
            Volatile.Write(ref lastIntervention, $"Input intervention: {kind}, flags={flags:x}, extra={extra.ToUInt64():x}, expected={this.tag:x}");
            Interlocked.Increment(ref revision);
        }
        keyboard = (code, message, data) => { if (code >= 0) { var value = Marshal.PtrToStructure<Keyboard>(data); if ((value.Flags & 0x10) == 0 || value.Extra.ToUInt64() != this.tag) Changed("keyboard", value.Flags, value.Extra); } return CallNextHookEx(IntPtr.Zero, code, message, data); };
        mouse = (code, message, data) => { if (code >= 0) { var value = Marshal.PtrToStructure<Mouse>(data); if ((value.Flags & 1) == 0 || value.Extra.ToUInt64() != this.tag) Changed("mouse", value.Flags, value.Extra); } return CallNextHookEx(IntPtr.Zero, code, message, data); };
        thread = new Thread(Watch) { IsBackground = true, Name = "OhMyDsh input monitor" };
        thread.Start(); ready.Wait();
        if (failure is not null) { thread.Join(); ready.Dispose(); throw failure; }
    }
    private void Watch()
    {
        IntPtr keyHook = IntPtr.Zero, mouseHook = IntPtr.Zero;
        try
        {
            threadId = GetCurrentThreadId();
            _ = PeekMessageW(out _, IntPtr.Zero, 0, 0, 0); // Establish the thread message queue before shutdown can post to it.
            keyHook = SetWindowsHookExW(13, keyboard, GetModuleHandleW(null), 0);
            mouseHook = SetWindowsHookExW(14, mouse, GetModuleHandleW(null), 0);
            if (keyHook == IntPtr.Zero || mouseHook == IntPtr.Zero) throw new Win32Exception();
            alive = true; ready.Set();
            int status;
            while ((status = GetMessageW(out var message, IntPtr.Zero, 0, 0)) > 0) { TranslateMessage(ref message); DispatchMessageW(ref message); }
            if (status < 0) failure = new Win32Exception();
        }
        catch (Exception error) { failure = error; }
        finally
        {
            alive = false;
            if (keyHook != IntPtr.Zero) UnhookWindowsHookEx(keyHook);
            if (mouseHook != IntPtr.Zero) UnhookWindowsHookEx(mouseHook);
            ready.Set();
        }
    }
    public void Dispose()
    {
        if (alive && !PostThreadMessageW(threadId, 0x12, UIntPtr.Zero, IntPtr.Zero)) throw new NativeFailure("INPUT_CLEANUP_PENDING", "Input monitor shutdown has not been confirmed");
        if (!thread.Join(2000)) throw new NativeFailure("INPUT_CLEANUP_PENDING", "Input monitor is still running; retry Stop");
        ready.Dispose();
    }
    private delegate IntPtr Hook(int code, UIntPtr message, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] private struct Keyboard { public uint Key, Scan, Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] private struct Mouse { public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] private struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public int X, Y; public uint Private; }
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)] private static extern IntPtr SetWindowsHookExW(int id, Hook callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, UIntPtr message, IntPtr data);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern IntPtr GetModuleHandleW(string? module);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int GetMessageW(out Message message, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool PeekMessageW(out Message message, IntPtr hwnd, uint min, uint max, uint flags);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool TranslateMessage(ref Message message);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern IntPtr DispatchMessageW(ref Message message);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool PostThreadMessageW(uint thread, uint message, UIntPtr wparam, IntPtr lparam);
}
