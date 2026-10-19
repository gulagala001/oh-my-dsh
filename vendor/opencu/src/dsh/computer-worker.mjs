import { parentPort } from 'node:worker_threads';
import { createComputerRepl } from './computer-repl.mjs';
import { serializeReplError, deserializeReplError } from './repl-output.mjs';

const pending = new Map();
let sequence = 0, cell;
const computer = createComputerRepl((endpoint, args) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  parentPort.postMessage({ type: 'request', cell, id, endpoint, args });
}), partial => parentPort.postMessage({ type: 'progress', cell, partial }));

parentPort.on('message', async message => {
  if (message.type === 'response') {
    const work = pending.get(message.id);
    if (!work) return;
    pending.delete(message.id);
    if (message.error) work.reject(deserializeReplError(message.error));
    else work.resolve(message.result);
    return;
  }
  if (message.type !== 'run') return;
  cell = message.cell;
  try { parentPort.postMessage({ type: 'result', cell, result: await computer.run(message.args) }); }
  catch (error) { parentPort.postMessage({ type: 'result', cell, error: serializeReplError(error) }); }
});
