import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const home = resolve(process.env.DSH_HOME || join(root, 'data', 'dsh'));
const cli = join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const env = { ...process.env, DSH_HOME: home };
mkdirSync(home, { recursive: true });
const profile = join(home, 'profiles/web/package.json');
if (!existsSync(profile) || !JSON.parse(readFileSync(profile)).dependencies?.opencu)
  execFileSync(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', 'link:' + root], { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] });
const child = spawn(process.execPath, [cli, 'web', '--no-open', '--port', process.env.PORT || '3084'], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 0));
