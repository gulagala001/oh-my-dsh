using System.Buffers.Binary;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

internal sealed record WindowsClipboardImage(byte[] Png, BitmapSource Bitmap)
{
    internal const int MaximumBytes = 2 * 1024 * 1024;
    private const int MaximumDimension = 16384, MaximumPixels = 32 * 1024 * 1024;
    internal static WindowsClipboardImage Decode(JsonElement args, CancellationToken token)
    {
        if (!args.TryGetProperty("pngBase64", out var argument) || argument.ValueKind != JsonValueKind.String)
            throw Invalid("Copy requires a base64 PNG string");
        string encoded = argument.GetString()!;
        if (encoded.Length == 0 || encoded.Length % 4 != 0) throw Invalid("Copy requires a base64 PNG string");
        if (encoded.Length > 4 * ((MaximumBytes + 2) / 3)) throw TooLarge("The screenshot PNG exceeds the 2 MiB clipboard limit");
        // Convert.FromBase64String accepts whitespace; the native contract does not.
        int padding = encoded.EndsWith("==", StringComparison.Ordinal) ? 2 : encoded.EndsWith('=') ? 1 : 0;
        for (int i = 0; i < encoded.Length - padding; i++)
            if (!(encoded[i] is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' or '+' or '/')) throw Invalid("The screenshot is not valid base64 PNG data");
        byte[] png;
        try { png = Convert.FromBase64String(encoded); } catch (FormatException) { throw Invalid("The screenshot is not valid base64 PNG data"); }
        if (png.Length > MaximumBytes) throw TooLarge("The screenshot PNG exceeds the 2 MiB clipboard limit");
        ReadOnlySpan<byte> signature = [137, 80, 78, 71, 13, 10, 26, 10];
        ReadOnlySpan<byte> end = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
        if (png.Length < 45 || !png.AsSpan(0, 8).SequenceEqual(signature) || !png.AsSpan(png.Length - 12).SequenceEqual(end) || BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(8)) != 13 || !png.AsSpan(12, 4).SequenceEqual("IHDR"u8))
            throw Invalid("The screenshot must contain a complete PNG image");
        uint width = BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(16)), height = BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(20));
        if (width == 0 || height == 0) throw Invalid("The screenshot PNG has no valid pixel dimensions");
        if (width > MaximumDimension || height > MaximumDimension) throw TooLarge("The screenshot exceeds the 16384-pixel dimension limit");
        if (width > MaximumPixels / height) throw TooLarge("The screenshot exceeds the 32 Mi pixel limit");
        int offset = 8; bool pixels = false;
        while (offset < png.Length)
        {
            token.ThrowIfCancellationRequested();
            if (png.Length - offset < 12) throw Invalid("The screenshot must contain a complete PNG image");
            uint length = BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(offset));
            if (length > png.Length - offset - 12) throw Invalid("The screenshot must contain a complete PNG image");
            var kind = png.AsSpan(offset + 4, 4);
            if (kind.SequenceEqual("acTL"u8) && (length != 8 || BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(offset + 8)) != 1)) throw Invalid("Copy requires one PNG image");
            if (kind.SequenceEqual("IDAT"u8) && length > 0) pixels = true;
            if (kind.SequenceEqual("IEND"u8) && offset != png.Length - 12) throw Invalid("Copy requires one complete PNG image");
            offset += checked((int)length + 12);
        }
        if (!pixels) throw Invalid("The screenshot PNG has no image data");
        try
        {
            using var stream = new MemoryStream(png, writable: false);
            var decoder = new PngBitmapDecoder(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            if (decoder.Frames.Count != 1) throw Invalid("Copy requires one PNG image");
            var bitmap = new FormatConvertedBitmap(decoder.Frames[0], PixelFormats.Bgra32, null, 0);
            if (bitmap.PixelWidth != width || bitmap.PixelHeight != height) throw Invalid("The screenshot PNG has inconsistent dimensions");
            int stride = checked(bitmap.PixelWidth * 4); var row = new byte[stride];
            // Force pixel decoding before any clipboard mutation, with bounded scratch memory.
            for (int y = 0; y < bitmap.PixelHeight; y++)
            {
                token.ThrowIfCancellationRequested();
                bitmap.CopyPixels(new Int32Rect(0, y, bitmap.PixelWidth, 1), row, stride, 0);
            }
            bitmap.Freeze(); return new WindowsClipboardImage(png, bitmap);
        }
        catch (Exception error) when (error is FileFormatException or NotSupportedException or ArgumentException or IOException)
        { throw Invalid("The screenshot PNG could not be completely decoded"); }
    }
    private static NativeFailure Invalid(string message) => new("INVALID_CLIPBOARD_IMAGE", message);
    private static NativeFailure TooLarge(string message) => new("CLIPBOARD_IMAGE_TOO_LARGE", message);
}
