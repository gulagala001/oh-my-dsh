using System.ComponentModel;
using System.Runtime.InteropServices;

// Test-only access to the display scale interface used by Windows Settings.
// These private request types never ship in the desktop runtime. Layout reference:
// https://github.com/lihas/windows-DPI-scaling-sample/blob/master/DPIHelper/DpiHelper.h
internal sealed class DpiFixture : IDisposable
{
    [StructLayout(LayoutKind.Sequential)] private struct Header { public int Type, Size; public uint AdapterLow; public int AdapterHigh; public uint Id; }
    [StructLayout(LayoutKind.Sequential)] private struct ScaleInfo { public Header Header; public int Minimum, Current, Maximum; }
    [StructLayout(LayoutKind.Sequential)] private struct ScaleRequest { public Header Header; public int Value; }
    private static readonly int[] Percentages = [100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500];
    [StructLayout(LayoutKind.Explicit, Size = 220)] private struct DisplayMode
    {
        [FieldOffset(68)] public ushort Size;
        [FieldOffset(72)] public uint Fields;
        [FieldOffset(172)] public uint Width;
        [FieldOffset(176)] public uint Height;
    }
    private ScaleInfo? original;
    private DisplayMode? originalMode;
    internal object Prepare()
    {
        RequireCi(); original ??= Read();
        var mode = new DisplayMode { Size = 220 };
        if (!EnumDisplaySettingsW(null, -1, ref mode)) throw new Win32Exception();
        if (mode.Width < 2560 || mode.Height < 1440)
        {
            originalMode ??= mode;
            SetResolution(Math.Max(mode.Width, 2560u), Math.Max(mode.Height, 1440u));
        }
        return new { width = Math.Max(mode.Width, 2560u), height = Math.Max(mode.Height, 1440u) };
    }
    private static void SetResolution(uint width, uint height)
    {
        var mode = new DisplayMode { Size = 220, Fields = 0x00180000, Width = width, Height = height };
        int result = ChangeDisplaySettingsExW(null, ref mode, IntPtr.Zero, 0, IntPtr.Zero);
        if (result != 0) throw new InvalidOperationException($"CI display cannot use {width}x{height}: {result}");
    }
    private static void RequireCi()
    {
        if (Environment.GetEnvironmentVariable("GITHUB_ACTIONS") != "true") throw new InvalidOperationException("Display mutation is restricted to disposable CI desktops");
    }
    internal object Set(int percent)
    {
        RequireCi();
        original ??= Read();
        var info = Read(); int index = Array.IndexOf(Percentages, percent), value = index + info.Minimum;
        if (index < 0 || value < info.Minimum || value > info.Maximum) throw new InvalidOperationException($"Display does not support {percent}% scaling (range {info.Minimum}..{info.Maximum})");
        Apply(info.Header, value); var after = Read(); return new { percent, requestedRelative = value, actualRelative = after.Current, minimumRelative = after.Minimum, maximumRelative = after.Maximum };
    }
    private static ScaleInfo Read()
    {
        Check(GetDisplayConfigBufferSizes(2, out uint paths, out uint modes));
        // DISPLAYCONFIG_PATH_INFO is 72 bytes; DISPLAYCONFIG_MODE_INFO is 64.
        var pathData = Marshal.AllocHGlobal(checked((int)paths * 72));
        var modeData = Marshal.AllocHGlobal(checked((int)modes * 64));
        try
        {
            Check(QueryDisplayConfig(2, ref paths, pathData, ref modes, modeData, IntPtr.Zero));
            if (paths != 1) throw new InvalidOperationException("DPI fixture requires exactly one active display path");
            var info = new ScaleInfo { Header = new Header { Type = -3, Size = Marshal.SizeOf<ScaleInfo>(), AdapterLow = unchecked((uint)Marshal.ReadInt32(pathData, 0)), AdapterHigh = Marshal.ReadInt32(pathData, 4), Id = unchecked((uint)Marshal.ReadInt32(pathData, 8)) } };
            Check(DisplayConfigGetDeviceInfo(ref info)); return info;
        }
        finally { Marshal.FreeHGlobal(pathData); Marshal.FreeHGlobal(modeData); }
    }
    private static void Apply(Header header, int value)
    {
        header.Type = -4; header.Size = Marshal.SizeOf<ScaleRequest>();
        var request = new ScaleRequest { Header = header, Value = value }; Check(DisplayConfigSetDeviceInfo(ref request));
    }
    public void Dispose()
    {
        if (originalMode is { } mode) { SetResolution(mode.Width, mode.Height); originalMode = null; }
        if (original is { } saved) { Apply(saved.Header, saved.Current); original = null; }
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool EnumDisplaySettingsW(string? device, int index, ref DisplayMode mode);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)] private static extern int ChangeDisplaySettingsExW(string? device, ref DisplayMode mode, IntPtr window, uint flags, IntPtr data);
    private static void Check(int result) { if (result != 0) throw new Win32Exception(result, "CI display DPI operation failed"); }
    [DllImport("user32.dll")] private static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
    [DllImport("user32.dll")] private static extern int QueryDisplayConfig(uint flags, ref uint paths, IntPtr pathData, ref uint modes, IntPtr modeData, IntPtr topology);
    [DllImport("user32.dll")] private static extern int DisplayConfigGetDeviceInfo(ref ScaleInfo request);
    [DllImport("user32.dll")] private static extern int DisplayConfigSetDeviceInfo(ref ScaleRequest request);
}
