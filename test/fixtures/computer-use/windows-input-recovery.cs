using System.Diagnostics;
using System.Text.Json;

internal static class RecoveryFixture
{
    public static void Main(string[] args)
    {
        if (args[0] == "claim")
        {
            using var mutex = new Mutex(false, args[1]); bool owned;
            try { owned = mutex.WaitOne(0); } catch (AbandonedMutexException) { owned = true; }
            Console.WriteLine(JsonSerializer.Serialize(new { owned }));
            if (owned) mutex.ReleaseMutex(); return;
        }
        using var parent = Process.GetProcessById(int.Parse(args[2]));
        bool Release() { File.AppendAllText(args[3], "release\n"); return File.Exists(args[4]); }
        InputRecovery.Run(args[1], () => !parent.HasExited, Release, Console.In, Console.Out);
    }
}
