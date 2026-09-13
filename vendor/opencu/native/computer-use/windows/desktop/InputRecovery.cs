using System.IO;

// The recovery process owns a second OS mutex before a drag can press down.
// If its parent dies, a new controller must wait until the release succeeds.
// The callbacks are the only platform-specific part; the real process/EOF/
// mutex protocol is exercised by the portable .NET fixture as well.
internal static class InputRecovery
{
    internal static void Run(string mutexName, Func<bool> parentAlive, Func<bool> release, TextReader input, TextWriter output)
    {
        using var mutex = new Mutex(false, mutexName);
        bool owned = false, armed = false;
        try
        {
            try { owned = mutex.WaitOne(0); } catch (AbandonedMutexException) { owned = true; }
            if (!owned) throw new NativeFailure("INPUT_CLEANUP_PENDING", "Another input recovery process still owns this desktop");
            output.WriteLine("ready"); output.Flush();
            // Console.In is a synchronized TextReader whose ReadLineAsync can
            // execute synchronously. Put the blocking read on another thread
            // so parent-death detection keeps running with stdin still open.
            var pending = Task.Run(input.ReadLine);
            while (parentAlive())
            {
                if (!pending.Wait(50)) continue;
                string? command = pending.GetAwaiter().GetResult();
                if (command is null) break;
                if (command == "arm") { armed = true; output.WriteLine("armed"); output.Flush(); }
                else if (command == "clear") { armed = false; output.WriteLine("cleared"); output.Flush(); }
                else throw new InvalidDataException("Invalid input recovery command");
                pending = Task.Run(input.ReadLine);
            }
        }
        finally
        {
            // Keep ownership while Windows rejects release (e.g. a desktop
            // transition). Do not let another controller inherit held input.
            if (armed) while (!release()) Thread.Sleep(100);
            if (owned) mutex.ReleaseMutex();
        }
    }
}
