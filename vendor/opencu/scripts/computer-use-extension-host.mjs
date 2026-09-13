// Launched by Chrome Native Messaging. stdout is exclusively framed protocol.
import { createConnection } from 'node:net';

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
  if (error) { process.stderr.write('Trisoul browser bridge disconnected\n'); process.exitCode = 1; }
  process.stdin.destroy(); socket.destroy(); process.stdout.end();
}
socket.on('connect', () => { process.stdin.pipe(socket); socket.pipe(process.stdout); });
socket.on('error', close); socket.on('close', () => close());
process.stdin.on('error', close); process.stdout.on('error', close);
process.stdin.on('end', () => socket.end());
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => close());
