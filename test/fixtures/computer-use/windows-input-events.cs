using System.Runtime.InteropServices;
using System.Text.Json;

internal static class InputEventsFixture
{
    public static void Main()
    {
        string? line;
        while ((line = Console.ReadLine()) is not null)
        {
            try
            {
                using var document = JsonDocument.Parse(line); var args = document.RootElement;
                if (args.GetProperty("method").GetString() == "html") { Console.WriteLine(JsonSerializer.Serialize(new { html = ClipboardHtml.Encode(args.GetProperty("text").GetString()!) })); continue; }
                const ulong tag = 1234567890123;
                var layout = args.TryGetProperty("layout", out var mappings) ? mappings : default;
                short Translate(char character) => layout.ValueKind == JsonValueKind.Object && layout.TryGetProperty(character.ToString(), out var code) ? code.GetInt16() : (short)-1;
                WindowsInputEvent[] events = args.GetProperty("method").GetString() switch
                {
                    "chord" => WindowsInputEvents.Chord(args.GetProperty("key").GetString()!, args.GetProperty("modifiers").EnumerateArray().Select(value => value.GetString()!), Translate, tag),
                    "text" => WindowsInputEvents.Text(args.GetProperty("text").GetString()!, tag).SelectMany(packet => packet).ToArray(),
                    "move" => [WindowsInputEvents.Move(args.GetProperty("x").GetInt32(), args.GetProperty("y").GetInt32(), args.GetProperty("left").GetInt32(), args.GetProperty("top").GetInt32(), args.GetProperty("width").GetInt32(), args.GetProperty("height").GetInt32(), tag)],
                    "click" => WindowsInputEvents.Click(args.GetProperty("button").GetString()!, tag),
                    _ => throw new ArgumentException("Invalid fixture operation")
                };
                object Describe(WindowsInputEvent input) => new { type = input.Type, key = input.Type == 1 ? input.Value.Keyboard.Key : 0, scan = input.Type == 1 ? input.Value.Keyboard.Scan : 0, flags = input.Type == 1 ? input.Value.Keyboard.Flags : input.Value.Mouse.Flags, x = input.Value.Mouse.X, y = input.Value.Mouse.Y, tag = input.Type == 1 ? input.Value.Keyboard.Tag.ToUInt64() : input.Value.Mouse.Tag.ToUInt64() };
                var cleanups = Enumerable.Range(0, events.Length + 1).Select(count => WindowsInputEvents.Releases(events.Take(count)).Select(Describe).ToArray()).ToArray();
                Console.WriteLine(JsonSerializer.Serialize(new { size = Marshal.SizeOf<WindowsInputEvent>(), events = events.Select(Describe).ToArray(), cleanups }));
            }
            catch (Exception error) { Console.WriteLine(JsonSerializer.Serialize(new { error = error.Message })); }
        }
    }
}
