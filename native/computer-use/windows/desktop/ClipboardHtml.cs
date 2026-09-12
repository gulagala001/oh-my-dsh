using System.Text;

internal static class ClipboardHtml
{
    internal static string Encode(string fragment)
    {
        const string prefix = "<html><head><meta charset=\"utf-8\"></head><body><!--StartFragment-->", suffix = "<!--EndFragment--></body></html>";
        static string Header(int start, int end, int first, int last) => $"Version:1.0\r\nStartHTML:{start:D10}\r\nEndHTML:{end:D10}\r\nStartFragment:{first:D10}\r\nEndFragment:{last:D10}\r\n";
        int start = Encoding.UTF8.GetByteCount(Header(0, 0, 0, 0)), first = start + Encoding.UTF8.GetByteCount(prefix), last = first + Encoding.UTF8.GetByteCount(fragment), end = last + Encoding.UTF8.GetByteCount(suffix);
        return Header(start, end, first, last) + prefix + fragment + suffix;
    }
}
