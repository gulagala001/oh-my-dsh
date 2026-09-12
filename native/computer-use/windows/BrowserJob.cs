using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

// Loaded in memory by Windows PowerShell's built-in compiler. Keep this source
// compatible with .NET Framework / C# 5: ordinary browsing requires no SDK.
public static class OhMyDshBrowserJob
{
    public static void Run(string executable, string[] arguments)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        IntPtr job = IntPtr.Zero;
        ProcessInfo process = new ProcessInfo();
        bool assigned = false;
        try
        {
            // The guardian must still own a live connection before startup.
            Console.WriteLine("{\"type\":\"job-ready\"}");
            if (Console.ReadLine() != "start") return;
            Task<string> control = Task.Run(() => Console.ReadLine());
            job = CreateJobObjectW(IntPtr.Zero, null);
            if (job == IntPtr.Zero) Fail("Could not create the Windows browser job");
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE; no breakaway.
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits)))) Fail("Could not set browser job limits");
            if (control.IsCompleted) return;
            StartupInfo startup = new StartupInfo(); startup.Size = (uint)Marshal.SizeOf(typeof(StartupInfo));
            StringBuilder command = new StringBuilder(Quote(executable));
            foreach (string argument in arguments) command.Append(' ').Append(Quote(argument));
            // No job handle is inherited. The browser cannot run or create
            // children until it has entered our job, including under a CI job.
            if (!CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, false, 0x08000004, IntPtr.Zero, null, ref startup, out process)) Fail("Could not create the managed browser");
            if (!AssignProcessToJobObject(job, process.Process)) Fail("Could not assign the managed browser to its job");
            assigned = true;
            if (!control.IsCompleted)
            {
                if (ResumeThread(process.Thread) == uint.MaxValue) Fail("Could not resume the managed browser");
                Console.WriteLine("{\"type\":\"browser-started\",\"pid\":" + process.Id + "}");
                while (!control.IsCompleted && !Exited(process.Process)) Thread.Sleep(20);
                if (Exited(process.Process))
                {
                    uint code; if (!GetExitCodeProcess(process.Process, out code)) Fail("Could not read the browser exit code");
                    Console.WriteLine("{\"type\":\"browser-exited\",\"code\":" + code + "}");
                }
            }
            if (control.IsCompleted && control.Result != null && control.Result != "stop") throw new InvalidOperationException("Invalid browser job control message");
            Stop(job);
            Console.WriteLine("{\"type\":\"browser-cleaned\"}");
        }
        finally
        {
            // Assignment failure leaves a suspended process outside the job.
            // Its original creation handle identifies precisely that process.
            if (!assigned && process.Process != IntPtr.Zero)
            {
                TerminateProcess(process.Process, 1);
                WaitForSingleObject(process.Process, 5000);
            }
            // A broken control/output pipe or an exception also closes the
            // sole job handle. Windows then terminates all associated children.
            if (job != IntPtr.Zero) CloseHandle(job);
            if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
            if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
        }
    }
    private static void Stop(IntPtr job)
    {
        if (!TerminateJobObject(job, 1)) Fail("Could not terminate the browser job");
        Stopwatch deadline = Stopwatch.StartNew();
        while (true)
        {
            Accounting info;
            if (!QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) Fail("Could not confirm browser job cleanup");
            if (info.ActiveProcesses == 0) return;
            if (deadline.ElapsedMilliseconds > 5000) throw new InvalidOperationException("The Windows browser job is still releasing its processes");
            Thread.Sleep(20);
        }
    }
    private static bool Exited(IntPtr process)
    {
        uint result = WaitForSingleObject(process, 0);
        if (result == uint.MaxValue) Fail("Could not observe the browser process");
        return result == 0;
    }
    private static void Fail(string message) { throw new Win32Exception(Marshal.GetLastWin32Error(), message); }
    private static string Quote(string value)
    {
        // Windows CRT argv quoting, including quotes and trailing backslashes.
        StringBuilder result = new StringBuilder("\""); int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            result.Append('\\', character == '"' ? slashes * 2 + 1 : slashes);
            result.Append(character); slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }
    [StructLayout(LayoutKind.Sequential)] private struct ProcessInfo { public IntPtr Process, Thread; public uint Id, ThreadId; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct StartupInfo
    {
        public uint Size; public string Reserved, Desktop, Title;
        public uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public ushort ShowWindow, ReservedLength;
        public IntPtr ReservedBytes, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits
    {
        public long ProcessTime, JobTime; public uint LimitFlags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcessLimit; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits
    {
        public BasicLimits Basic; public IoCounters Io;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential)] private struct Accounting
    {
        public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)] private static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetInformationJobObject(IntPtr job, int type, ref ExtendedLimits info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool QueryInformationJobObject(IntPtr job, int type, out Accounting info, uint length, IntPtr returnedLength);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CreateProcessW(string application, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, [MarshalAs(UnmanagedType.Bool)] bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfo startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseHandle(IntPtr handle);
}
