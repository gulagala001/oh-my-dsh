// Launched by Chrome Native Messaging. stdout is exclusively framed protocol.
import { createConnection } from 'node:net';
import { readFileSync, watchFile, unwatchFile } from 'node:fs';
import { fileURLToPath } from 'node:url';

const receipt = fileURLToPath(new URL('./installation.json', import.meta.url));
function migrated() {
  try { const value = JSON.parse(readFileSync(receipt, 'utf8')); return value.owner === 'trisoul-x-computer-use' && !!value.supersededBy; }
  catch { return false; }
}

const args = process.argv.slice(2), at = name => args.indexOf(name);
const socketPath = args[at('--socket') + 1], expectedOrigin = args[at('--extension-origin') + 1];
const caller = args.filter(value => value.startsWith('chrome-extension://')).at(-1);
if (at('--socket') < 0 || at('--extension-origin') < 0 || !socketPath || !expectedOrigin || caller !== expectedOrigin || args.filter(value => value === expectedOrigin).length !== 2) {
  process.stderr.write('Invalid native messaging invocation\n'); process.exit(1);
}
const socket = createConnection(socketPath);
let done = false;
function close(error) {
  if (done) return; done = true;
  unwatchFile(receipt);
  if (error) { process.stderr.write('Trisoul browser bridge disconnected\n'); process.exitCode = 1; }
  process.stdin.destroy(); socket.destroy(); process.stdout.end();
}
watchFile(receipt, { interval: 250, persistent: false }, () => { if (migrated()) close(); });
if (migrated()) close();
socket.on('connect', () => { process.stdin.pipe(socket); socket.pipe(process.stdout); });
socket.on('error', close); socket.on('close', () => close());
process.stdin.on('error', close); process.stdout.on('error', close);
process.stdin.on('end', () => socket.end());
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => close());
