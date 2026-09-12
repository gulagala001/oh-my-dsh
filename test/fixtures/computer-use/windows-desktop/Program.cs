using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;

internal static class FixtureProgram
{
    [STAThread]
    public static void Main()
    {
        SetProcessDpiAwarenessContext(new IntPtr(-4));
        var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        var panel = new StackPanel { Margin = new Thickness(18) };
        var editor = new TextBox { Text = "Windows 观察验收 中文🙂", MinHeight = 36 };
        AutomationProperties.SetName(editor, "测试内容"); AutomationProperties.SetAutomationId(editor, "fixture-editor");
        var marker = new Border { Width = 240, Height = 120, Background = new SolidColorBrush(Color.FromRgb(220, 30, 50)), HorizontalAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 16, 0, 0) };
        // Name a normal accessible WPF control at the center of the red patch.
        var markerLabel = new TextBlock { Text = "颜色标记", Foreground = Brushes.White };
        marker.Child = markerLabel; AutomationProperties.SetName(markerLabel, "颜色标记");
        var pointerEvents = new List<object>();
        void Pointer(string kind, MouseEventArgs e, string? button = null)
        {
            var at = marker.PointToScreen(e.GetPosition(marker));
            pointerEvents.Add(new { kind, button, x = at.X, y = at.Y, held = e.LeftButton == MouseButtonState.Pressed, at = Environment.TickCount64 });
        }
        marker.MouseDown += (_, e) => Pointer("down", e, e.ChangedButton.ToString());
        marker.MouseUp += (_, e) => Pointer("up", e, e.ChangedButton.ToString());
        marker.MouseMove += (_, e) => { if (e.LeftButton == MouseButtonState.Pressed) Pointer("move", e); };
        var secret = new PasswordBox { Password = "fixture-secret-must-not-leak" }; AutomationProperties.SetName(secret, "密码");
        var clock = new TextBlock(); AutomationProperties.SetName(clock, "变化计数");
        int clicks = 0; bool revertNext = false;
        var button = new Button { Content = "计数按钮", Margin = new Thickness(0, 8, 0, 0) }; AutomationProperties.SetName(button, "计数按钮");
        button.Click += (_, _) => clicks++;
        editor.TextChanged += (_, _) =>
        {
            if (!revertNext) return; revertNext = false;
            var rollback = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(180) };
            rollback.Tick += (_, _) => { rollback.Stop(); editor.Text = "应用回退了输入"; }; rollback.Start();
        };
        panel.Children.Add(editor); panel.Children.Add(marker); panel.Children.Add(secret); panel.Children.Add(clock); panel.Children.Add(button);
        var first = new Window { Title = "Oh My DSH Windows Observation Fixture", Width = 640, Height = 420, Left = 100, Top = 100, Content = panel };
        var second = new Window { Title = "Oh My DSH Occluding Fixture", Width = 280, Height = 240, Left = 150, Top = 150, Content = new TextBlock { Text = "遮挡窗口", Background = Brushes.CornflowerBlue } };
        bool firstClosed = false;
        first.Closed += (_, _) => firstClosed = true;
        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) }; int revision = 0;
        timer.Tick += (_, _) => clock.Text = "帧 " + ++revision;
        app.Startup += (_, _) =>
        {
            first.Show(); second.Show(); timer.Start();
            _ = Task.Run(async () =>
            {
                try
                {
                    string? line;
                    while ((line = await Console.In.ReadLineAsync()) is not null)
                    {
                        using var message = JsonDocument.Parse(line); var root = message.RootElement;
                        if (!root.TryGetProperty("id", out var identifier)) continue;
                        long id = identifier.GetInt64();
                        var args = root.GetProperty("params");
                        var action = args.TryGetProperty("action", out var operation) ? operation.GetString() : "state";
                        object result = await app.Dispatcher.InvokeAsync(() =>
                        {
                            if (action == "text") editor.Text = args.GetProperty("text").GetString() ?? "";
                            if (action == "focus") { first.Activate(); editor.Focus(); Keyboard.Focus(editor); }
                            if (action == "external-input") { GetCursorPos(out var before); if (!SetCursorPos(before.X + 1, before.Y)) throw new InvalidOperationException("External fixture pointer input failed"); }
                            if (action == "reject-next-value") revertNext = true;
                            if (action == "move") { first.Left = args.GetProperty("x").GetDouble(); first.Top = args.GetProperty("y").GetDouble(); }
                            if (action == "resize") { first.Width = args.GetProperty("width").GetDouble(); first.Height = args.GetProperty("height").GetDouble(); }
                            if (action == "minimize") first.WindowState = WindowState.Minimized;
                            if (action == "restore") { first.WindowState = WindowState.Normal; second.Activate(); }
                            if (action == "close") first.Close();
                            GetCursorPos(out var cursor);
                            return new { pid = Environment.ProcessId, first = firstClosed ? 0 : new WindowInteropHelper(first).Handle.ToInt64(), second = new WindowInteropHelper(second).Handle.ToInt64(), foreground = GetForegroundWindow().ToInt64(), cursor = new { x = cursor.X, y = cursor.Y }, text = editor.Text, selectionStart = editor.SelectionStart, selectionLength = editor.SelectionLength, clicks, pointerEvents = pointerEvents.ToArray(), held = new { left = (GetAsyncKeyState(1) & 0x8000) != 0, right = (GetAsyncKeyState(2) & 0x8000) != 0, middle = (GetAsyncKeyState(4) & 0x8000) != 0, ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0, shift = (GetAsyncKeyState(0x10) & 0x8000) != 0, alt = (GetAsyncKeyState(0x12) & 0x8000) != 0 } };
                        });
                        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new { jsonrpc = "2.0", id, result }));
                    }
                }
                finally { await app.Dispatcher.InvokeAsync(() => { timer.Stop(); app.Shutdown(); }); }
            });
        };
        app.Run();
    }
    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
}
