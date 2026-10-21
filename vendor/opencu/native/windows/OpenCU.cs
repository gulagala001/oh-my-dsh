using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

namespace OpenCU {
  // JSON-line helper owned by the plugin; UI Automation and Win32 share physical pixels.
  public static class Native {
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct MouseInput { public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct KeyInput { public ushort Key, Scan; public uint Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MouseInput Mouse; [FieldOffset(0)] public KeyInput Key; }
    [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type; public InputUnion Data; }
    delegate bool EnumWindow(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int metric);
    [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern short VkKeyScan(char key);
    static readonly object outputLock = new object(), inputLock = new object(), queueLock = new object();
    static readonly Queue<Dictionary<string, object>> queue = new Queue<Dictionary<string, object>>();
    static readonly AutoResetEvent ready = new AutoResetEvent(false);
    static readonly Dictionary<string, AutomationElement> elements = new Dictionary<string, AutomationElement>();
    static readonly Dictionary<string, Dictionary<string, object>> mappings = new Dictionary<string, Dictionary<string, object>>();
    static readonly HashSet<int> keys = new HashSet<int>(), buttons = new HashSet<int>();
    static string directory, journal; static int epoch, nextElement; static volatile bool eof, closing;
    sealed class TreeRead {
      internal Thread Worker;
      internal readonly Dictionary<string, AutomationElement> Elements = new Dictionary<string, AutomationElement>();
      internal Dictionary<string, object> Result;
      internal Exception Error;
      internal volatile bool Cancelled;
      internal int Epoch;
    }
    static TreeRead treeRead;
    static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength = 64 * 1024 * 1024, RecursionLimit = 128 }; }
    static Dictionary<string, object> D(params object[] pairs) { var value = new Dictionary<string, object>(); for (int i = 0; i < pairs.Length; i += 2) value[(string)pairs[i]] = pairs[i + 1]; return value; }
    static object V(Dictionary<string, object> value, string key, object fallback = null) { object result; return value.TryGetValue(key, out result) ? result : fallback; }
    static Dictionary<string, object> Obj(object value) { return value as Dictionary<string, object> ?? D(); }
    static string S(Dictionary<string, object> value, string key, string fallback = "") { return Convert.ToString(V(value, key, fallback)); }
    static double N(Dictionary<string, object> value, string key, double fallback = 0) { double result = Convert.ToDouble(V(value, key, fallback)); if (Double.IsNaN(result) || Double.IsInfinity(result)) throw new Exception("INVALID_ARGUMENT: finite coordinates required"); return result; }
    static void Dpi() { try { if (SetThreadDpiAwarenessContext(new IntPtr(-4)) == IntPtr.Zero) throw new Exception("DPI_UNAVAILABLE: physical coordinate mode was rejected"); } catch (EntryPointNotFoundException) { throw new Exception("DPI_UNAVAILABLE: Windows 10 1703 or newer is required"); } }
    static void Reply(object id, object result, Exception error = null) { lock (outputLock) { Console.WriteLine(Json().Serialize(error == null ? D("id", id, "ok", true, "result", result) : D("id", id, "ok", false, "error", D("code", error.Message.Contains(":") ? error.Message.Split(':')[0] : "NATIVE_FAILURE", "message", error.Message)))); Console.Out.Flush(); } }
    static Dictionary<string, object> Bounds(Rect rect) { return D("x", rect.Left, "y", rect.Top, "width", rect.Right - rect.Left, "height", rect.Bottom - rect.Top); }
    static Dictionary<string, object> Target(IntPtr window) {
      uint pid; GetWindowThreadProcessId(window, out pid); Rect rect;
      if (!GetWindowRect(window, out rect) || rect.Right <= rect.Left || rect.Bottom <= rect.Top) throw new Exception("TARGET_NOT_FOUND: window has no bounds");
      using (var process = Process.GetProcessById((int)pid)) {
        string executable = process.MainModule.FileName, start = process.StartTime.ToUniversalTime().Ticks.ToString();
        var title = new StringBuilder(32768); GetWindowText(window, title, title.Capacity);
        var identity = D("pid", pid, "processStart", start, "executable", executable, "windowId", window.ToInt64());
        return D("id", "native:" + pid + ":window:" + window.ToInt64(), "kind", "app", "backend", "native", "platform", "win32", "targetType", "window", "pid", pid, "windowId", window.ToInt64(), "bundleId", executable, "name", process.ProcessName, "title", title.ToString(), "identity", identity, "bounds", Bounds(rect), "active", GetForegroundWindow() == window);
      }
    }
    static List<object> List() {
      var result = new List<object>();
      EnumWindows((window, p) => { if (IsWindowVisible(window)) try { var target = Target(window); if (S(target, "title").Length > 0) result.Add(target); } catch (Exception) { /* Protected and exiting processes are not usable targets. */ } return true; }, IntPtr.Zero);
      return result;
    }
    static Dictionary<string, object> Resolve(Dictionary<string, object> reference, bool requireIdentity = false) {
      if (requireIdentity && !reference.ContainsKey("identity")) throw new Exception("TARGET_IDENTITY_REQUIRED: select the live window first");
      var matches = List().Cast<Dictionary<string, object>>().Where(t => new[] { "id", "windowId", "bundleId", "pid" }.All(k => !reference.ContainsKey(k) || S(t, k) == S(reference, k))).ToList();
      if (matches.Count != 1) throw new Exception("TARGET_NOT_FOUND: reference must identify one live window");
      var target = matches[0]; var expected = Obj(V(reference, "identity")); var actual = Obj(target["identity"]);
      if (expected.Count > 0 && (expected.Count != actual.Count || expected.Any(p => !actual.ContainsKey(p.Key) || Convert.ToString(actual[p.Key]) != Convert.ToString(p.Value)))) throw new Exception("TARGET_IDENTITY_CHANGED: process or window occurrence changed");
      return target;
    }
    static IntPtr Handle(Dictionary<string, object> target) { return new IntPtr(Convert.ToInt64(target["windowId"])); }
    static void Foreground(Dictionary<string, object> target) {
      if (GetForegroundWindow() != Handle(target) || IsIconic(Handle(target))) throw new Exception("TARGET_NOT_ACTIVE: select the same window before input or capture");
      var desktop = OpenInputDesktop(0, false, 0x100); if (desktop == IntPtr.Zero) throw new Exception("DESKTOP_UNAVAILABLE: unlock the interactive desktop first"); CloseDesktop(desktop);
    }
    static void Persist() { var temp = journal + ".tmp"; File.WriteAllText(temp, Json().Serialize(D("keys", keys.ToArray(), "buttons", buttons.ToArray()))); if (File.Exists(journal)) File.Replace(temp, journal, null); else File.Move(temp, journal); }
    static void Send(Input value) { if (value.Type == 1) value.Data.Key.Extra = Activity.Marker; else value.Data.Mouse.Extra = Activity.Marker; if (SendInput(1, new[] { value }, Marshal.SizeOf(typeof(Input))) != 1) throw new Exception("INPUT_REJECTED: Windows rejected input; elevated targets require matching privileges"); }
    static void Key(int key, bool down, int expected = -1) { lock (inputLock) { if (!down && !keys.Contains(key)) return; if (down && (expected != epoch || eof)) throw new Exception("CONTROL_STOPPED: input was cancelled"); if (down) { if (keys.Contains(key)) return; if ((GetAsyncKeyState(key) & 0x8000) != 0) throw new Exception("INPUT_ALREADY_HELD: user already holds this key"); keys.Add(key); Persist(); } Send(new Input { Type = 1, Data = new InputUnion { Key = new KeyInput { Key = (ushort)key, Flags = down ? 0u : 2u } } }); if (!down) { if ((GetAsyncKeyState(key) & 0x8000) != 0) throw new Exception("RELEASE_FAILED: key remains down"); keys.Remove(key); try { Persist(); } catch { keys.Add(key); throw; } } } }
    sealed class ChordAlreadyHeld : Exception { public ChordAlreadyHeld() : base("INPUT_ALREADY_HELD: pressKey cannot reuse an already held key; no input was dispatched") {} }
    static void PressChord(Dictionary<string, object> target, int[] chord, int expected) {
      lock (inputLock) {
        Check(expected, target);
        if (chord.Any(key => keys.Contains(key) || (GetAsyncKeyState(key) & 0x8000) != 0)) throw new ChordAlreadyHeld();
        var acquired = new List<int>();
        try {
          foreach (int key in chord) {
            Check(expected, target);
            try { Key(key, true, expected); }
            finally { if (keys.Contains(key)) acquired.Add(key); }
          }
        } finally { foreach (int key in acquired.AsEnumerable().Reverse()) Key(key, false); }
      }
    }
    static int ButtonKey(int button) { return button == 1 ? 2 : button == 2 ? 4 : 1; }
    static void Button(int button, bool down, int expected = -1) { lock (inputLock) { if (!down && !buttons.Contains(button)) return; if (down && (expected != epoch || eof)) throw new Exception("CONTROL_STOPPED: input was cancelled"); if (down) { if (buttons.Contains(button)) return; if ((GetAsyncKeyState(ButtonKey(button)) & 0x8000) != 0) throw new Exception("INPUT_ALREADY_HELD: user already holds this button"); buttons.Add(button); Persist(); } uint flag = button == 1 ? (down ? 8u : 16u) : button == 2 ? (down ? 32u : 64u) : (down ? 2u : 4u); Send(new Input { Type = 0, Data = new InputUnion { Mouse = new MouseInput { Flags = flag } } }); if (!down) { if ((GetAsyncKeyState(ButtonKey(button)) & 0x8000) != 0) throw new Exception("RELEASE_FAILED: button remains down"); buttons.Remove(button); try { Persist(); } catch { buttons.Add(button); throw; } } } }
    static void Cursor(Dictionary<string, object> target, Point at) { lock (outputLock) { Console.WriteLine(Json().Serialize(D("event", D("type", "cursor", "visible", true, "targetId", target["id"], "x", at.X, "y", at.Y, "space", "physical")))); Console.Out.Flush(); } }
    static void Move(Dictionary<string, object> target, Point at, int expected) { lock (inputLock) { Check(expected, target); if (!SetCursorPos(at.X, at.Y)) throw new Exception("INPUT_REJECTED: pointer move failed"); Cursor(target, at); } }
    static object Release() { lock (inputLock) { var failures = new List<string>(); foreach (int key in keys.ToArray().Reverse()) try { Key(key, false); } catch (Exception e) { failures.Add(e.Message); } foreach (int button in buttons.ToArray()) try { Button(button, false); } catch (Exception e) { failures.Add(e.Message); } lock (outputLock) { Console.WriteLine(Json().Serialize(D("event", D("type", "cursor", "visible", false)))); Console.Out.Flush(); } return D("released", failures.Count == 0, "failures", failures, "heldKeys", keys.ToArray(), "heldButtons", buttons.ToArray()); } }
    static void Check(int expected, Dictionary<string, object> target, bool foreground = true) { if (epoch != expected || eof) throw new Exception("CONTROL_STOPPED: input was cancelled"); Resolve(target, true); if (foreground) Foreground(target); }
    static int KeyCode(string name) {
      var known = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase) { {"Control",17},{"Ctrl",17},{"Alt",18},{"Shift",16},{"Meta",91},{"Super",91},{"Win",91},{"Enter",13},{"Return",13},{"Tab",9},{"Escape",27},{"Esc",27},{"Space",32},{"Backspace",8},{"Delete",46},{"Insert",45},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34},{"ArrowLeft",37},{"Left",37},{"ArrowUp",38},{"Up",38},{"ArrowRight",39},{"Right",39},{"ArrowDown",40},{"Down",40} };
      int result; if (known.TryGetValue(name, out result)) return result; if (name.Length == 1) { int code = VkKeyScan(name[0]); if (code != -1) return code & 255; } if (name.StartsWith("F") && Int32.TryParse(name.Substring(1), out result) && result >= 1 && result <= 24) return 111 + result; throw new Exception("INVALID_KEY: unknown key " + name);
    }
    static int[] KeyChord(string value) {
      var names = new List<string>(); string token = "";
      foreach (char ch in value) { if (ch == '+' && token.Length > 0) { names.Add(token.Trim()); token = ""; } else token += ch; }
      names.Add(token.Trim()); var chord = new List<int>();
      foreach (string name in names) {
        int key = KeyCode(name);
        if (name == "+") {
          int modifiers = VkKeyScan('+') >> 8;
          foreach (var modifier in new[] { new[] { 1, 16 }, new[] { 2, 17 }, new[] { 4, 18 } }) if ((modifiers & modifier[0]) != 0 && !chord.Contains(modifier[1])) chord.Add(modifier[1]);
        }
        if (!chord.Contains(key)) chord.Add(key);
      }
      return chord.ToArray();
    }
    static Dictionary<string, object> Capture(Dictionary<string, object> target, bool preview) {
      Rect rect; if (!GetWindowRect(Handle(target), out rect)) throw new Exception("TARGET_NOT_FOUND: selected window has no bounds");
      int left = rect.Left, top = rect.Top, width = rect.Right - rect.Left, height = rect.Bottom - rect.Top;
      if (IsIconic(Handle(target))) throw new Exception("BACKGROUND_CAPTURE_UNAVAILABLE: minimized window cannot provide current pixels; it was not restored");
      if (width < 1 || height < 1) throw new Exception("WINDOW_NOT_VISIBLE: selected window has no size");
      using (var image = new Bitmap(width, height)) using (var graphics = Graphics.FromImage(image)) using (var stream = new MemoryStream()) {
        IntPtr dc = graphics.GetHdc(); bool captured;
        try { captured = PrintWindow(Handle(target), dc, 2); } finally { graphics.ReleaseHdc(dc); }
        if (!captured) throw new Exception("BACKGROUND_CAPTURE_UNAVAILABLE: application rejected PrintWindow; no desktop fallback was used");
        image.Save(stream, ImageFormat.Png); var bytes = stream.ToArray();
        if (preview) return D("dataUrl", "data:image/png;base64," + Convert.ToBase64String(bytes), "width", width, "height", height, "kind", "native-frame", "timestamp", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        string token = Guid.NewGuid().ToString(), path = Path.Combine(directory, token + ".png"); File.WriteAllBytes(path, bytes);
        var mapping = D("path", path, "mediaType", "image/png", "width", width, "height", height, "bounds", D("x", left, "y", top, "width", width, "height", height), "windowBounds", Bounds(rect), "mappingId", token, "scale", 1, "coordinateSpace", "physical-screenshot-pixels"); mappings[S(target, "id")] = mapping; return mapping;
      }
    }
    static void CheckTree(TreeRead read) { if (read.Cancelled || read.Epoch != epoch || eof) throw new OperationCanceledException("Accessibility read was cancelled"); }
    static Dictionary<string, object> ReadTree(Dictionary<string, object> target, Dictionary<string, object> options, TreeRead read) {
      string prefix = S(target, "id") + ":";
      var nodes = new List<object>(); var text = new StringBuilder(); int max = (int)Math.Min(3000, Math.Max(1, N(options, "maxNodes", 1000))), depthLimit = (int)Math.Min(80, N(options, "maxDepth", 40)); var clock = Stopwatch.StartNew(); bool truncated = false;
      Action<AutomationElement, int, string> visit = null;
      visit = (element, depth, parent) => {
        CheckTree(read);
        if (nodes.Count >= max || depth > depthLimit || clock.ElapsedMilliseconds > N(options, "timeoutMs", 5000)) { truncated = true; return; }
        try {
          var current = element.Current; CheckTree(read); string id = prefix + Interlocked.Increment(ref nextElement); read.Elements[id] = element; object pattern;
          var node = D("elementId", id, "role", current.ControlType.ProgrammaticName, "name", current.Name, "enabled", current.IsEnabled, "parentId", parent);
          if (!current.IsPassword && element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern)) { var value = (ValuePattern)pattern; node["value"] = value.Current.Value; node["valueSettable"] = !value.Current.IsReadOnly; }
          var r = current.BoundingRectangle; if (!r.IsEmpty) node["bounds"] = D("x", r.X, "y", r.Y, "width", r.Width, "height", r.Height);
          nodes.Add(node); text.AppendLine(new string(' ', depth * 2) + "[" + id + "] " + current.ControlType.ProgrammaticName + " " + current.Name + (node.ContainsKey("value") ? " value=" + node["value"] : ""));
          CheckTree(read);
          var child = TreeWalker.ControlViewWalker.GetFirstChild(element); while (child != null && !truncated) { visit(child, depth + 1, id); CheckTree(read); child = TreeWalker.ControlViewWalker.GetNextSibling(child); }
        } catch (ElementNotAvailableException) { /* A disappearing subtree does not invalidate other live elements. */ }
      };
      visit(AutomationElement.FromHandle(Handle(target)), 0, null); return D("nodes", nodes, "text", text.ToString(), "truncated", truncated);
    }
    static Dictionary<string, object> Tree(Dictionary<string, object> target, Dictionary<string, object> options, int expected) {
      // A provider RPC can block inside Current/TreeWalker, beyond the traversal's
      // stopwatch. Keep that read off the command lane, with at most one worker.
      if (treeRead != null && treeRead.Worker.IsAlive) throw new Exception("AX_BUSY: a previous accessibility provider read is still pending; screenshot observation remains available");
      int timeout = (int)Math.Min(5000, Math.Max(1, N(options, "timeoutMs", 5000)));
      string prefix = S(target, "id") + ":";
      foreach (string key in elements.Keys.Where(k => k.StartsWith(prefix, StringComparison.Ordinal)).ToArray()) elements.Remove(key);
      var read = new TreeRead { Epoch = expected }; treeRead = read;
      read.Worker = new Thread(() => {
        try { Dpi(); CheckTree(read); read.Result = ReadTree(target, options, read); }
        catch (Exception error) { read.Error = error; }
        finally { if (read.Cancelled) { read.Elements.Clear(); read.Result = null; } }
      });
      read.Worker.IsBackground = true; read.Worker.SetApartmentState(ApartmentState.MTA); read.Worker.Start();
      var clock = Stopwatch.StartNew();
      while (!read.Worker.Join(10)) {
        if (expected != epoch || eof) { read.Cancelled = true; throw new Exception("CONTROL_STOPPED: accessibility read was cancelled"); }
        if (clock.ElapsedMilliseconds >= timeout) { read.Cancelled = true; throw new Exception("AX_TIMEOUT: accessibility provider did not respond within " + timeout + "ms; binding is retained and screenshot observation remains available"); }
      }
      if (expected != epoch || eof) throw new Exception("CONTROL_STOPPED: accessibility read was cancelled");
      if (read.Error != null) throw read.Error;
      Resolve(target, true);
      foreach (var entry in read.Elements) elements[entry.Key] = entry.Value;
      return read.Result;
    }
    static void VerifyElementWindow(Dictionary<string, object> target, AutomationElement element) {
      if (element == null) throw new Exception("STALE_ELEMENT: accessibility element is no longer available");
      var window = AutomationElement.FromHandle(Handle(target));
      // WebView2 descendants can belong to a renderer process. Membership in the
      // verified window's live raw tree, rather than PID equality, is authoritative.
      var current = element;
      for (int depth = 0; current != null && depth < 256; depth++, current = TreeWalker.RawViewWalker.GetParent(current)) if (Automation.Compare(current, window)) return;
      throw new Exception("TARGET_IDENTITY_CHANGED: element is outside the selected window");
    }
    static AutomationElement Element(Dictionary<string, object> target, object id) { AutomationElement element; string key = Convert.ToString(id); if (!key.StartsWith(S(target, "id") + ":", StringComparison.Ordinal) || !elements.TryGetValue(key, out element)) throw new Exception("STALE_ELEMENT: observe the same window again"); VerifyElementWindow(target, element); return element; }
    static Point Position(Dictionary<string, object> target, Dictionary<string, object> action) {
      if (action.ContainsKey("elementId")) { var element = Element(target, action["elementId"]); var rect = element.Current.BoundingRectangle; if (rect.IsEmpty || element.Current.IsOffscreen) throw new Exception("ELEMENT_NOT_VISIBLE: selected element has no usable bounds"); return new Point { X = (int)(rect.X + rect.Width / 2), Y = (int)(rect.Y + rect.Height / 2) }; }
      Dictionary<string, object> mapping; if (!mappings.TryGetValue(S(target, "id"), out mapping)) throw new Exception("OBSERVATION_REQUIRED: capture before using coordinates");
      if (action.ContainsKey("mappingId") && S(action, "mappingId") != S(mapping, "mappingId") || Json().Serialize(target["bounds"]) != Json().Serialize(mapping["windowBounds"])) throw new Exception("STALE_SCREENSHOT: window moved or mapping changed");
      double x = N(action, "x", -1), y = N(action, "y", -1); if (x < 0 || y < 0 || x >= N(mapping, "width") || y >= N(mapping, "height")) throw new Exception("INVALID_COORDINATES: point outside screenshot"); var bounds = Obj(mapping["bounds"]); return new Point { X = (int)(N(bounds, "x") + x), Y = (int)(N(bounds, "y") + y) };
    }
    static object BackgroundAction(Dictionary<string, object> target, Dictionary<string, object> action, int expected) {
      string type = S(action, "type");
      if (type == "click" && S(action, "button", "left") != "left") throw new Exception("FOREGROUND_REQUIRED: UI Automation does not synthesize background right or middle clicks");
      var root = AutomationElement.FromHandle(Handle(target));
      AutomationElement element = action.ContainsKey("elementId") ? Element(target, action["elementId"]) : root;
      if (!action.ContainsKey("elementId") && (type != "scroll" || action.ContainsKey("x"))) {
        var at = Position(target, action); int remaining = 3000; var clock = Stopwatch.StartNew();
        Func<AutomationElement, int, AutomationElement> find = null;
        find = (node, depth) => {
          if (--remaining < 0 || depth > 80 || clock.ElapsedMilliseconds > 3000) throw new Exception("BACKGROUND_HIT_TEST_UNAVAILABLE: specify an observed elementId for this complex window");
          var bounds = node.Current.BoundingRectangle;
          if (bounds.IsEmpty || !bounds.Contains(new System.Windows.Point(at.X, at.Y))) return null;
          for (var child = TreeWalker.ControlViewWalker.GetFirstChild(node); child != null; child = TreeWalker.ControlViewWalker.GetNextSibling(child)) { var hit = find(child, depth + 1); if (hit != null) return hit; }
          return node;
        };
        element = find(root, 0);
        if (element == null) throw new Exception("ELEMENT_NOT_FOUND: no accessibility element in selected window at this point");
      }
      VerifyElementWindow(target, element); Check(expected, target, false);
      if (type == "hit_test") { string id = S(target, "id") + ":" + Interlocked.Increment(ref nextElement); elements[id] = element; return D("element", D("elementId", id, "name", element.Current.Name, "role", element.Current.ControlType.ProgrammaticName)); }
      object pattern;
      if (type == "scroll") {
        var node = element;
        while (!node.TryGetCurrentPattern(ScrollPattern.Pattern, out pattern)) {
          if (Automation.Compare(node, root)) throw new Exception("FOREGROUND_REQUIRED: element has no UI Automation scroll pattern");
          node = TreeWalker.ControlViewWalker.GetParent(node); if (node == null) throw new Exception("STALE_ELEMENT: scroll ancestor disappeared");
        }
        VerifyElementWindow(target, node);
        var scroll = (ScrollPattern)pattern; double dx = N(action, "deltaX"), dy = N(action, "deltaY");
        if (dx != 0 && !scroll.Current.HorizontallyScrollable || dy != 0 && !scroll.Current.VerticallyScrollable) throw new Exception("ACTION_UNAVAILABLE: requested axis is not scrollable");
        Func<double, ScrollAmount> amount = delta => delta == 0 ? ScrollAmount.NoAmount : delta > 0 ? delta > 100 ? ScrollAmount.LargeIncrement : ScrollAmount.SmallIncrement : delta < -100 ? ScrollAmount.LargeDecrement : ScrollAmount.SmallDecrement;
        scroll.Scroll(amount(dx), amount(dy));
      } else if (element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern)) ((InvokePattern)pattern).Invoke();
      else if (type == "click" && element.TryGetCurrentPattern(TogglePattern.Pattern, out pattern)) ((TogglePattern)pattern).Toggle();
      else if (type == "click" && element.TryGetCurrentPattern(SelectionItemPattern.Pattern, out pattern)) ((SelectionItemPattern)pattern).Select();
      else if (type == "click" && element.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out pattern)) { var expand = (ExpandCollapsePattern)pattern; if (expand.Current.ExpandCollapseState == ExpandCollapseState.Expanded) expand.Collapse(); else expand.Expand(); }
      else throw new Exception("FOREGROUND_REQUIRED: element has no matching background accessibility action; no global input was sent");
      Check(expected, target, false); var result = D("performed", true, "type", type, "inputMode", "background", "delivery", "accessibility-acknowledged", "effectVerified", false);
       if (type == "scroll") result["scrollUnit"] = "UIA small/large increment; pixel magnitude is not supported";
       return result;
    }
    static object Act(Dictionary<string, object> target, Dictionary<string, object> action, int expected) {
      Check(expected, target, false); string type = S(action, "type"), mode = S(action, "inputMode", "background");
      if (mode != "background" && mode != "foreground") throw new Exception("INVALID_ACTION: inputMode must be background or foreground");
      if (type == "activate") { if (IsIconic(Handle(target))) ShowWindow(Handle(target), 9); SetForegroundWindow(Handle(target)); Foreground(target); return D("focused", true, "target", Target(Handle(target))); }
      bool semantic = type == "set_value" || type == "ax_press" || mode == "background" && (type == "click" || type == "scroll" || type == "hit_test");
      if (!semantic) {
        if (mode != "foreground") throw new Exception("FOREGROUND_REQUIRED: this action has no UI Automation background implementation; obtain user permission before focus and inputMode=foreground");
        Foreground(target);
      }
      if (mode == "background" && (type == "click" || type == "ax_press" || type == "scroll" || type == "hit_test")) return BackgroundAction(target, action, expected);
      if (type == "activate") { SetForegroundWindow(Handle(target)); Foreground(target); }
      else if (type == "hit_test") { var at = Position(target, action); var hit = AutomationElement.FromPoint(new System.Windows.Point(at.X, at.Y)); VerifyElementWindow(target, hit); string id = S(target, "id") + ":" + Interlocked.Increment(ref nextElement); elements[id] = hit; return D("element", D("elementId", id, "name", hit.Current.Name, "role", hit.Current.ControlType.ProgrammaticName)); }
      else if (type == "set_value") { object pattern; var element = Element(target, V(action, "elementId")); if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern) || ((ValuePattern)pattern).Current.IsReadOnly) throw new Exception("VALUE_NOT_SETTABLE: element has no writable value"); ((ValuePattern)pattern).SetValue(S(action, "value", S(action, "text"))); }
      else if (type == "ax_press") { object pattern; var element = Element(target, V(action, "elementId")); if (!element.TryGetCurrentPattern(InvokePattern.Pattern, out pattern)) throw new Exception("ACTION_UNAVAILABLE: element cannot be invoked"); ((InvokePattern)pattern).Invoke(); }
      else if (type == "type_text") { foreach (char ch in S(action, "text")) { Check(expected, target); if (ch == '\n' || ch == '\t') { int key = ch == '\n' ? 13 : 9; Key(key, true, expected); Key(key, false); } else { Send(new Input { Type = 1, Data = new InputUnion { Key = new KeyInput { Scan = ch, Flags = 4 } } }); Send(new Input { Type = 1, Data = new InputUnion { Key = new KeyInput { Scan = ch, Flags = 6 } } }); } } }
      else if (type == "key_down" || type == "key_up") Key(KeyCode(S(action, "key")), type == "key_down", expected);
      else if (type == "press_key") PressChord(target, KeyChord(S(action, "key")), expected);
      else if (type == "scroll") { if (action.ContainsKey("x") || action.ContainsKey("elementId")) { var at = Position(target, action); Move(target, at, expected); } else { Point cursor; Rect bounds; if (!GetCursorPos(out cursor) || !GetWindowRect(Handle(target), out bounds) || cursor.X < bounds.Left || cursor.X >= bounds.Right || cursor.Y < bounds.Top || cursor.Y >= bounds.Bottom) throw new Exception("SCROLL_POINT_REQUIRED: pointer is outside the selected window; specify a screenshot point or element"); } foreach (var axis in new[] { "deltaY", "deltaX" }) if (N(action, axis) != 0) Send(new Input { Type = 0, Data = new InputUnion { Mouse = new MouseInput { Flags = axis == "deltaY" ? 0x800u : 0x1000u, Data = unchecked((uint)(int)(axis == "deltaY" ? -N(action, axis) : N(action, axis))) } } }); }
      else {
        int button = S(action, "button", "left") == "right" || type == "right_click" ? 1 : S(action, "button") == "middle" ? 2 : 0;
        if (type == "mouse_up") Button(button, false);
        else if (type == "drag") {
          var points = new List<Point>();
          if (action.ContainsKey("path")) {
            foreach (object sample in (IEnumerable)action["path"]) { var at = new Dictionary<string, object>(action); at.Remove("elementId"); at["x"] = V(Obj(sample), "x", -1); at["y"] = V(Obj(sample), "y", -1); points.Add(Position(target, at)); }
            if (points.Count < 2) throw new Exception("INVALID_ACTION: drag requires at least two points");
          } else { var from = new Dictionary<string, object>(action); from.Remove("elementId"); from["x"] = N(action, "fromX"); from["y"] = N(action, "fromY"); points.Add(Position(target, from)); points.Add(Position(target, action)); }
          int steps = Math.Max(1, 20 / (points.Count - 1)); double delay = 200.0 / ((points.Count - 1) * steps); var clock = Stopwatch.StartNew(); int moved = 0;
          Move(target, points[0], expected); Button(button, true, expected);
          for (int segment = 1; segment < points.Count; segment++) { var first = points[segment - 1]; var last = points[segment]; for (int i = 1; i <= steps; i++) { Check(expected, target); Move(target, new Point { X = first.X + (last.X - first.X) * i / steps, Y = first.Y + (last.Y - first.Y) * i / steps }, expected); int wait = (int)(++moved * delay - clock.ElapsedMilliseconds); if (wait > 0) Thread.Sleep(wait); } }
          Button(button, false);
        }
        else if (new[] { "move", "click", "double_click", "right_click", "mouse_down" }.Contains(type)) { var at = Position(target, action); Move(target, at, expected); if (type != "move") { for (int i = 0; i < (type == "double_click" ? 2 : 1); i++) { Check(expected, target); Button(button, true, expected); if (type != "mouse_down") Button(button, false); } } }
        else throw new Exception("UNSUPPORTED_ACTION: " + type);
      }
      Check(expected, target, !semantic); return D("performed", true, "type", type, "inputMode", mode, "delivery", semantic ? "accessibility-acknowledged" : "foreground-posted", "effectVerified", false);
    }
    static object Perform(string method, Dictionary<string, object> args, int expected) {
      if (method == "hello") return D("protocol", 1, "platform", "win32");
      if (method == "openPermissionSettings") { Process.Start(new ProcessStartInfo("ms-settings:easeofaccess") { UseShellExecute = true }); return D("opened", true); }
      if (method == "permissions") { var desktop = OpenInputDesktop(0, false, 0x100); bool available = desktop != IntPtr.Zero; if (available) CloseDesktop(desktop); return D("interactiveDesktop", available, "accessibility", "per-target", "screenCapture", "per-window-PrintWindow", "postEvents", "subject-to-UIPI", "listenEvents", Activity.Available); }
      if (method == "listTargets") return List();
      if (method == "release" || method == "close") { var result = Obj(Release()); if (method == "close") { if (!(bool)result["released"]) throw new Exception("RELEASE_FAILED: held input could not be released"); closing = true; } return result; }
      if (method == "stopPreview") return D("released", true);
      if (method == "verify") { try { var target = Resolve(Obj(V(args, "target")), true); if (Convert.ToBoolean(V(Obj(V(args, "options")), "cold", false)) && S(target, "title") != S(Obj(args["target"]), "title")) throw new Exception("Window title changed during cold recovery"); return D("valid", true, "target", target); } catch (Exception error) { return D("valid", false, "reason", error.Message); } }
      var selected = Resolve(Obj(V(args, method == "select" || method == "focus" ? "reference" : "target")), method != "select" && method != "focus");
      if (method == "select" || method == "focus") {
        if (method == "focus") { if (IsIconic(Handle(selected))) ShowWindow(Handle(selected), 9); SetForegroundWindow(Handle(selected)); Foreground(selected); }
        Activity.Watch(Handle(selected).ToInt64(), S(selected, "id")); return Target(Handle(selected));
      }
      if (method == "preview") return Capture(selected, true);
      if (method == "act") return Act(selected, Obj(V(args, "action")), expected);
      if (method == "observe") {
        var options = Obj(V(args, "options")); string format = S(options, "format", "both"); var result = D("observationId", Guid.NewGuid().ToString(), "targetId", selected["id"], "identity", selected["identity"], "coordinateSpace", "physical-screenshot-pixels"); Activity.Watch(Handle(selected).ToInt64(), S(selected, "id")); foreach (var item in Obj(Activity.Read(S(selected, "id")))) result[item.Key] = item.Value; var errors = new List<object>();
        if (format != "screenshot") try { var tree = Tree(selected, options, expected); result["ax"] = tree; result["text"] = tree["text"]; } catch (Exception error) { if (format == "ax" || expected != epoch || eof) throw; errors.Add(D("code", error.Message.Contains(":") ? error.Message.Split(':')[0] : "NATIVE_FAILURE", "message", error.Message)); }
        if (format != "ax") try { result["screenshot"] = Capture(selected, false); } catch (Exception error) { errors.Add(D("message", error.Message)); }
        if (!result.ContainsKey("ax") && !result.ContainsKey("screenshot")) throw new Exception("OBSERVATION_FAILED: " + Json().Serialize(errors)); if (errors.Count > 0) { result["partial"] = true; result["errors"] = errors; } return result;
      }
      throw new Exception("UNSUPPORTED_METHOD: " + method);
    }
    public static void Run(string dataDir) {
      directory = Path.GetFullPath(dataDir); Directory.CreateDirectory(directory); journal = Path.Combine(directory, "held-input.json");
      using (var owner = new FileStream(Path.Combine(directory, "owner.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None)) {
        Dpi(); Activity.Start(); if (File.Exists(journal)) { var saved = Obj(Json().DeserializeObject(File.ReadAllText(journal))); foreach (object key in (IEnumerable)V(saved, "keys", new object[0])) keys.Add(Convert.ToInt32(key)); foreach (object button in (IEnumerable)V(saved, "buttons", new object[0])) buttons.Add(Convert.ToInt32(button)); if (!(bool)Obj(Release())["released"]) throw new Exception("RELEASE_FAILED: previous held input remains"); }
        var reader = new Thread(() => { string line; try { while ((line = Console.ReadLine()) != null) { var request = Obj(Json().DeserializeObject(line)); string method = S(request, "method"); if (method == "release" || method == "close") Interlocked.Increment(ref epoch); request["epoch"] = epoch; if (method == "preview" || method == "release" || method == "verify") ThreadPool.QueueUserWorkItem(_ => { try { Dpi(); Reply(V(request, "id"), Perform(method, Obj(V(request, "params")), epoch)); } catch (Exception error) { Reply(V(request, "id"), null, error); } }); else { lock (queueLock) queue.Enqueue(request); ready.Set(); } } } catch (Exception error) { Reply(0, null, error); } finally { eof = true; Interlocked.Increment(ref epoch); Release(); ready.Set(); } }); reader.IsBackground = true; reader.Start();
        try { while (!closing) { Dictionary<string, object> request = null; lock (queueLock) if (queue.Count > 0) request = queue.Dequeue(); if (request == null) { if (eof) break; ready.WaitOne(); continue; } try { Reply(V(request, "id"), Perform(S(request, "method"), Obj(V(request, "params")), Convert.ToInt32(request["epoch"]))); } catch (Exception error) { if (S(request, "method") == "act" && !(error is ChordAlreadyHeld)) Release(); Reply(V(request, "id"), null, error); } } }
        finally { Activity.Stop(); if (!(bool)Obj(Release())["released"]) Environment.ExitCode = 2; }
      }
    }
  }
}
