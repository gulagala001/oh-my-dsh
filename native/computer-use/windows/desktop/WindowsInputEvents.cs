using System.Runtime.InteropServices;

// These are the actual Win32 INPUT records used by SendInput. Keeping encoding
// free of OS calls lets protocol tests exercise Unicode, layout, button and
// modifier balancing on every developer host.
[StructLayout(LayoutKind.Sequential)]
internal struct WindowsInputEvent
{
    public uint Type;
    public InputUnion Value;
    [StructLayout(LayoutKind.Explicit)] internal struct InputUnion
    {
        [FieldOffset(0)] public KeyboardData Keyboard;
        [FieldOffset(0)] public MouseData Mouse;
    }
    [StructLayout(LayoutKind.Sequential)] internal struct KeyboardData { public ushort Key, Scan; public uint Flags, Time; public UIntPtr Tag; }
    [StructLayout(LayoutKind.Sequential)] internal struct MouseData { public int X, Y; public uint Data, Flags, Time; public UIntPtr Tag; }
    internal static WindowsInputEvent Key(ushort key, bool up, bool extended, ulong tag) => new() { Type = 1, Value = new() { Keyboard = new() { Key = key, Flags = (up ? 2u : 0) | (extended ? 1u : 0), Tag = new UIntPtr(tag) } } };
    internal static WindowsInputEvent Character(char character, bool up, ulong tag) => new() { Type = 1, Value = new() { Keyboard = new() { Scan = character, Flags = 4u | (up ? 2u : 0), Tag = new UIntPtr(tag) } } };
    internal static WindowsInputEvent Mouse(uint flags, int x, int y, uint data, ulong tag) => new() { Type = 0, Value = new() { Mouse = new() { X = x, Y = y, Data = data, Flags = flags, Tag = new UIntPtr(tag) } } };
}

internal static class WindowsInputEvents
{
    private static readonly Dictionary<string, ushort> Modifiers = new() { ["ctrl"] = 0x11, ["shift"] = 0x10, ["alt"] = 0x12, ["win"] = 0x5b };
    private static readonly Dictionary<string, (ushort Key, bool Extended)> Keys = new()
    {
        ["enter"] = (0x0d, false), ["kp_enter"] = (0x0d, true), ["tab"] = (9, false), ["space"] = (0x20, false), ["backspace"] = (8, false), ["escape"] = (0x1b, false),
        ["home"] = (0x24, true), ["end"] = (0x23, true), ["pageup"] = (0x21, true), ["pagedown"] = (0x22, true), ["insert"] = (0x2d, true), ["delete"] = (0x2e, true),
        ["left"] = (0x25, true), ["right"] = (0x27, true), ["up"] = (0x26, true), ["down"] = (0x28, true), ["help"] = (0x2f, false),
        ["kp_decimal"] = (0x6e, false), ["kp_multiply"] = (0x6a, false), ["kp_add"] = (0x6b, false), ["kp_clear"] = (0x0c, false), ["kp_divide"] = (0x6f, true), ["kp_subtract"] = (0x6d, false)
    };
    internal static WindowsInputEvent[] Chord(string key, IEnumerable<string> modifiers, Func<char, short> translate, ulong tag)
    {
        var flags = modifiers.Distinct().ToList();
        if (flags.Any(flag => !Modifiers.ContainsKey(flag))) throw new NativeFailure("INVALID_KEY", "Windows modifiers are ctrl, alt, shift and win");
        ushort code; bool extended = false;
        if (Keys.TryGetValue(key, out var named)) (code, extended) = named;
        else if (key.StartsWith('f') && int.TryParse(key[1..], out int function) && function is >= 1 and <= 24) code = (ushort)(0x70 + function - 1);
        else if (key.Length == 4 && key.StartsWith("kp_", StringComparison.Ordinal) && key[3] is >= '0' and <= '9') code = (ushort)(0x60 + key[3] - '0');
        else if (key.Length == 1)
        {
            short translated = translate(key[0]);
            if (translated == -1 || ((translated >> 8) & ~7) != 0) throw new NativeFailure("INVALID_KEY", "This key cannot be represented in the target keyboard layout");
            code = (ushort)(translated & 0xff);
            foreach (var item in new[] { (Bit: 1, Name: "shift"), (Bit: 2, Name: "ctrl"), (Bit: 4, Name: "alt") }) if (((translated >> 8) & item.Bit) != 0 && !flags.Contains(item.Name)) flags.Add(item.Name);
        }
        else throw new NativeFailure("INVALID_KEY", "Unsupported Windows key");
        // Secure attention cannot be synthesized with SendInput. Never claim a
        // successful Ctrl+Alt+Delete even when Windows accepts event records.
        if (key == "delete" && flags.Contains("ctrl") && flags.Contains("alt")) throw new NativeFailure("UNSUPPORTED_KEY", "Windows secure attention (Ctrl+Alt+Delete) cannot be sent by this runtime");
        var result = new List<WindowsInputEvent>();
        foreach (string flag in flags) result.Add(WindowsInputEvent.Key(Modifiers[flag], false, flag == "win", tag));
        result.Add(WindowsInputEvent.Key(code, false, extended, tag)); result.Add(WindowsInputEvent.Key(code, true, extended, tag));
        foreach (string flag in flags.AsEnumerable().Reverse()) result.Add(WindowsInputEvent.Key(Modifiers[flag], true, flag == "win", tag));
        return result.ToArray();
    }
    internal static IEnumerable<WindowsInputEvent[]> Text(string text, ulong tag)
    {
        ValidateText(text);
        for (int i = 0; i < text.Length; i++)
        {
            char current = text[i];
            if (current == '\r') { if (i + 1 < text.Length && text[i + 1] == '\n') i++; yield return [WindowsInputEvent.Key(0x0d, false, false, tag), WindowsInputEvent.Key(0x0d, true, false, tag)]; }
            else if (current == '\n') yield return [WindowsInputEvent.Key(0x0d, false, false, tag), WindowsInputEvent.Key(0x0d, true, false, tag)];
            else if (current == '\t') yield return [WindowsInputEvent.Key(9, false, false, tag), WindowsInputEvent.Key(9, true, false, tag)];
            else if (char.IsHighSurrogate(current))
            {
                if (i + 1 >= text.Length || !char.IsLowSurrogate(text[i + 1])) throw new NativeFailure("INVALID_TEXT", "Text contains an unpaired Unicode surrogate");
                char next = text[++i];
                yield return [WindowsInputEvent.Character(current, false, tag), WindowsInputEvent.Character(current, true, tag), WindowsInputEvent.Character(next, false, tag), WindowsInputEvent.Character(next, true, tag)];
            }
            else if (char.IsLowSurrogate(current)) throw new NativeFailure("INVALID_TEXT", "Text contains an unpaired Unicode surrogate");
            else yield return [WindowsInputEvent.Character(current, false, tag), WindowsInputEvent.Character(current, true, tag)];
        }
    }
    internal static void ValidateText(string text)
    {
        for (int i = 0; i < text.Length; i++)
        {
            if (char.IsHighSurrogate(text[i])) { if (++i == text.Length || !char.IsLowSurrogate(text[i])) throw new NativeFailure("INVALID_TEXT", "Text contains an unpaired Unicode surrogate"); }
            else if (char.IsLowSurrogate(text[i])) throw new NativeFailure("INVALID_TEXT", "Text contains an unpaired Unicode surrogate");
        }
    }
    internal static WindowsInputEvent Move(int x, int y, int left, int top, int width, int height, ulong tag)
    {
        if (width <= 0 || height <= 0 || x < left || y < top || (long)x >= (long)left + width || (long)y >= (long)top + height) throw new NativeFailure("INVALID_COORDINATE", "The point is outside the interactive desktop");
        // Use the center of the physical pixel's normalized interval, including
        // monitors left or above the primary monitor (negative coordinates).
        int nx = Math.Clamp((int)Math.Floor(((long)x - left + .5) * 65536 / width), 0, 65535);
        int ny = Math.Clamp((int)Math.Floor(((long)y - top + .5) * 65536 / height), 0, 65535);
        return WindowsInputEvent.Mouse(0x0001 | 0x8000 | 0x4000, nx, ny, 0, tag);
    }
    internal static WindowsInputEvent[] Click(string button, ulong tag)
    {
        uint down = button switch { "left" => 2u, "right" => 8u, "middle" => 0x20u, _ => throw new NativeFailure("INVALID_BUTTON", "Mouse button must be left, right, or middle") };
        return [WindowsInputEvent.Mouse(down, 0, 0, 0, tag), WindowsInputEvent.Mouse(down << 1, 0, 0, 0, tag)];
    }
    internal static WindowsInputEvent[] Releases(IEnumerable<WindowsInputEvent> accepted)
    {
        var keys = new Dictionary<(ushort Key, ushort Scan, uint Flags), WindowsInputEvent>();
        var buttons = new Dictionary<uint, WindowsInputEvent>();
        foreach (var input in accepted)
        {
            if (input.Type == 1)
            {
                var key = input.Value.Keyboard; var id = (key.Key, key.Scan, key.Flags & ~2u);
                if ((key.Flags & 2) != 0) keys.Remove(id);
                else { var release = input; release.Value.Keyboard.Flags |= 2; keys[id] = release; }
            }
            else foreach (uint down in new[] { 2u, 8u, 0x20u })
            {
                uint flags = input.Value.Mouse.Flags;
                if ((flags & down) != 0) buttons[down] = WindowsInputEvent.Mouse(down << 1, 0, 0, 0, input.Value.Mouse.Tag.ToUInt64());
                if ((flags & (down << 1)) != 0) buttons.Remove(down);
            }
        }
        return keys.Values.Reverse().Concat(buttons.Values).ToArray();
    }
}
