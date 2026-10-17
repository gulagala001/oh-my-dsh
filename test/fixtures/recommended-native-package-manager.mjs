// A synthetic package-manager executable. Never installs packages or accesses the network.
import { appendFileSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function writeAddon(dir, version) {
  const bundle = join(dir, 'node_modules', 'addon');
  const plugin = join(bundle, 'node_modules', 'addon-plugin');
  rmSync(bundle, { recursive: true, force: true });
  mkdirSync(plugin, { recursive: true });
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'addon', version: `${version}.0.0`, type: 'module', dependencies: { 'addon-plugin': `${version}.0.0` }, dsh: { bundle: { patch: './cordis.patch.yml' } } }));
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [{ id: 'addon', name: 'addon-plugin' }] }]));
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: 'addon-plugin', version: `${version}.0.0`, type: 'module', exports: './plugin.mjs' }));
  writeFileSync(join(plugin, 'plugin.mjs'), `
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(join(dir, 'evaluations.log'))}, 'addon:${version}\\n');
export function apply(ctx) {
  ctx.get('nativeTrace').push('start:addon:${version}');
  ctx.provide('nativeVersion', ${version});
  ctx.effect(() => () => ctx.get('nativeTrace').push('stop:addon:${version}'));
}
`);
}

async function main() {
  const [rootArg, token, ...args] = process.argv.slice(2);
  const root = realpathSync(rootArg);
  const dir = realpathSync(process.cwd());
  if (dir !== join(root, 'profiles', 'test') || !dir.startsWith(root + sep)) throw Error('Unexpected fixture cwd');
  if (readFileSync(join(root, 'fixture-token'), 'utf8') !== token) throw Error('Invalid fixture token');
  const control = JSON.parse(readFileSync(join(root, 'control.json'), 'utf8'));
  const trace = line => appendFileSync(join(root, 'package-trace.log'), line + '\n');
  if (args.join(' ') === 'config get registry') { console.log('https://fixture.invalid/'); return; }
  const archive = `addon@file:${join(root, 'addon-2.tgz')}`;
  if (args[0] === 'view' && args[1] === archive) {
    const expected = ['view', archive, 'name', 'version', 'engines', 'peerDependencies', '--json', '--registry=https://fixture.invalid/', '--config.fetch-retries=0'];
    if (JSON.stringify(args) !== JSON.stringify(expected)) throw Error('Unexpected fixture lookup');
    console.log(JSON.stringify({ name: 'addon', version: '2.0.0' })); return;
  }
  const allowedFlag = value => /^--(?:registry|config\.registry)=https:\/\/fixture\.invalid\/$/.test(value);
  const [command, spec, ...flags] = args;
  if (!flags.every(allowedFlag)) throw Error('Unexpected fixture flags: ' + flags.join(' '));
  if (command !== 'remove' && command !== 'add') throw Error('Unexpected fixture command: ' + command);
  if ((command === 'remove' && spec !== 'addon') || (command === 'add' && spec !== archive)) throw Error('Unexpected fixture target');
  trace(command);
  const manifestPath = join(dir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (control.mode === 'remove-fail' && command === 'remove') { console.error('fixture removal failed'); process.exitCode = 1; return; }
  if (command === 'remove') {
    delete manifest.dependencies.addon;
    rmSync(join(dir, 'node_modules', 'addon'), { recursive: true });
  } else {
    // Exercise native manifest restoration on failure/cancellation; no downloaded module is installed.
    manifest.dependencies.addon = 'file:' + join(root, 'addon-2.tgz');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    if (control.mode === 'add-fail') { console.error('fixture installation failed'); process.exitCode = 1; return; }
    if (control.mode === 'add-wait') {
      writeFileSync(join(root, 'add-started'), String(process.pid));
      // Bounded even if the caller fails to cancel; native cancellation normally kills this process.
      await new Promise(resolve => setTimeout(resolve, 4000));
      console.error('fixture cancellation watchdog expired'); process.exitCode = 1; return;
    }
    writeAddon(dir, 2);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log('fixture complete');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
