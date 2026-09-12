using System;
using System.ComponentModel;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

// Loaded in memory by Windows PowerShell's built-in compiler. Keep this source
// compatible with .NET Framework / C# 5: ordinary browsing requires no SDK.
public static class OhMyDshBrowserJob
{
    public static void Run(string executable, string[] arguments, int guardianPid)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        IntPtr job = IntPtr.Zero;
        ProcessInfo process = new ProcessInfo();
        try
        {
            // The guardian must still own a live connection before startup.
            Console.WriteLine("{\"type\":\"job-ready\"}");
            if (Console.ReadLine() != "start") return;
            job = CreateJobObjectW(IntPtr.Zero, null);
            if (job == IntPtr.Zero) Fail("Could not create the Windows browser job");
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE; no breakaway.
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits)))) Fail("Could not set browser job limits");
            // The Node guardian retains a duplicate handle. If this helper is
            // killed, it can recover this exact job without PID-tree guessing.
            IntPtr guardian = OpenProcess(0x1040, false, checked((uint)guardianPid));
            if (guardian == IntPtr.Zero) Fail("Could not retain the browser job in its guardian");
            IntPtr retained;
            try
            {
                long created = Created(guardian);
                Console.WriteLine("{\"type\":\"job-retain-ready\",\"created\":\"" + created.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\"}");
                // Keep this original process handle open across the reply:
                // neither transfer nor later recovery may follow a reused PID.
                if (Console.ReadLine() != "retain") return;
                if (!DuplicateHandle(GetCurrentProcess(), job, guardian, out retained, 0, false, 2)) Fail("Could not duplicate the browser job handle");
            }
            finally { CloseHandle(guardian); }
            Console.WriteLine("{\"type\":\"job-owned\",\"handle\":\"" + retained.ToInt64().ToString(System.Globalization.CultureInfo.InvariantCulture) + "\"}");
            // Do not create any browser until the guardian has the receipt.
            if (Console.ReadLine() != "owned") return;
            Task<string> control = Task.Run(() => Console.ReadLine());
            if (control.IsCompleted) return;
            StringBuilder command = new StringBuilder(Quote(executable));
            foreach (string argument in arguments) command.Append(' ').Append(Quote(argument));
            process = CreateInJob(job, executable, command);
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
            // The guardian either confirms normal cleanup or uses its retained
            // handle to recover. Losing both handles kills the entire job.
            if (job != IntPtr.Zero) CloseHandle(job);
            if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
            if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
        }
    }
    public static void Recover(int guardianPid, long guardianCreated, long retained)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        IntPtr guardian = OpenProcess(0x1040, false, checked((uint)guardianPid));
        if (guardian == IntPtr.Zero) Fail("Could not open the browser job guardian");
        IntPtr job = IntPtr.Zero;
        try
        {
            if (Created(guardian) != guardianCreated) throw new InvalidOperationException("The browser job guardian identity has changed");
            if (!DuplicateHandle(guardian, new IntPtr(retained), GetCurrentProcess(), out job, 0, false, 2)) Fail("Could not recover the retained browser job");
            Stop(job);
            Console.WriteLine("{\"type\":\"browser-cleaned\"}");
        }
        finally { if (job != IntPtr.Zero) CloseHandle(job); CloseHandle(guardian); }
    }
    private static long Created(IntPtr process)
    {
        long created, exited, kernel, user;
        if (!GetProcessTimes(process, out created, out exited, out kernel, out user)) Fail("Could not verify the browser guardian creation identity");
        return created;
    }
    private static ProcessInfo CreateInJob(IntPtr job, string executable, StringBuilder command)
    {
        IntPtr attributes = IntPtr.Zero, jobs = IntPtr.Zero;
        IntPtr size = IntPtr.Zero; bool initialized = false;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
        if (size == IntPtr.Zero) Fail("Could not size browser process attributes");
        try
        {
            attributes = Marshal.AllocHGlobal(size);
            if (!InitializeProcThreadAttributeList(attributes, 1, 0, ref size)) Fail("Could not initialize browser process attributes");
            initialized = true;
            jobs = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobs, job);
            // PROC_THREAD_ATTRIBUTE_JOB_LIST makes assignment part of process
            // creation. Killing the helper cannot strand an unassigned child.
            if (!UpdateProcThreadAttribute(attributes, 0, new UIntPtr(0x2000d), jobs, new UIntPtr((uint)IntPtr.Size), IntPtr.Zero, IntPtr.Zero)) Fail("Could not set the browser process job");
            StartupInfoEx startup = new StartupInfoEx();
            startup.Startup.Size = (uint)Marshal.SizeOf(typeof(StartupInfoEx)); startup.Attributes = attributes;
            ProcessInfo result;
            if (!CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, false, 0x08080004, IntPtr.Zero, null, ref startup, out result)) Fail("Could not create the managed browser in its job");
            return result;
        }
        finally
        {
            if (initialized) DeleteProcThreadAttributeList(attributes);
            if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
            if (jobs != IntPtr.Zero) Marshal.FreeHGlobal(jobs);
        }
    }
    private static void Stop(IntPtr job)
    {
        var handles = new List<IntPtr>(); var seen = new HashSet<uint>();
        Stopwatch deadline = Stopwatch.StartNew();
        try
        {
            CaptureProcesses(job, handles, seen);
            if (!TerminateJobObject(job, 1)) Fail("Could not terminate the browser job");
            while (true)
            {
                CaptureProcesses(job, handles, seen);
                Accounting info;
                if (!QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) Fail("Could not confirm browser job cleanup");
                if (info.ActiveProcesses == 0) break;
                if (deadline.ElapsedMilliseconds > 5000) throw new InvalidOperationException("The Windows browser job is still releasing its processes");
                Thread.Sleep(20);
            }
            // Job accounting can remove a terminating process before its
            // final handles are released. Wait on the original OS process
            // handles as well, not just the job's active-process counter.
            foreach (IntPtr handle in handles)
                if (WaitForSingleObject(handle, (uint)Math.Max(0, 5000 - deadline.ElapsedMilliseconds)) != 0) throw new InvalidOperationException("A Windows browser child has not finished exiting");
        }
        finally { foreach (IntPtr handle in handles) CloseHandle(handle); }
    }
    private static void CaptureProcesses(IntPtr job, List<IntPtr> handles, HashSet<uint> seen)
    {
        for (int capacity = 64; ; capacity = checked(capacity * 2))
        {
            int size = checked(8 + capacity * IntPtr.Size); IntPtr data = Marshal.AllocHGlobal(size);
            try
            {
                if (!QueryJobProcesses(job, 3, data, (uint)size, IntPtr.Zero))
                {
                    if (Marshal.GetLastWin32Error() == 234) continue;
                    Fail("Could not enumerate the owned browser job");
                }
                int count = Marshal.ReadInt32(data, 4);
                if (count < 0 || count > capacity) throw new InvalidOperationException("Invalid Windows job process list");
                for (int i = 0; i < count; i++)
                {
                    uint id = checked((uint)Marshal.ReadIntPtr(data, 8 + i * IntPtr.Size).ToInt64());
                    if (seen.Contains(id)) continue;
                    IntPtr handle = OpenProcess(0x101000, false, id); // SYNCHRONIZE | QUERY_LIMITED_INFORMATION
                    if (handle == IntPtr.Zero)
                    {
                        if (Marshal.GetLastWin32Error() == 87) continue; // Already exited.
                        Fail("Could not observe an owned browser child");
                    }
                    bool belongs;
                    if (!IsProcessInJob(handle, job, out belongs)) { CloseHandle(handle); Fail("Could not verify browser child ownership"); }
                    // A PID may have disappeared between enumeration and
                    // OpenProcess. Never wait on or stop a replacement process.
                    if (!belongs) { CloseHandle(handle); continue; }
                    seen.Add(id); handles.Add(handle);
                }
                return;
            }
            finally { Marshal.FreeHGlobal(data); }
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
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] private struct StartupInfoEx { public StartupInfo Startup; public IntPtr Attributes; }
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
    [DllImport("kernel32.dll", EntryPoint = "QueryInformationJobObject", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool QueryJobProcesses(IntPtr job, int type, IntPtr info, uint length, IntPtr returnedLength);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);
    [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr sourceHandle, IntPtr targetProcess, out IntPtr targetHandle, uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint options);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetProcessTimes(IntPtr process, out long created, out long exited, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, UIntPtr attribute, IntPtr value, UIntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] private static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsProcessInJob(IntPtr process, IntPtr job, [MarshalAs(UnmanagedType.Bool)] out bool belongs);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CreateProcessW(string application, StringBuilder commandLine, IntPtr processAttributes, IntPtr threadAttributes, [MarshalAs(UnmanagedType.Bool)] bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseHandle(IntPtr handle);
}
