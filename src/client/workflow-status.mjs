// Correlate only durable workflow tool results with their actual native calls
// and run-start records. User text and output from another tool are not evidence.
export function workflowJobs(entries) {
  const calls = new Map(), runs = new Map();
  for (const entry of entries) {
    const event = entry.event ?? entry, data = event.data;
    if (event.type === 'tool/call') calls.set(event.seq, data);
    else if (event.type === 'tool-workflow/run-start') runs.set(data.runId, { seq: event.seq });
    else if (event.type === 'tool-workflow/run-end') {
      const run = runs.get(data.runId);
      if (run) { run.ended = true; run.failures = data.failures ?? []; }
    } else if (event.type === 'tool/result' && !data.message?.isError) {
      const message = data.message;
      if (message?.role !== 'tool' || message.source?.kind !== 'tool') continue;
      const text = (message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
      const jobId = /^workflow "[\s\S]*?" started in the background as job ([^.\s]+)\./.exec(text)?.[1];
      const runId = /\nRun ID: ([^\r\n]+)(?:\r?\n|$)/.exec(text)?.[1];
      const run = runs.get(runId);
      if (!jobId || !run || run.seq >= event.seq) continue;
      const owned = event.sourceEventSeqs?.some(seq => {
        const call = calls.get(seq);
        return seq < run.seq && call?.name === 'workflow' && call.callId === message.toolCallId
          && call.callId === message.source.callId;
      });
      if (owned) run.jobId = jobId;
    }
  }
  return runs;
}

// The native renderer treats a closed tool step as an interrupted run. A
// background job outlives that step (and possibly its parent turn). Correct
// only this inferred status while the exact owning job is demonstrably live.
// Missing jobs, durable endings, and real member outcomes remain untouched.
export function liveWorkflowData(node, runs, jobs, sessionId) {
  const run = runs.get(node.id), data = node.data;
  if (run?.failures?.length && data.status === 'completed') return { ...data, status: 'failed', failures: run.failures };
  if (data.status !== 'interrupted' || !run?.jobId || run.ended) return data;
  const job = jobs?.find(row => row.id === run.jobId && row.kind === 'workflow' && row.owner === sessionId);
  if (!job || !['running', 'stopping'].includes(job.status)) return data;
  return { ...data, status: 'running', phases: data.phases.map(phase => ({
    ...phase, members: phase.members.map(member => member.status === 'interrupted' ? { ...member, status: 'running' } : member),
  })) };
}
