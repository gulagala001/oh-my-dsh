using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

internal sealed class WindowsPresentationWindow
{
    private readonly Thread thread;
    private readonly Dispatcher dispatcher;
    private readonly Action onClosed;
    private readonly Func<Task> onActivate;
    private Window? window;
    private Image? image;
    private IntPtr handle;
    private bool visible, explicitBounds, closingByHost;
    private volatile bool closed;
    private double maximumDisplaySize;
    internal long Handle => handle.ToInt64();
    internal WindowsPresentationWindow(double maximum, bool shown, Action onClosed, Func<Task> onActivate)
    {
        maximumDisplaySize = maximum; visible = shown; this.onClosed = onClosed; this.onActivate = onActivate;
        var ready = new TaskCompletionSource<Dispatcher>(TaskCreationOptions.RunContinuationsAsynchronously);
        thread = new Thread(() => { ready.SetResult(Dispatcher.CurrentDispatcher); Dispatcher.Run(); }) { IsBackground = true, Name = "OpenCU Windows presentation" };
        thread.SetApartmentState(ApartmentState.STA); thread.Start(); dispatcher = ready.Task.GetAwaiter().GetResult();
    }
    internal Task Create() => dispatcher.InvokeAsync(() =>
    {
        image = new Image { Stretch = Stretch.Uniform, SnapsToDevicePixels = true };
        image.MouseLeftButtonUp += (sender, args) => { args.Handled = true; _ = Task.Run(this.onActivate); };
        var content = new Grid(); content.Children.Add(image);
        var close = new Button { Content = "\u00d7", Width = 24, Height = 24, FontSize = 18,
            HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top,
            Foreground = Brushes.White, Background = new SolidColorBrush(Color.FromArgb(210, 32, 32, 32)),
            BorderThickness = new Thickness(0), Padding = new Thickness(0), Focusable = false, IsTabStop = false, ToolTip = "Close" };
        close.Click += (_, args) => { args.Handled = true; window?.Close(); };
        content.Children.Add(close);
        window = new Window { Title = "OpenCU Native Presentation", Content = content, Width = maximumDisplaySize, Height = maximumDisplaySize,
            WindowStyle = WindowStyle.None, ResizeMode = ResizeMode.NoResize, ShowInTaskbar = false, ShowActivated = false,
            Topmost = true, AllowsTransparency = true, Background = Brushes.Transparent, Focusable = false };
        window.Closed += (_, _) =>
        {
            closed = true; visible = false; window = null; image = null;
            if (!closingByHost) this.onClosed();
        };
        var area = SystemParameters.WorkArea;
        window.Left = Math.Max(area.Left, area.Right - maximumDisplaySize - 24); window.Top = area.Top + 24;
        handle = new WindowInteropHelper(window).EnsureHandle();
        SetWindowLongPtr(handle, -20, new IntPtr(GetWindowLongPtr(handle, -20).ToInt64() | 0x08000000L | 0x80L));
    }).Task;
    internal Task Present(WindowFrame frame) => dispatcher.InvokeAsync(() =>
    {
        if (closed || window is null || image is null) throw new NativeFailure("NATIVE_PRESENTATION_CLOSED", "The Windows presentation window has closed");
        using var stream = new MemoryStream(Convert.FromBase64String(frame.Data), writable: false);
        var bitmap = new BitmapImage(); bitmap.BeginInit(); bitmap.CacheOption = BitmapCacheOption.OnLoad; bitmap.StreamSource = stream; bitmap.EndInit(); bitmap.Freeze();
        if (bitmap.PixelWidth != frame.Width || bitmap.PixelHeight != frame.Height) throw new NativeFailure("INVALID_NATIVE_FRAME", "The presentation frame dimensions do not match the capture");
        image.Source = bitmap;
        if (!explicitBounds)
        {
            double scale = maximumDisplaySize / Math.Max(frame.Width, frame.Height);
            window.Width = Math.Max(1, frame.Width * scale); window.Height = Math.Max(1, frame.Height * scale);
        }
        if (visible && !window.IsVisible) window.Show();
        if (!visible && window.IsVisible) window.Hide();
    }).Task;
    internal Task Update(bool? shown, double? maximum, WindowBounds? bounds) => dispatcher.InvokeAsync(() =>
    {
        if (closed || window is null) throw new NativeFailure("NATIVE_PRESENTATION_CLOSED", "The Windows presentation window has closed");
        if (shown is not null) visible = shown.Value;
        if (maximum is not null)
        {
            maximumDisplaySize = maximum.Value;
            if (!explicitBounds && image?.Source is BitmapSource bitmap)
            {
                double scale = maximumDisplaySize / Math.Max(bitmap.PixelWidth, bitmap.PixelHeight);
                window.Width = Math.Max(1, bitmap.PixelWidth * scale); window.Height = Math.Max(1, bitmap.PixelHeight * scale);
            }
        }
        if (bounds is not null)
        {
            var value = bounds.Value;
            if (!SetWindowPos(handle, IntPtr.Zero, value.x, value.y, value.width, value.height, 0x0014)) throw new Win32Exception(Marshal.GetLastWin32Error());
            explicitBounds = true;
        }
        if (visible && !window.IsVisible && image?.Source is not null) window.Show();
        if (!visible && window.IsVisible) window.Hide();
    }).Task;
    internal async Task Close()
    {
        if (!closed) await dispatcher.InvokeAsync(() =>
        {
            if (image is not null) image.Source = null;
            closingByHost = true;
            window?.Close();
            if (handle != IntPtr.Zero && IsWindow(handle)) throw new NativeFailure("NATIVE_CLEANUP_UNCONFIRMED", "The Windows presentation HWND has not closed");
            window = null; image = null; closed = true;
        }).Task;
        if (!dispatcher.HasShutdownStarted) dispatcher.InvokeShutdown();
        if (!await Task.Run(() => thread.Join(2000))) throw new NativeFailure("NATIVE_CLEANUP_UNCONFIRMED", "The Windows presentation dispatcher has not stopped");
        if (handle != IntPtr.Zero && IsWindow(handle)) throw new NativeFailure("NATIVE_CLEANUP_UNCONFIRMED", "The Windows presentation HWND has not closed");
    }
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsWindow(IntPtr window);
}
