using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Threading;

internal sealed class WindowsClipboard : IDisposable
{
    private const string Marker = "ai.trisoul.computer-use.paste";
    private readonly string identity = Guid.NewGuid().ToString("N");
    private readonly Thread thread;
    private readonly Dispatcher dispatcher;
    private ClipboardSnapshot? saved;
    private IntPtr owner;
    private bool restoring;
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
        var formats = Clipboard.GetDataObject()?.GetFormats(false) ?? [];
        saved = ClipboardSnapshot.Read(formats, before, token);
        token.ThrowIfCancellationRequested();
        if (GetClipboardSequenceNumber() != saved.Sequence) throw new NativeFailure("CLIPBOARD_CHANGED", "The clipboard changed while preparing paste; the newer value was kept");
        var data = new DataObject(); data.SetData(DataFormats.UnicodeText, text); if (html is not null) data.SetData(DataFormats.Html, ClipboardHtml.Encode(html)); data.SetData(Marker, identity, false);
        var tracked = new TrackingData(data, format =>
        {
            if (format == Marker) return;
            Interlocked.Exchange(ref lastRead, Environment.TickCount64);
            var reader = GetOpenClipboardWindow();
            if (reader != IntPtr.Zero && GetWindowThreadProcessId(reader, out uint pid) != 0 && pid == targetPid)
            { Interlocked.Increment(ref targetReads); Interlocked.Exchange(ref lastTargetRead, Environment.TickCount64); }
        });
        Clipboard.SetDataObject(tracked, false); published = true; owner = GetClipboardOwner();
        if (owner == IntPtr.Zero || GetWindowThreadProcessId(owner, out uint publisher) == 0 || publisher != Environment.ProcessId) throw new NativeFailure("CLIPBOARD_CHANGED", "The clipboard owner changed during publication");
        if (!Owns()) throw new NativeFailure("CLIPBOARD_CHANGED", "The clipboard changed while publishing paste data");
    }).Task;
    private bool Owns() => published && owner != IntPtr.Zero && GetClipboardOwner() == owner && (restoring || Clipboard.GetData(Marker) is string value && value == identity) && GetClipboardOwner() == owner;
    internal Task<bool> IsOwner() => dispatcher.InvokeAsync(Owns).Task;
    internal Task<bool> Restore() => dispatcher.InvokeAsync(() =>
    {
        if (!published) return true;
        bool restored;
        try
        {
            if (!Owns()) { published = false; return false; }
            restored = saved!.Restore(owner, () => restoring = true);
        }
        catch (Exception error) { throw new NativeFailure("CLIPBOARD_RESTORE_PENDING", "The prior clipboard has not been restored; retry Stop. " + error.Message); }
        published = false; return restored;
    }).Task;
    public void Dispose()
    {
        if (published) throw new NativeFailure("CLIPBOARD_RESTORE_PENDING", "Restore the clipboard before closing its provider");
        saved?.Dispose(); saved = null;
        dispatcher.InvokeShutdown(); if (!thread.Join(2000)) throw new NativeFailure("CLIPBOARD_RESTORE_PENDING", "Clipboard provider shutdown has not finished");
    }
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardOwner();
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
