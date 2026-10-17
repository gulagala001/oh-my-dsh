using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace OpenCU {
  // Only event kind and occurrence are retained; text and key codes are never recorded.
  internal static class Activity {
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct Message { public IntPtr Window; public uint Id; public UIntPtr WParam; public IntPtr LParam; public uint Time; public Point Point; public uint Private; }
    [StructLayout(LayoutKind.Sequential)] struct Keyboard { public uint Key, Scan, Flags, Time; public UIntPtr Extra; }
    [StructLayout(LayoutKind.Sequential)] struct Mouse { public Point Point; public uint Data, Flags, Time; public UIntPtr Extra; }
    delegate IntPtr Callback(int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int kind, Callback callback, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll")] static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
    internal static readonly UIntPtr Marker = new UIntPtr(0x4f435531u);
    static readonly object gate = new object();
    static readonly Dictionary<long, string> targets = new Dictionary<long, string>();
    static readonly Dictionary<string, object> latest = new Dictionary<string, object>();
    static readonly string occurrence = Guid.NewGuid().ToString();
    static readonly Callback keyboardCallback = KeyboardEvent, mouseCallback = MouseEvent;
    static Thread worker; static uint threadId; static bool available; static string error = "Activity listener is starting"; static long sequence;
    internal static void Watch(long window, string id) { lock (gate) targets[window] = id; }
    static void Record(string kind) {
      lock (gate) {
        string id;
        if (!targets.TryGetValue(GetForegroundWindow().ToInt64(), out id)) return;
        latest[id] = new Dictionary<string, object> { {"documentId", occurrence}, {"sequence", ++sequence}, {"kind", kind}, {"at", DateTime.UtcNow.ToString("o")} };
      }
    }
    static IntPtr KeyboardEvent(int code, IntPtr message, IntPtr data) {
      try { if (code >= 0 && (message.ToInt64() == 0x100 || message.ToInt64() == 0x104) && ((Keyboard)Marshal.PtrToStructure(data, typeof(Keyboard))).Extra != Marker) Record("keyboard"); }
      catch (Exception e) { lock (gate) { available = false; error = e.Message; } }
      return CallNextHookEx(IntPtr.Zero, code, message, data);
    }
    static IntPtr MouseEvent(int code, IntPtr message, IntPtr data) {
      try {
        if (code >= 0 && ((Mouse)Marshal.PtrToStructure(data, typeof(Mouse))).Extra != Marker) {
          long type = message.ToInt64();
          if (type == 0x201 || type == 0x204 || type == 0x207) Record("pointerdown");
          else if (type == 0x20a || type == 0x20e) Record("wheel");
        }
      } catch (Exception e) { lock (gate) { available = false; error = e.Message; } }
      return CallNextHookEx(IntPtr.Zero, code, message, data);
    }
    internal static object Read(string id) {
      lock (gate) {
        var result = new Dictionary<string, object> { {"userActivityMonitoring", new Dictionary<string, object> { {"available", available}, {"reason", error} }} };
        object value; if (latest.TryGetValue(id, out value)) result["userActivity"] = value;
        return result;
      }
    }
    internal static bool Available { get { lock (gate) return available; } }
    internal static void Start() {
      worker = new Thread(() => {
        IntPtr keyboard = IntPtr.Zero, mouse = IntPtr.Zero;
        try {
          threadId = GetCurrentThreadId(); Message message; PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
          keyboard = SetWindowsHookEx(13, keyboardCallback, GetModuleHandle(null), 0);
          mouse = SetWindowsHookEx(14, mouseCallback, GetModuleHandle(null), 0);
          lock (gate) { available = keyboard != IntPtr.Zero && mouse != IntPtr.Zero; error = available ? null : "Windows input hooks unavailable: " + Marshal.GetLastWin32Error(); }
          if (available) while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { }
        } catch (Exception e) { lock (gate) { available = false; error = e.Message; } }
        finally { if (keyboard != IntPtr.Zero) UnhookWindowsHookEx(keyboard); if (mouse != IntPtr.Zero) UnhookWindowsHookEx(mouse); lock (gate) available = false; }
      });
      worker.IsBackground = true; worker.Start();
    }
    internal static void Stop() { if (threadId != 0) PostThreadMessage(threadId, 0x12, UIntPtr.Zero, IntPtr.Zero); }
  }
}
