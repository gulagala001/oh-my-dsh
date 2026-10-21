import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, access, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

test('starting from another cwd preserves relative home, explicit permissions and a spaced host path', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omd start options-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const caller = join(root, 'caller directory'), source = join(root, 'source checkout');
  await mkdir(caller); await mkdir(join(source, 'scripts'), { recursive: true });
  await copyFile(new URL('../scripts/start.mjs', import.meta.url), join(source, 'scripts/start.mjs'));
  const cli = join(caller, 'external host.cjs');
  await writeFile(cli, `const fs = require('node:fs'), path = require('node:path');
    const home = process.env.DSH_HOME, args = process.argv.slice(2);
    fs.appendFileSync(path.join(home, 'commands.jsonl'), JSON.stringify({ args, cwd: process.cwd(), home, permission: process.env.DSH_PERMISSION_MODE }) + '\\n');
    if (args.includes('--from-default-profile')) {
      const dir = path.join(home, 'profiles/oh-my-dsh'); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: {} }));
    }
    if (args[0] === 'plugin') {
      const file = path.join(home, 'profiles/oh-my-dsh/package.json');
      fs.writeFileSync(file, JSON.stringify({ dependencies: { 'oh-my-dsh': args.at(-1) } }));
    }`);
  for (const permission of ['workspace-write']) {
    const env = { ...process.env, OMD_DSH_CLI: 'external host.cjs', DSH_HOME: 'home', PORT: '0' };
    if (permission === undefined) delete env.DSH_PERMISSION_MODE;
    else env.DSH_PERMISSION_MODE = permission;
    execFileSync(process.execPath, [join(source, 'scripts/start.mjs')], { cwd: caller, env, stdio: 'pipe' });
    const last = JSON.parse((await readFile(join(caller, 'home/commands.jsonl'), 'utf8')).trim().split('\n').at(-1));
    assert.equal(last.cwd, source);
    assert.equal(last.home, join(caller, 'home'));
    assert.equal(last.permission, permission ?? 'danger-full-access');
    assert.equal(last.args.at(-1), '0');
  }
});
