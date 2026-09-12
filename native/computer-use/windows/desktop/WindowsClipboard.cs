using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

internal sealed class WindowsClipboard : IDisposable
{
    private const string Marker = "ai.trisoul.computer-use.paste";
    private readonly string identity = Guid.NewGuid().ToString("N");
    private readonly Thread thread;
    private readonly Dispatcher dispatcher;
    private DataObject? saved;
    private uint ownership;
    private bool published;
    private long lastRead;
    private long targetReads, lastTargetRead;
    internal long LastRead => Interlocked.Read(ref lastRead);
    internal long TargetReads => Interlocked.Read(ref targetReads);
    internal long LastTargetRead => Interlocked.Read(ref lastTargetRead);
    internal WindowsClipboard()
    {
        var ready = new TaskCompletionSource<Dispatcher>(TaskCreationOptions.RunContinuationsAsynchronously);
        thread = new Thread(() => { ready.SetResult(Dispatcher.CurrentDispatcher); Dispatcher.Run(); }) { IsBackground = true, Name = "OhMyDsh clipboard" };
        thread.SetApartmentState(ApartmentState.STA); thread.Start(); dispatcher = ready.Task.GetAwaiter().GetResult();
    }
    internal Task Publish(string text, string? html, int targetPid, CancellationToken token) => dispatcher.InvokeAsync(() =>
    {
        token.ThrowIfCancellationRequested();
        uint before = GetClipboardSequenceNumber();
        var original = Clipboard.GetDataObject(); saved = new DataObject();
        if (original is not null) foreach (string format in original.GetFormats(false))
        {
            token.ThrowIfCancellationRequested();
            object? value = original.GetData(format, false);
            // Materialize the original representations before changing their
            // owner. Unsupported opaque data is an error, never silently lost.
            object copy = value switch
            {
                string item => item,
                byte[] bytes => bytes.ToArray(),
                string[] names => names.ToArray(),
                MemoryStream memory => new MemoryStream(memory.ToArray()),
                BitmapSource bitmap => CopyBitmap(bitmap),
                _ => throw new NativeFailure("CLIPBOARD_UNAVAILABLE", "The current clipboard contains a format that cannot be preserved; paste was not started")
            };
            saved.SetData(format, copy, false);
        }
        token.ThrowIfCancellationRequested();
        if (GetClipboardSequenceNumber() != before) throw new NativeFailure("CLIPBOARD_CHANGED", "The clipboard changed while preparing paste; the newer value was kept");
        var data = new DataObject(); data.SetData(DataFormats.UnicodeText, text); if (html is not null) data.SetData(DataFormats.Html, ClipboardHtml.Encode(html)); data.SetData(Marker, identity, false);
        var tracked = new TrackingData(data, format =>
        {
            if (format == Marker) return;
            Interlocked.Exchange(ref lastRead, Environment.TickCount64);
            var reader = GetOpenClipboardWindow();
            if (reader != IntPtr.Zero && GetWindowThreadProcessId(reader, out uint pid) != 0 && pid == targetPid)
            { Interlocked.Increment(ref targetReads); Interlocked.Exchange(ref lastTargetRead, Environment.TickCount64); }
        });
        Clipboard.SetDataObject(tracked, false); published = true; ownership = GetClipboardSequenceNumber();
        if (!Owns()) throw new NativeFailure("CLIPBOARD_CHANGED", "The clipboard changed while publishing paste data");
    }).Task;
    private static BitmapSource CopyBitmap(BitmapSource bitmap) { var copy = bitmap.Clone(); copy.Freeze(); return copy; }
    private bool Owns() => published && GetClipboardSequenceNumber() == ownership && Clipboard.GetData(Marker) is string value && value == identity && GetClipboardSequenceNumber() == ownership;
    internal Task<bool> IsOwner() => dispatcher.InvokeAsync(Owns).Task;
    internal Task<bool> Restore() => dispatcher.InvokeAsync(() =>
    {
        if (!published) return true;
        if (!Owns()) { published = false; return false; }
        try { if (saved!.GetFormats(false).Length == 0) Clipboard.Clear(); else Clipboard.SetDataObject(saved, true); }
        catch (Exception error) { throw new NativeFailure("CLIPBOARD_RESTORE_PENDING", "The prior clipboard has not been restored; retry Stop. " + error.Message); }
        published = false; return true;
    }).Task;
    public void Dispose()
    {
        if (published) throw new NativeFailure("CLIPBOARD_RESTORE_PENDING", "Restore the clipboard before closing its provider");
        dispatcher.InvokeShutdown(); if (!thread.Join(2000)) throw new NativeFailure("CLIPBOARD_RESTORE_PENDING", "Clipboard provider shutdown has not finished");
    }
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] private static extern IntPtr GetOpenClipboardWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    private sealed class TrackingData(DataObject data, Action<string> read) : IDataObject
    {
        public object? GetData(string format, bool autoConvert) { read(format); return data.GetData(format, autoConvert); }
        public object? GetData(string format) => GetData(format, true);
        public object? GetData(Type format) => GetData(format.FullName!);
        public bool GetDataPresent(string format, bool autoConvert) => data.GetDataPresent(format, autoConvert);
        public bool GetDataPresent(string format) => data.GetDataPresent(format);
        public bool GetDataPresent(Type format) => data.GetDataPresent(format);
        public string[] GetFormats(bool autoConvert) => data.GetFormats(autoConvert);
        public string[] GetFormats() => data.GetFormats();
        public void SetData(string format, object value, bool autoConvert) => data.SetData(format, value, autoConvert);
        public void SetData(string format, object value) => data.SetData(format, value);
        public void SetData(Type format, object value) => data.SetData(format, value);
        public void SetData(object value) => data.SetData(value);
    }
}
