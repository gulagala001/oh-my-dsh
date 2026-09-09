import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const dshHome = resolve(process.env.DSH_HOME || join(root, 'data', 'dsh'));
const profile = 'trisoul-x';
const env = { ...process.env, DSH_HOME: dshHome, DSH_PERMISSION_MODE: 'danger-full-access' };
const cli = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] });
mkdirSync(dshHome, { recursive: true });

// Adopt the prototype's user-supplied route once; DSH owns subsequent edits.
const legacyFile = join(root, 'data', 'settings.json');
if (!existsSync(join(dshHome, 'settings.yaml')) && existsSync(legacyFile)) {
  const legacy = JSON.parse(readFileSync(legacyFile, 'utf8'));
  const main = legacy.main;
  if (main?.model && main.baseUrl) {
    const route = (value, key) => ({ api: value.api, baseURL: value.baseUrl, apiKeyEnv: key,
      compat: value.compat || {}, models: [{ id: value.model, name: value.model, contextWindow: value.contextWindow || 128000, maxTokens: value.maxTokens || 16384, input: ['text'] }],
    });
    const providers = { 'trisoul-x-main': route(main, 'TRISOUL_X_MAIN_KEY') };
    const refs = { TRISOUL_X_MAIN_KEY: main.apiKey || 'local' };
    const settings = { 'llm-pi-ai': { providers }, 'agent-default-model': { provider: 'trisoul-x-main', model: main.model } };
    if (legacy.background) {
      providers['trisoul-x-background'] = route(legacy.background, 'TRISOUL_X_BACKGROUND_KEY');
      refs.TRISOUL_X_BACKGROUND_KEY = legacy.background.apiKey || 'local';
      settings['trisoul-x'] = { background: { provider: 'trisoul-x-background', model: legacy.background.model } };
    }
    writeFileSync(join(dshHome, 'settings.yaml'), JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
    if (!existsSync(join(dshHome, '.credentials.yaml'))) writeFileSync(join(dshHome, '.credentials.yaml'), JSON.stringify({ version: 1, refs }, null, 2) + '\n', { mode: 0o600 });
  }
}
const memory = join(dshHome, 'trisoul-x', 'memory.json');
if (!existsSync(memory) && existsSync(join(root, 'data', 'memory.json'))) {
  mkdirSync(join(dshHome, 'trisoul-x'), { recursive: true });
  copyFileSync(join(root, 'data', 'memory.json'), memory);
}
const profileManifest = join(dshHome, 'profiles', profile, 'package.json');
if (!existsSync(profileManifest)) run(['--profile', profile, '--from-default-profile', 'web', '--dump-config']);
const installed = JSON.parse(readFileSync(profileManifest, 'utf8'));
if (!installed.dependencies?.trisoul_x) run(['plugin', '--profile', profile, 'add', `link:${root}`]);

const child = spawn(process.execPath, [cli, '--profile', profile, '--no-open', '--port', process.env.PORT || '3083'], { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 0));
