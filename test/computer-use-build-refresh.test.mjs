import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, appendFile, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('a running host detects source updates and recovers from a transient source read failure', async t => {
  const root = await mkdtemp(join(tmpdir(), 'trisoul-cu-build-refresh-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'scripts'), { recursive: true });
  await cp(new URL('../src/computer-use', import.meta.url), join(root, 'src/computer-use'), { recursive: true });
  await cp(new URL('../native', import.meta.url), join(root, 'native'), { recursive: true });
  await cp(new URL('../scripts/build-computer-use-native.mjs', import.meta.url), join(root, 'scripts/build-computer-use-native.mjs'));
  await symlink(new URL('../node_modules', import.meta.url).pathname, join(root, 'node_modules'));
  const { NativeHost } = await import(pathToFileURL(join(root, 'src/computer-use/native.mjs')));
  const host = new NativeHost(root), first = await host.expectedBuild();
  const header = join(root, 'native/computer-use/ComputerUse.h');
  await appendFile(header, '\n// isolated source update\n');
  const second = await host.expectedBuild();
  assert.notEqual(second.build, first.build, 'the same host must not pin the first source fingerprint');
  const content = await readFile(header);
  await rm(header);
  await assert.rejects(host.expectedBuild(), /ENOENT/);
  await writeFile(header, content);
  assert.equal((await host.expectedBuild()).build, second.build, 'a rejected read must not poison subsequent updates');
});
