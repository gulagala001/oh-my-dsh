import { operationFailureContext } from './owned-browser.mjs';
// Narrow e545-style diagnostics. Raw errors stay in memory until the public
// boundary; neither message, stack, cause text, path nor protocol body is copied.
const names = new Set(['Error','AssertionError','TypeError','RangeError','SyntaxError','TimeoutError','AbortError','TargetClosedError']);
const codes = new Set(['ERR_ASSERTION','ENOENT','EACCES','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ABORT_ERR','ERR_ABORTED','ERR_SOCKET_CLOSED','ERR_TARGET_CLOSED','DISCONNECTED','RELEASE_FAILED','COMMAND_TIMEOUT']);
const phases = new Set(['entry','setup','pairing','journey','exercise','cancel','recover','shutdown','cleanup']);
const checks = new Set(['cleanup-deadline','cleanup-unsettled','unsafe-storage','terminal-poll','owner-retained','late-attach','natural-exit','connection-row','missing-harness','cleanup deadline exceeded','cleanup underlying tasks remain','pending browser operations retained','PW operations failed to settle','natural browser close unproven','forced or nonnatural cleanup cannot pass','late driver after abort','operation budget exceeded','operation cancelled','operation cancelled before start','owned process identity unavailable']);
export class CheckFailure extends Error { constructor(check) { super('Known test check failed'); this.check = checks.has(check) ? check : 'unknown'; } }
export function safeFailure(error, phase = 'entry') {
  const leaves = [];
  const visit = (value, depth=0) => {
    if (depth < 8 && value instanceof AggregateError) { for (const item of value.errors.slice(0,32)) visit(item,depth+1); return; }
    const name = names.has(value?.name) ? value.name : 'unknown', code = codes.has(value?.code) ? value.code : 'unknown';
    const check = checks.has(value?.check) ? value.check : 'none';
    const category = check !== 'none' ? 'known-check' : code === 'ERR_ASSERTION' || name === 'AssertionError' ? 'assertion' : name === 'TimeoutError' || code === 'ETIMEDOUT' ? 'timeout' : name === 'AbortError' || code === 'ABORT_ERR' ? 'cancelled' : name === 'TargetClosedError' || ['DISCONNECTED','ERR_SOCKET_CLOSED','ERR_TARGET_CLOSED'].includes(code) ? 'transport-closed' : 'external-operation';
    const context = operationFailureContext(value);
    const operation = context?.operation;
    leaves.push({category,name,code,check,...(typeof operation === 'string' && /^[a-zA-Z0-9:-]{1,80}$/.test(operation) ? {operation} : {})});
  };
  visit(error);
  return {phase:phases.has(phase)?phase:'entry',first:leaves[0],failures:leaves,categories:[...new Set(leaves.map(row=>row.category))].sort()};
}
export function publicFailure(error, phase) {
  const result = new Error(JSON.stringify(safeFailure(error,phase))); result.name = 'WebCuFailure'; result.stack = `${result.name}: ${result.message}`; return result;
}
