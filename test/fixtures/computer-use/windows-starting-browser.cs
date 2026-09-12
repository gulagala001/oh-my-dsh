using System;
using System.Diagnostics;
using System.Reflection;
using System.Threading;

// Deliberately never publishes a debugger endpoint. A second process proves
// that owner death during startup also cleans descendants, not just a PID.
public static class PendingBrowser
{
    public static void Main(string[] arguments)
    {
        if (arguments.Length == 0 || arguments[0] != "child")
            Process.Start(new ProcessStartInfo(Assembly.GetExecutingAssembly().Location, "child") { UseShellExecute = false, CreateNoWindow = true });
        Thread.Sleep(Timeout.Infinite);
    }
}
