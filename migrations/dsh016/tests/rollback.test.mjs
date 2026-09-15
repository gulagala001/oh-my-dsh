import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { main } from '../migrate.mjs';
const hash = s => createHash('sha256').update(s).digest('hex');
function fixture(t) {
 const root = mkdtempSync(join(tmpdir(), 'tri-rollback-test-'));
 t.after(() => rmSync(root, { recursive: true, force: true }));
 execFileSync('git', ['init', '--quiet'], { cwd: root });
 const backup = join(root, '.git', 'trisoul-migration-0.4.0');
 mkdirSync(backup, { recursive: true });
 const files = [
  {path:'existing.txt',backup:'0.bin',before:hash('before'),after:hash('after')},
  {path:'added.txt',backup:'1.bin',before:null,after:hash('added')},
  {path:'not-yet-written.txt',backup:'2.bin',before:null,after:null}
 ];
 writeFileSync(join(root,'existing.txt'),'after');writeFileSync(join(root,'added.txt'),'added');
 writeFileSync(join(backup,'0.bin'),'before');
 writeFileSync(join(backup,'record.json'),JSON.stringify({files}));
 return {root,backup};
}
test('rollback restores owned files and tolerates not-yet-written paths',async t=>{
 const {root}=fixture(t);writeFileSync(join(root,'unrelated.txt'),'keep');
 await main(['--project',root,'--rollback','--apply']);
 assert.equal(readFileSync(join(root,'existing.txt'),'utf8'),'before');
 assert.equal(existsSync(join(root,'added.txt')),false);
 assert.equal(readFileSync(join(root,'unrelated.txt'),'utf8'),'keep');
});
test('rollback refuses later edits before changing any owned file',async t=>{
 const {root}=fixture(t);writeFileSync(join(root,'added.txt'),'new user work');
 await assert.rejects(main(['--project',root,'--rollback','--apply']),/Post-migration changes/);
 assert.equal(readFileSync(join(root,'existing.txt'),'utf8'),'after');
});
test('rollback rejects corrupt backup before changing sources',async t=>{
 const {root,backup}=fixture(t);writeFileSync(join(backup,'0.bin'),'corrupt');
 await assert.rejects(main(['--project',root,'--rollback','--apply']),/Backup checksum/);
 assert.equal(readFileSync(join(root,'existing.txt'),'utf8'),'after');
});
test('mutation flags require explicit apply',async t=>{
 const {root}=fixture(t);
 await assert.rejects(main(['--project',root,'--rollback']),/requires explicit/);
 await assert.rejects(main(['--project',root,'--install']),/requires explicit/);
 assert.equal(readFileSync(join(root,'existing.txt'),'utf8'),'after');
});
