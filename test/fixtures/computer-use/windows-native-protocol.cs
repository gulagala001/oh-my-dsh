using System.Text.Json;

internal static class ProtocolFixture
{
    public static async Task Main(string[] args)
    {
        int active = 0, cleanups = 0;
        async Task<object> Execute(string name, JsonElement values, CancellationToken token)
        {
            Interlocked.Increment(ref active);
            await File.AppendAllTextAsync(args[0], "started:" + name + "\n");
            try
            {
                if (name == "hold")
                {
                    try { await Task.Delay(30000, token); }
                    finally { await Task.Delay(150); }
                }
                return NativeProtocol.Result(new { value = values.TryGetProperty("value", out var value) ? value.GetString() : name });
            }
            finally { Interlocked.Decrement(ref active); await File.AppendAllTextAsync(args[0], "finished:" + name + "\n"); }
        }
        async Task Cleanup()
        {
            if (args.Length > 1 && args[1] == "fail-cleanup-once" && ++cleanups == 1) throw new NativeFailure("CLEANUP_PENDING", "Fixture resource has not released yet");
            await File.AppendAllTextAsync(args[0], "cleanup:" + active + "\n");
        }
        await new NativeProtocol(Execute, Cleanup, new { serverInfo = new { name = "protocol-fixture" } }).Run(Console.OpenStandardInput(), Console.OpenStandardOutput());
    }
}
