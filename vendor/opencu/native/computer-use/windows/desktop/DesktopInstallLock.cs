using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

internal static class DesktopInstallLock
{
    internal static void Hold(string directory)
    {
        string scope = "", owner = "";
        if (OperatingSystem.IsWindows()) { using var user = WindowsIdentity.GetCurrent(); owner = user.User?.Value ?? ""; scope = "Global\\"; }
        string name = scope + "OhMyDsh-DesktopInstall-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(owner + ":" + directory)));
        using var mutex = new Mutex(false, name); bool owned = false;
        try
        {
            try { owned = mutex.WaitOne(TimeSpan.FromSeconds(25)); } catch (AbandonedMutexException) { owned = true; }
            if (!owned) throw new TimeoutException("Another desktop installation is still running");
            Console.Out.WriteLine("locked"); Console.Out.Flush();
            var bytes = new byte[1]; using var input = Console.OpenStandardInput(); while (input.Read(bytes) != 0) { }
        }
        finally { if (owned) mutex.ReleaseMutex(); }
    }
}
