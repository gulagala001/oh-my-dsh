using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

// Dedicated CI-desktop fixture. The marker avoids restoring over an already
// observed replacement, but WPF offers no atomic conditional clipboard write.
internal sealed class ClipboardFixture
{
    private const string Marker = "oh-my-dsh.clipboard-fixture";
    private readonly string identity = Guid.NewGuid().ToString("N");
    private DataObject? original;
    internal string Mode = "normal";
    internal int Pastes;
    internal string? ObservedText, ObservedHtml;

    internal void Seed(string text)
    {
        if (original is null)
        {
            var source = Clipboard.GetDataObject(); var copy = new DataObject();
            if (source is not null) foreach (var format in source.GetFormats(false))
            {
                object value = source.GetData(format, false) switch
                {
                    string item => item,
                    string[] items => items.ToArray(),
                    byte[] bytes => bytes.ToArray(),
                    MemoryStream stream => new MemoryStream(stream.ToArray()),
                    BitmapSource bitmap => bitmap.Clone(),
                    _ => throw new InvalidOperationException("Fixture cannot preserve this clipboard format: " + format)
                };
                copy.SetData(format, value, false);
            }
            original = copy;
        }
        var data = new DataObject(); data.SetData(DataFormats.UnicodeText, text);
        data.SetData(Marker, identity, false);
        data.SetData("oh-my-dsh.fixture-bytes", new MemoryStream([0, 12, 127, 255]), false);
        var sampleBitmap = BitmapSource.Create(2, 1, 96, 96, PixelFormats.Bgra32, null, new byte[] { 10, 20, 30, 255, 40, 50, 60, 255 }, 8);
        sampleBitmap.Freeze(); data.SetData(DataFormats.Bitmap, sampleBitmap, false);
        data.SetData(DataFormats.FileDrop, new[] { Path.Combine(Path.GetTempPath(), "clipboard fixture \u4e2d\u6587.txt") }, false);
        Clipboard.SetDataObject(data, true);
    }
    internal void Pasting(object sender, DataObjectPastingEventArgs args)
    {
        Pastes++;
        ObservedText = args.DataObject.GetData(DataFormats.UnicodeText) as string;
        ObservedHtml = args.DataObject.GetData(DataFormats.Html) as string;
        if (Mode == "copy") { Seed("用户中途复制的新内容🙂"); args.CancelCommand(); }
        if (Mode == "reject") args.CancelCommand();
    }
    internal object State()
    {
        var bytes = Clipboard.GetData("oh-my-dsh.fixture-bytes");
        string? pixels = null;
        if (Clipboard.GetData(DataFormats.Bitmap) is BitmapSource bitmap)
        {
            var image = new FormatConvertedBitmap(bitmap, PixelFormats.Bgra32, null, 0);
            var data = new byte[image.PixelWidth * image.PixelHeight * 4]; image.CopyPixels(data, image.PixelWidth * 4, 0); pixels = Convert.ToBase64String(data);
        }
        return new { text = Clipboard.GetText(), bytes = bytes is MemoryStream stream ? Convert.ToBase64String(stream.ToArray()) : null, pixels, files = Clipboard.GetFileDropList().Cast<string>().ToArray(), pastes = Pastes, observedText = ObservedText, observedHtml = ObservedHtml };
    }
    internal void Restore()
    {
        if (original is null) return;
        if (Clipboard.GetData(Marker) is string marker && marker == identity)
        { if (original.GetFormats(false).Length == 0) Clipboard.Clear(); else Clipboard.SetDataObject(original, true); }
        original = null;
    }
    internal object AtomicProbe()
    {
        Seed("atomic baseline");
        var expectedBytes = Clipboard.GetData("oh-my-dsh.fixture-bytes") is MemoryStream originalBytes ? originalBytes.ToArray() : throw new InvalidOperationException("Fixture binary representation is missing");
        var formats = (Clipboard.GetDataObject() ?? throw new InvalidOperationException("Fixture clipboard is missing")).GetFormats(false);
        using var backup = ClipboardSnapshot.Read(formats, GetClipboardSequenceNumber(), CancellationToken.None);
        Clipboard.SetText("temporary value"); var owner = GetClipboardOwner();
        bool locked = false, partial = false;
        try
        {
            backup.Restore(owner, () => locked = Child("--clipboard-lock-probe") == 42,
                () => { partial = true; throw new InvalidOperationException("fixture interrupted restore"); });
        }
        catch (InvalidOperationException error) when (error.Message == "fixture interrupted restore") { }
        bool retried = backup.Restore(owner, () => { });
        bool restored = retried && Clipboard.GetText() == "atomic baseline" && Clipboard.GetData("oh-my-dsh.fixture-bytes") is MemoryStream bytes && bytes.ToArray().SequenceEqual(expectedBytes);
        Clipboard.SetText("another temporary value"); owner = GetClipboardOwner();
        if (Child("--clipboard-copy-probe") != 0) throw new InvalidOperationException("Clipboard copy probe failed");
        bool newer = !backup.Restore(owner, () => { }) && Clipboard.GetText() == "newer clipboard copy";
        Seed("atomic probe complete");
        return new { locked, partial, restored, newer };
    }
    private static int Child(string argument)
    {
        var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true };
        start.ArgumentList.Add(argument);
        using var child = Process.Start(start)!;
        if (!child.WaitForExit(5000)) { child.Kill(true); child.WaitForExit(); throw new TimeoutException("Clipboard child probe did not exit"); }
        return child.ExitCode;
    }
    internal static int? RunProbe(string[] args)
    {
        if (args.SequenceEqual(new[] { "--clipboard-copy-probe" })) { Clipboard.SetText("newer clipboard copy"); return 0; }
        if (!args.SequenceEqual(new[] { "--clipboard-lock-probe" })) return null;
        if (!OpenClipboard(IntPtr.Zero)) return 42;
        CloseClipboard(); return 0;
    }
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardOwner();
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool OpenClipboard(IntPtr owner);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseClipboard();
}

internal sealed class NativeFailure(string code, string message) : Exception(message)
{
    internal string Code => code;
}
