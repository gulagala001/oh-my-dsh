import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeKeyChord } from '../src/computer-use/native-keys.mjs';

const run = promisify(execFile), dotnet = process.env.TRISOUL_CU_DOTNET || 'dotnet';
test('real Windows INPUT encoding balances every partial prefix and preserves Unicode, layouts and negative monitors', { skip: process.platform !== 'win32' && !process.env.TRISOUL_CU_DOTNET, timeout: 60000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'oh-my-dsh-input-encoding-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of ['WindowsInputEvents.cs', 'NativeProtocol.cs', 'ClipboardHtml.cs']) await copyFile(new URL('../native/computer-use/windows/desktop/' + file, import.meta.url), join(root, file));
  await copyFile(new URL('./fixtures/computer-use/windows-input-events.cs', import.meta.url), join(root, 'Fixture.cs'));
  await writeFile(join(root, 'Fixture.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>');
  await run(dotnet, ['build', join(root, 'Fixture.csproj'), '-o', join(root, 'out'), '--nologo'], { timeout: 40000 });
  const query = async args => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(dotnet, [join(root, 'out', 'Fixture.dll')], { timeout: 5000 }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout)));
      child.stdin.end(JSON.stringify(args) + '\n');
    });
    if (result.error || result.html) return result;
    assert.equal(result.size, 40, 'Windows x64/ARM64 INPUT ABI is 40 bytes');
    const keyOf = event => event.type === 1 ? 'k:' + event.key + ':' + event.scan + ':' + (event.flags & ~2) : 'm:' + ([2, 8, 32].find(down => event.flags & (down | (down << 1))) ?? 0);
    for (let prefix = 0; prefix <= result.events.length; prefix++) {
      const held = new Set();
      for (const event of [...result.events.slice(0, prefix), ...result.cleanups[prefix]]) {
        assert.equal(event.tag, 1234567890123);
        if (event.type === 1) { if (event.flags & 2) held.delete(keyOf(event)); else held.add(keyOf(event)); }
        else { if (event.flags & (2 | 8 | 32)) held.add(keyOf(event)); if (event.flags & (4 | 16 | 64)) held.delete(keyOf(event)); }
      }
      assert.equal(held.size, 0, 'partially accepted packet ' + prefix + ' must release every held input');
    }
    return result;
  };
  const chord = async (key, layout = {}) => query({ method: 'chord', ...nativeKeyChord(key, 'win32'), layout });
  const win = await chord('Win+e', { e: 0x45 }); assert.deepEqual(win.events.map(event => event.key), [0x5b, 0x45, 0x45, 0x5b]);
  const arrows = await chord('Ctrl+Shift+Left'); assert.deepEqual(arrows.events.map(event => event.key), [0x11, 0x10, 0x25, 0x25, 0x10, 0x11]); assert.equal(arrows.events[2].flags, 1);
  assert.equal((await chord('KP_Enter')).events[0].flags, 1); assert.equal((await chord('KP_7')).events[0].key, 0x67); assert.equal((await chord('F24')).events[0].key, 0x87);
  const german = await chord('at', { '@': 0x0651 }); assert.deepEqual(german.events.slice(0, 3).map(event => event.key), [0x11, 0x12, 0x51]);
  const us = await chord('plus', { '+': 0x01bb }); assert.deepEqual(us.events.slice(0, 2).map(event => event.key), [0x10, 0xbb]);
  assert.match((await chord('Ctrl+Alt+Delete')).error, /secure attention/);
  assert.match((await chord('a', {})).error, /keyboard layout/);
  const text = await query({ method: 'text', text: '中文🙂\r\n好\n' });
  assert.deepEqual(text.events.filter(event => event.type === 1 && !(event.flags & 2)).map(event => event.scan || event.key), [0x4e2d, 0x6587, 0xd83d, 0xde42, 13, 0x597d, 13]);
  assert.match((await query({ method: 'text', text: 'before\ud800after' })).error, /surrogate|invalid|incomplete/i);
  for (const button of ['left', 'right', 'middle']) await query({ method: 'click', button });
  for (const [x, y] of [[-1920, -1080], [-1, -1], [0, 0], [1919, 1079]]) {
    const moved = await query({ method: 'move', x, y, left: -1920, top: -1080, width: 3840, height: 2160 });
    assert.equal(Math.floor(moved.events[0].x * 3840 / 65536) - 1920, x);
    assert.equal(Math.floor(moved.events[0].y * 2160 / 65536) - 1080, y);
    assert.equal(moved.events[0].flags, 0xc001);
  }
  assert.match((await query({ method: 'move', x: 1920, y: 0, left: -1920, top: -1080, width: 3840, height: 2160 })).error, /outside/);
  const fragment = '<p>中文 <strong>emoji 🙂</strong></p>', html = Buffer.from((await query({ method: 'html', text: fragment })).html);
  const offset = name => Number(html.toString('utf8').match(new RegExp(name + ':(\\d+)'))[1]);
  assert.equal(html.subarray(offset('StartFragment'), offset('EndFragment')).toString('utf8'), fragment);
  assert.equal(html.subarray(offset('StartHTML'), offset('EndHTML')).toString('utf8').startsWith('<html>'), true);
  assert.equal(offset('EndHTML'), html.length, 'CF_HTML offsets count UTF-8 bytes, not UTF-16 characters');
});
