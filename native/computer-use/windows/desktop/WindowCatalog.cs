using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

internal readonly record struct WindowBounds(int x, int y, int width, int height);
internal sealed record WindowTarget(int pid, long window_id, string process_identity, string app_id, string app_name, string title, WindowBounds bounds, bool is_on_screen, bool focused, uint dpi)
{
    public int layer => 0;
    public bool is_application_window => true;
}

internal static class WindowCatalog
{
    internal static string Identity(int pid)
    {
        try { using var process = Process.GetProcessById(pid); return $"{pid}:{process.StartTime.ToUniversalTime().Ticks}"; }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or Win32Exception) { throw new NativeFailure("APP_EXITED", "The selected process is no longer accessible; choose its current window"); }
    }
    internal static WindowTarget Read(int pid, long id, string? expected = null)
    {
        var hwnd = new IntPtr(id);
        string identity = Identity(pid);
        if (expected is not null && identity != expected) throw new NativeFailure("STALE_PROCESS", "The application restarted; select its current window");
        if (!IsWindow(hwnd) || GetWindowThreadProcessId(hwnd, out uint actual) == 0 || actual != pid || GetAncestor(hwnd, 2) != hwnd)
            throw new NativeFailure("STALE_WINDOW", "The selected application window no longer exists");
        if (!GetWindowRect(hwnd, out var rectangle)) throw new Win32Exception();
        if (DwmGetWindowAttribute(hwnd, 9, out Rect frame, Marshal.SizeOf<Rect>()) == 0 && frame.Right > frame.Left && frame.Bottom > frame.Top) rectangle = frame;
        var name = new StringBuilder(4096); GetWindowTextW(hwnd, name, name.Capacity);
        using var process = Process.GetProcessById(pid);
        int cloaked = 0; _ = DwmGetWindowAttribute(hwnd, 14, out cloaked, sizeof(int));
        var value = new WindowTarget(pid, id, identity, "win-process:" + identity, process.ProcessName, name.ToString(), new(rectangle.Left, rectangle.Top, rectangle.Right - rectangle.Left, rectangle.Bottom - rectangle.Top), IsWindowVisible(hwnd) && !IsIconic(hwnd) && cloaked == 0, GetForegroundWindow() == hwnd, GetDpiForWindow(hwnd));
        if (Identity(pid) != identity || !IsWindow(hwnd)) throw new NativeFailure("STALE_WINDOW", "The window changed during discovery");
        return value;
    }
    internal static WindowTarget[] List(int? pid = null)
    {
        var result = new List<WindowTarget>();
        EnumWindows((hwnd, _) =>
        {
            GetWindowThreadProcessId(hwnd, out uint owner);
            if (owner == Environment.ProcessId || owner == 0 || (pid is not null && owner != pid) || !IsWindowVisible(hwnd) || GetWindowTextLengthW(hwnd) == 0) return true;
            try { var window = Read((int)owner, hwnd.ToInt64()); if (window.bounds.width > 0 && window.bounds.height > 0) result.Add(window); }
            catch (Exception error) when (error is NativeFailure or Win32Exception or InvalidOperationException or ArgumentException) { }
            return true;
        }, IntPtr.Zero);
        return result.ToArray();
    }
    internal static void RequireInteractive()
    {
        var desktop = OpenInputDesktop(0, false, 0x0001);
        if (desktop == IntPtr.Zero) throw new NativeFailure("DESKTOP_UNAVAILABLE", "The interactive desktop is unavailable or locked");
        try
        {
            var name = new StringBuilder(256);
            if (!GetUserObjectInformationW(desktop, 2, name, name.Capacity * 2, out _) || !name.ToString().Equals("Default", StringComparison.OrdinalIgnoreCase))
                throw new NativeFailure("DESKTOP_UNAVAILABLE", "The selected desktop cannot be observed in this session");
        }
        finally { CloseDesktop(desktop); }
    }
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    private delegate bool EnumCallback(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool EnumWindows(EnumCallback callback, IntPtr data);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetWindowRect(IntPtr hwnd, out Rect bounds);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int GetWindowTextW(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int GetWindowTextLengthW(IntPtr hwnd);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, uint attribute, out Rect value, int size);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hwnd, uint attribute, out int value, int size);
    [DllImport("user32.dll")] private static extern IntPtr OpenInputDesktop(uint flags, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint access);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetUserObjectInformationW(IntPtr handle, int index, StringBuilder info, int length, out int needed);
}
