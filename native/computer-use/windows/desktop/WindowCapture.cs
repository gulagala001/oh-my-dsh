using System.Runtime.InteropServices;
using System.Threading.Channels;
using Windows.Graphics;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

internal sealed record WindowFrame(string Data, int Width, int Height, WindowBounds Bounds, uint Dpi, long At);

internal sealed class WindowCapture : IDisposable
{
    private readonly WindowTarget target;
    private readonly IDirect3DDevice device;
    private readonly GraphicsCaptureItem item;
    private readonly Direct3D11CaptureFramePool pool;
    private readonly GraphicsCaptureSession session;
    private readonly Channel<(Direct3D11CaptureFrame Frame, WindowBounds Bounds, uint Dpi)> frames = Channel.CreateBounded<(Direct3D11CaptureFrame, WindowBounds, uint)>(1);
    private SizeInt32 size;
    private bool closed, disposed, sessionDisposed, poolDisposed, deviceDisposed;
    private readonly object gate = new();

    internal static bool Supported => GraphicsCaptureSession.IsSupported();
    internal WindowCapture(WindowTarget target)
    {
        WindowCatalog.RequireInteractive();
        if (!Supported) throw new NativeFailure("CAPTURE_UNAVAILABLE", "Windows Graphics Capture is not available on this device");
        if (!target.is_on_screen) throw new NativeFailure("WINDOW_NOT_VISIBLE", "Restore the selected window before capturing it");
        this.target = target;
        device = CreateDevice();
        try
        {
            var interop = GraphicsCaptureItem.As<IGraphicsCaptureItemInterop>();
            var iid = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
            var pointer = interop.CreateForWindow(new IntPtr(target.window_id), in iid);
            try { item = WinRT.MarshalInterface<GraphicsCaptureItem>.FromAbi(pointer); }
            finally { Marshal.Release(pointer); }
            size = item.Size;
            pool = Direct3D11CaptureFramePool.CreateFreeThreaded(device, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, size);
            try
            {
                session = pool.CreateCaptureSession(item);
                session.IsCursorCaptureEnabled = false;
                pool.FrameArrived += Arrived; item.Closed += Closed;
                try { session.StartCapture(); }
                catch { pool.FrameArrived -= Arrived; item.Closed -= Closed; session.Dispose(); throw; }
            }
            catch { pool.Dispose(); throw; }
        }
        catch { device.Dispose(); throw; }
    }
    private void Closed(GraphicsCaptureItem sender, object args)
    {
        lock (gate) { closed = true; frames.Writer.TryComplete(new NativeFailure("STALE_WINDOW", "The captured window was closed")); }
    }
    private void Arrived(Direct3D11CaptureFramePool sender, object args)
    {
        // Never wait for async image conversion here: Windows 10 can deadlock
        // if its capture callback is blocked while the surface is copied.
        lock (gate)
        {
            if (disposed || closed) return;
            try
            {
                var frame = sender.TryGetNextFrame(); if (frame is null) return;
                try
                {
                    var current = WindowCatalog.Read(target.pid, target.window_id, target.process_identity);
                    while (frames.Reader.TryRead(out var old)) old.Frame.Dispose();
                    if (!frames.Writer.TryWrite((frame, current.bounds, current.dpi))) frame.Dispose();
                }
                catch { frame.Dispose(); throw; }
            }
            catch (Exception error) { frames.Writer.TryComplete(error); }
        }
    }
    internal async Task<WindowFrame> Next(int maxDimension, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token); deadline.CancelAfter(5000);
        while (true)
        {
            WindowCatalog.RequireInteractive();
            var current = WindowCatalog.Read(target.pid, target.window_id, target.process_identity);
            if (!current.is_on_screen) throw new NativeFailure("WINDOW_NOT_VISIBLE", "The selected window is minimized or unavailable");
            (Direct3D11CaptureFrame Frame, WindowBounds Bounds, uint Dpi) captured;
            try { captured = await frames.Reader.ReadAsync(deadline.Token); }
            catch (ChannelClosedException error) { throw error.InnerException ?? new NativeFailure("CAPTURE_INTERRUPTED", "The window capture stream ended"); }
            using var frame = captured.Frame;
            if (frame.ContentSize.Width <= 0 || frame.ContentSize.Height <= 0) continue;
            if (frame.ContentSize.Width != size.Width || frame.ContentSize.Height != size.Height)
            {
                lock (gate)
                {
                    size = frame.ContentSize;
                    while (frames.Reader.TryRead(out var old)) old.Frame.Dispose();
                    pool.Recreate(device, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, size);
                }
                continue;
            }
            if (captured.Bounds != current.bounds || captured.Dpi != current.dpi || frame.ContentSize.Width != current.bounds.width || frame.ContentSize.Height != current.bounds.height)
                throw new NativeFailure("CAPTURE_GEOMETRY_CHANGED", "Window frame and screen geometry do not match; capture again after the window settles");
            using var bitmap = await SoftwareBitmap.CreateCopyFromSurfaceAsync(frame.Surface, BitmapAlphaMode.Ignore).AsTask(deadline.Token);
            using var stream = new InMemoryRandomAccessStream();
            var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream).AsTask(deadline.Token);
            encoder.SetSoftwareBitmap(bitmap);
            double scale = Math.Min(1, (double)maxDimension / Math.Max(current.bounds.width, current.bounds.height));
            int width = Math.Max(1, (int)Math.Round(current.bounds.width * scale)), height = Math.Max(1, (int)Math.Round(current.bounds.height * scale));
            encoder.BitmapTransform.ScaledWidth = (uint)width; encoder.BitmapTransform.ScaledHeight = (uint)height;
            encoder.BitmapTransform.InterpolationMode = BitmapInterpolationMode.Fant;
            await encoder.FlushAsync().AsTask(deadline.Token);
            var bytes = new byte[checked((int)stream.Size)];
            using var reader = new DataReader(stream.GetInputStreamAt(0)); await reader.LoadAsync((uint)bytes.Length).AsTask(deadline.Token); reader.ReadBytes(bytes);
            deadline.Token.ThrowIfCancellationRequested();
            WindowCatalog.RequireInteractive();
            lock (gate) { if (closed || disposed) throw new NativeFailure("STALE_WINDOW", "The captured window is no longer available"); }
            var after = WindowCatalog.Read(target.pid, target.window_id, target.process_identity);
            if (!after.is_on_screen || after.bounds != captured.Bounds || after.dpi != captured.Dpi) throw new NativeFailure("WINDOW_MOVED", "Window geometry or DPI changed while encoding the image; capture again");
            return new(Convert.ToBase64String(bytes), width, height, captured.Bounds, captured.Dpi, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        }
    }
    public void Dispose()
    {
        lock (gate)
        {
            if (!disposed)
            {
                disposed = true;
                pool.FrameArrived -= Arrived; item.Closed -= Closed; frames.Writer.TryComplete();
            }
        }
        // Dispose outside the callback lock: capture may be finishing an event.
        // Retain unfinished cleanup so a failed Stop can actually be retried.
        if (!sessionDisposed) { session.Dispose(); sessionDisposed = true; }
        if (!poolDisposed) { pool.Dispose(); poolDisposed = true; }
        while (frames.Reader.TryRead(out var frame)) frame.Frame.Dispose();
        if (!deviceDisposed) { device.Dispose(); deviceDisposed = true; }
    }
    private static IDirect3DDevice CreateDevice()
    {
        // BGRA support is required by Windows Graphics Capture. WARP is an
        // explicit software D3D device when hardware creation is unavailable.
        int result = D3D11CreateDevice(IntPtr.Zero, 1, IntPtr.Zero, 0x20, IntPtr.Zero, 0, 7, out var native, out _, out var context);
        if (result < 0) result = D3D11CreateDevice(IntPtr.Zero, 5, IntPtr.Zero, 0x20, IntPtr.Zero, 0, 7, out native, out _, out context);
        Marshal.ThrowExceptionForHR(result);
        try
        {
            var iid = new Guid("54EC77FA-1377-44E6-8C32-88FD5F44C84C");
            Marshal.ThrowExceptionForHR(Marshal.QueryInterface(native, in iid, out var dxgi));
            try
            {
                Marshal.ThrowExceptionForHR(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out var projected));
                try { return WinRT.MarshalInterface<IDirect3DDevice>.FromAbi(projected); }
                finally { Marshal.Release(projected); }
            }
            finally { Marshal.Release(dxgi); }
        }
        finally { if (context != IntPtr.Zero) Marshal.Release(context); if (native != IntPtr.Zero) Marshal.Release(native); }
    }
    [ComImport, Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IGraphicsCaptureItemInterop
    {
        IntPtr CreateForWindow(IntPtr window, in Guid iid);
        IntPtr CreateForMonitor(IntPtr monitor, in Guid iid);
    }
    [DllImport("d3d11.dll")] private static extern int D3D11CreateDevice(IntPtr adapter, int driver, IntPtr software, uint flags, IntPtr levels, uint levelCount, uint sdk, out IntPtr device, out uint feature, out IntPtr context);
    [DllImport("d3d11.dll")] private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr dxgi, out IntPtr device);
}
