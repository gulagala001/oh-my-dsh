import { readFile } from 'node:fs/promises';
import { launchNativeHost } from '../../src/plugin-preflight/native-host.mjs';
const { cli, root, channelKey, separate } = JSON.parse(await readFile(process.argv[2], 'utf8'));
const host = launchNativeHost(cli, root, () => {}, separate);
let result;
try { await Promise.all([host.listening, host.boot]); host.assertAlive?.(); result = { ok: true }; }
catch (error) { result = { ok: false, code: error.code, message: error.message }; }
await new Promise(resolve => process.send({ channelKey, type: 'result', result }, resolve));
host.quit(result.ok ? 0 : 1, () => process.send({ channelKey, type: 'result', result: { ok: false, code: 'cleanup-failed' } }), 100);
