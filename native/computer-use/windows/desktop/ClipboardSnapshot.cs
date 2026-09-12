using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Buffers.Binary;

// Preserve rendered clipboard representations, not OLE's private transport
// metadata. Restore checks ownership and writes under one native clipboard lock.
internal sealed class ClipboardSnapshot : IDisposable
{
    private readonly List<Entry> entries = new();
    internal uint Sequence { get; private set; }
    internal static ClipboardSnapshot Read(string[] formats, uint expected, CancellationToken token)
    {
        var snapshot = new ClipboardSnapshot();
        if (!OpenClipboard(IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
        try
        {
            if (GetClipboardSequenceNumber() != expected) throw new NativeFailure("CLIPBOARD_CHANGED", "The clipboard changed before it could be preserved");
            var captured = new HashSet<uint>();
            foreach (string name in formats)
            {
                token.ThrowIfCancellationRequested();
                uint format = (uint)DataFormats.GetDataFormat(name).Id;
                // Serialize actual bitmap pixels with an explicit V5 header,
                // instead of relying on the synthesized DIB's memory layout.
                if (format == 2)
                {
                    if (!formats.Any(value => DataFormats.GetDataFormat(value).Id == 17) && captured.Add(17))
                    {
                        var bitmap = GetClipboardData(2);
                        if (bitmap == IntPtr.Zero) throw new NativeFailure("CLIPBOARD_UNAVAILABLE", "The current clipboard bitmap could not be preserved");
                        snapshot.entries.Add(Entry.Bitmap(bitmap));
                    }
                    continue;
                }
                if (!captured.Add(format)) continue;
                var data = GetClipboardData(format);
                if (data == IntPtr.Zero) throw new NativeFailure("CLIPBOARD_UNAVAILABLE", "The current clipboard format could not be preserved: " + name);
                snapshot.entries.Add(Entry.Copy(format, data));
            }
            snapshot.Sequence = GetClipboardSequenceNumber();
            return snapshot;
        }
        catch { snapshot.Dispose(); throw; }
        finally { CloseClipboard(); }
    }
    internal bool Restore(IntPtr owner, Action started, Action? afterWrite = null)
    {
        if (owner == IntPtr.Zero) throw new ArgumentException("Restoration requires an owning clipboard window", nameof(owner));
        // Keep the backup intact until every format has transferred. A failed
        // write can then retry without depending on a partially restored value.
        var copies = new List<Entry>();
        try
        {
            foreach (var entry in entries) copies.Add(Entry.Copy(entry.Format, entry.Handle));
            if (!OpenClipboard(owner)) throw new Win32Exception(Marshal.GetLastWin32Error());
            try
            {
                if (GetClipboardOwner() != owner) return false;
                if (!EmptyClipboard()) throw new Win32Exception(Marshal.GetLastWin32Error());
                started();
                foreach (var entry in copies)
                {
                    if (SetClipboardData(entry.Format, entry.Handle) == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                    entry.Handle = IntPtr.Zero; // Ownership transferred to Windows.
                    afterWrite?.Invoke();
                }
                return true;
            }
            finally { CloseClipboard(); }
        }
        finally { foreach (var entry in copies) entry.Dispose(); }
    }
    public void Dispose() { foreach (var entry in entries) entry.Dispose(); entries.Clear(); }

    private sealed class Entry(uint format, IntPtr handle) : IDisposable
    {
        internal readonly uint Format = format;
        internal IntPtr Handle = handle;
        internal static Entry Bitmap(IntPtr source)
        {
            var bitmap = Imaging.CreateBitmapSourceFromHBitmap(source, IntPtr.Zero, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
            var image = new FormatConvertedBitmap(bitmap, PixelFormats.Bgra32, null, 0);
            int stride = checked(image.PixelWidth * 4), size = checked(stride * image.PixelHeight);
            var bytes = new byte[checked(124 + size)];
            void Header(int offset, int value) => BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(offset, 4), value);
            Header(0, 124); Header(4, image.PixelWidth); Header(8, -image.PixelHeight);
            bytes[12] = 1; bytes[14] = 32; // one plane, 32 bits per pixel
            Header(16, 3); Header(20, size); // BI_BITFIELDS, top-down BGRA
            Header(40, 0x00ff0000); Header(44, 0x0000ff00); Header(48, 0x000000ff); Header(52, unchecked((int)0xff000000));
            Header(56, 0x73524742); // LCS_sRGB
            image.CopyPixels(Int32Rect.Empty, bytes, stride, 124);
            var memory = GlobalAlloc(0x42, (UIntPtr)bytes.Length);
            if (memory == IntPtr.Zero) throw new OutOfMemoryException();
            try
            {
                var target = GlobalLock(memory);
                if (target == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                try { Marshal.Copy(bytes, 0, target, bytes.Length); }
                finally { GlobalUnlock(memory); }
                return new Entry(17, memory);
            }
            catch { GlobalFree(memory); throw; }
        }
        internal static Entry Copy(uint format, IntPtr source)
        {
            IntPtr copy;
            if (format is 2 or 0x82) copy = CopyImage(source, 0, 0, 0, 0x2000);
            else if (format is 14 or 0x8e) copy = CopyEnhMetaFileW(source, null);
            else if (format is 3 or 0x83)
            {
                var locked = GlobalLock(source);
                if (locked == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                MetafilePicture picture;
                try { picture = Marshal.PtrToStructure<MetafilePicture>(locked); }
                finally { GlobalUnlock(source); }
                picture.Metafile = CopyMetaFileW(picture.Metafile, null);
                if (picture.Metafile == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                copy = GlobalAlloc(0x42, (UIntPtr)Marshal.SizeOf<MetafilePicture>());
                try
                {
                    if (copy == IntPtr.Zero) throw new OutOfMemoryException();
                    var destination = GlobalLock(copy);
                    if (destination == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                    try { Marshal.StructureToPtr(picture, destination, false); }
                    finally { GlobalUnlock(copy); }
                }
                catch { DeleteMetaFile(picture.Metafile); if (copy != IntPtr.Zero) GlobalFree(copy); throw; }
            }
            else
            {
                if (GlobalFlags(source) == 0x8000) throw new NativeFailure("CLIPBOARD_UNAVAILABLE", "This clipboard handle cannot be preserved (format " + format + ")");
                int size = checked((int)GlobalSize(source).ToUInt64());
                copy = GlobalAlloc(0x42, (UIntPtr)size);
                if (copy == IntPtr.Zero) throw new OutOfMemoryException();
                try
                {
                    if (size > 0)
                    {
                        var from = GlobalLock(source); var to = GlobalLock(copy);
                        try
                        {
                            if (from == IntPtr.Zero || to == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                            var bytes = new byte[size]; Marshal.Copy(from, bytes, 0, size); Marshal.Copy(bytes, 0, to, size);
                        }
                        finally { if (from != IntPtr.Zero) GlobalUnlock(source); if (to != IntPtr.Zero) GlobalUnlock(copy); }
                    }
                }
                catch { GlobalFree(copy); throw; }
            }
            if (copy == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            return new Entry(format, copy);
        }
        public void Dispose()
        {
            if (Handle == IntPtr.Zero) return;
            if (Format is 2 or 0x82) DeleteObject(Handle);
            else if (Format is 14 or 0x8e) DeleteEnhMetaFile(Handle);
            else
            {
                if (Format is 3 or 0x83)
                {
                    var data = GlobalLock(Handle);
                    if (data != IntPtr.Zero) { DeleteMetaFile(Marshal.PtrToStructure<MetafilePicture>(data).Metafile); GlobalUnlock(Handle); }
                }
                GlobalFree(Handle);
            }
            Handle = IntPtr.Zero;
        }
    }
    [StructLayout(LayoutKind.Sequential)] private struct MetafilePicture { internal int Mapping, Width, Height; internal IntPtr Metafile; }
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool OpenClipboard(IntPtr owner);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseClipboard();
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool EmptyClipboard();
    [DllImport("user32.dll")] private static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] private static extern IntPtr GetClipboardOwner();
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetClipboardData(uint format);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetClipboardData(uint format, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr CopyImage(IntPtr image, uint type, int width, int height, uint flags);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CopyEnhMetaFileW(IntPtr metafile, string? filename);
    [DllImport("gdi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CopyMetaFileW(IntPtr metafile, string? filename);
    [DllImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DeleteObject(IntPtr value);
    [DllImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DeleteEnhMetaFile(IntPtr value);
    [DllImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DeleteMetaFile(IntPtr value);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr GlobalAlloc(uint flags, UIntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr GlobalLock(IntPtr handle);
    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GlobalUnlock(IntPtr handle);
    [DllImport("kernel32.dll")] private static extern IntPtr GlobalFree(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern UIntPtr GlobalSize(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint GlobalFlags(IntPtr handle);
}
