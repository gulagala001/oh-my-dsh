import { zstdDecompressSync } from 'node:zlib';
import { unexpectedEvalTool } from './computer-use-eval-protocol.mjs';

// UI detail is bounded; session counters preserve failures and disallowed
// input attempts even when their individual rows have scrolled out of history.
export function readOperationStats(status) {
  const history = Array.isArray(status?.history) ? status.history : [];
  const stats = status?.operationStats;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  if (stats && [stats.total, stats.succeeded, stats.failed, stats.cancelled].every(count)
    && stats.total === stats.succeeded + stats.failed + stats.cancelled && stats.total >= history.length
    && stats.methods && typeof stats.methods === 'object' && !Array.isArray(stats.methods)
    && Object.values(stats.methods).every(count) && Object.values(stats.methods).reduce((a, b) => a + b, 0) === stats.total) {
    return { ...stats, methods: { ...stats.methods }, complete: true, historyComplete: stats.total === history.length };
  }
  const result = { total: history.length, succeeded: 0, failed: 0, cancelled: 0, methods: Object.create(null), complete: !stats && Array.isArray(status?.history) && history.length < 60 };
  for (const entry of history) {
    result[entry.ok ? 'succeeded' : entry.cancelled ? 'cancelled' : 'failed']++;
    result.methods[entry.operation] = (result.methods[entry.operation] ?? 0) + 1;
  }
  return { ...result, historyComplete: result.complete };
}

export function readComputerUseTrace(data) {
  const result = { computerUseCalls: 0, toolFailures: [], completedTurns: 0, unexpectedTools: [] }, pendingTurns = new Set(); let offset = 0;
  const calls = new Map();
  // DSH appends independent frames. Decoding once reads only the session
  // header, silently omitting every tool result that follows it.
  while (offset < data.length) {
    const frame = zstdDecompressSync(data.subarray(offset), { info: true });
    if (!frame.engine.bytesWritten) throw new Error('Session trace decoder made no progress');
    offset += frame.engine.bytesWritten;
    const text = frame.buffer.toString();
    // Node's decoder can return partial output without rejecting a truncated
    // frame. A persisted JSONL append must contain whole, terminated records.
    if (!text.endsWith('\n')) throw new Error('Session trace contains an incomplete record');
    for (const line of text.trim().split('\n')) {
      if (!line) continue; const event = JSON.parse(line);
      if (event.type === 'turn/start') pendingTurns.add(event.data?.turn);
      if (event.type === 'turn/end') { pendingTurns.delete(event.data?.turn); result.completedTurns++; }
      if (event.type === 'tool/call' && typeof event.data?.callId === 'string') calls.set(event.data.callId, event.data.name);
      if (event.type === 'tool/call') {
        const unexpected = unexpectedEvalTool(event.data?.name, event.data?.arguments);
        if (unexpected) result.unexpectedTools.push({ step: event.data?.step, ...unexpected });
      }
      if (event.type !== 'tool/result') continue;
      if (Object.hasOwn(event.data?.meta ?? {}, 'computerUseError')) result.computerUseCalls++;
      const failed = (event.data?.message?.content ?? []).filter(block => block.type === 'tool-result' && block.isError);
      const error = event.data?.meta?.computerUseError ?? (failed.length ? failed.flatMap(block => (block.content ?? []).filter(item => item.type === 'text').map(item => item.text)).join('\n') || 'Tool execution failed' : null);
      const tool = Object.hasOwn(event.data?.meta ?? {}, 'computerUseError') ? 'computer_use' : calls.get(event.data?.message?.source?.callId) ?? 'unknown';
      if (error) result.toolFailures.push({ step: event.data.step, tool, message: String(error) });
    }
  }
  if (pendingTurns.size || !result.completedTurns) throw new Error('Session trace does not end with a completed turn');
  return result;
}
