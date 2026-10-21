import { validateSessionId } from './hub-store.mjs';
import { withRequestSignal } from './http.mjs';

// Header listing uses the public native corpus, not body inspection or Agent
// activation. Ordinary native sessions need no OMD sidecar or usage record.
export async function hasColdNativeSession(ctx, id, signal) {
  validateSessionId(id);
  signal?.throwIfAborted();
  const query = ctx.get('sessionQuery');
  if (typeof query?.listSessions !== 'function') throw Error('宿主没有可用的原生会话目录接口');
  const records = await query.listSessions(signal);
  signal?.throwIfAborted();
  if (!Array.isArray(records)) throw Error('原生会话目录格式无效');
  return records.some(record => record.header?.id === id);
}

export async function coldNativeMonitorTarget(ctx, id, req, res) {
  return withRequestSignal(req, res, signal => hasColdNativeSession(ctx, id, signal));
}
