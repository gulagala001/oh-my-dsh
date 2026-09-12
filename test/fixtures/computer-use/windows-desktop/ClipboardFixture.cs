using System.IO;
using System.Windows;
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
        return new { text = Clipboard.GetText(), bytes = bytes is MemoryStream stream ? Convert.ToBase64String(stream.ToArray()) : null, pastes = Pastes, observedText = ObservedText, observedHtml = ObservedHtml };
    }
    internal void Restore()
    {
        if (original is null) return;
        if (Clipboard.GetData(Marker) is string marker && marker == identity)
        { if (original.GetFormats(false).Length == 0) Clipboard.Clear(); else Clipboard.SetDataObject(original, true); }
        original = null;
    }
}
