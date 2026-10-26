// A read window is not a complete-file observation. Keep this policy at the
// native fs/write-intent boundary so Native and nested PTC share it, after the
// host has resolved path aliases and applied its existing write policy.
export function installFileReadIntegrity(ctx, managed) {
  const sessions = new WeakMap(), pending = new Map(), completed = new Map();
  const state = session => { if (!sessions.has(session)) sessions.set(session, new Map()); return sessions.get(session); };
  const eligible = exec => exec?.agent?.session && managed(exec.agent.session);
  const key = target => target.targetKey;
  const complete = (target, version, exec) => {
    if (!eligible(exec) || !key(target)) return;
    state(exec.agent.session).set(key(target), { version, complete: true });
  };
  ctx.on('fs/observed', (target, observation, exec) => {
    if (!eligible(exec) || !key(target)) return;
    if (exec.name === 'read' && observation.kind === 'present') pending.set(exec.token, { target, version: observation.version, session: exec.agent.session });
    else if (observation.kind === 'present' && ['write', 'edit'].includes(exec.name)) {
      const records = state(exec.agent.session), previous = records.get(key(target));
      records.set(key(target), { version: observation.version, complete: exec.name === 'write' || previous?.complete === true, ranges: [] });
    }
  }, { global: true });
  ctx.on('tools/result', (exec, result) => {
    const snapshot = completed.get(exec.token); completed.delete(exec.token);
    if (snapshot && !result.isError && !exec.signal?.aborted && result.value === snapshot.value
      && (exec.parent || result.content?.length === 1 && result.content[0].type === 'text' && result.content[0].text === snapshot.value)) for (const item of snapshot.entries) complete(item.target, item.version, exec);
    const read = pending.get(exec.token); pending.delete(exec.token);
    if (!read || result.isError || exec.signal?.aborted) return;
    const session = exec.agent.session, records = state(session), previous = records.get(key(read.target));
    if (previous?.complete && previous.version === read.version) return;
    const value = result.value;
    if (!Number.isSafeInteger(value?.totalLines) || value.totalLines < 0 || !Array.isArray(value.lines)) return;
    const record = previous?.version === read.version && previous.totalLines === value.totalLines
      ? previous : { version: read.version, totalLines: value.totalLines, ranges: [], complete: false };
    if (record.complete) return;
    for (const line of value.lines) {
      if (!Number.isSafeInteger(line.number) || line.number < 1 || line.number > value.totalLines || typeof line.text !== 'string') continue;
      if (/\(line truncated to \d+ chars\)/.test(line.text)) continue;
      record.ranges.push([line.number, line.number]);
    }
    record.ranges.sort((a,b)=>a[0]-b[0]);
    const ranges = [];
    for (const range of record.ranges) {
      const last = ranges.at(-1);
      if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1]); else ranges.push([...range]);
    }
    record.ranges = ranges;
    record.complete = value.totalLines === 0 || ranges.length === 1 && ranges[0][0] === 1 && ranges[0][1] === value.totalLines;
    records.set(key(read.target), record);
  }, { global: true });
  ctx.on('fs/write-intent', async (target, exec, next) => {
    const intent = await next();
    if (!eligible(exec)) return intent;
    const record = sessions.get(exec.agent.session)?.get(key(target));
    if (record && !record.complete) throw Object.assign(new Error(
      `Cannot replace the whole file ${JSON.stringify(target.displayPath)} from an incomplete read window. No write was performed. Use edit for a localized change, or read the remaining ranges of the current file before write. Truncated long lines need an exact raw snapshot (context_view with partial=false); joining partial read.lines cannot reconstruct a file.`), { code: 'OMD_INCOMPLETE_FILE_READ' });
    return intent;
  }, { global: true });
  ctx.on('omd/file-read-complete', (target, version, value, exec) => {
    if (!eligible(exec)) return;
    const snapshot = completed.get(exec.token) ?? { entries: [], value, session: exec.agent.session };
    snapshot.entries.push({ target, version }); completed.set(exec.token, snapshot);
  }, { global: true });
  ctx.on('agent/disposed', ({ agent }) => { for (const entries of [pending, completed]) for (const [token, read] of entries) if (read.session === agent.session) entries.delete(token); }, { global: true });
  ctx.effect(() => () => { pending.clear(); completed.clear(); });
  return { complete };
}
