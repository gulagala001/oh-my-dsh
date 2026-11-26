import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('release notes use the package candidate before the published documentation moves', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-release-notes-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'docs'));
  const script = join(root, 'scripts/check-docs.mjs');
  copyFileSync(new URL('../scripts/check-docs.mjs', import.meta.url), script);

  const pkg = { name: 'oh-my-dsh', version: '0.2.2-rc.5.omd.1.9.5' };
  const published = '0.2.2-rc.5.omd.1.9.4';
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  writeFileSync(join(root, 'docs/structure.json'), JSON.stringify({ published }));
  const candidateNotes = '# Oh My DSH 1.9.5 · DSH 0.2.2 rc.5\n\nCandidate change.\n';
  const previousNotes = '# Oh My DSH 1.9.4 · DSH 0.2.2 rc.5\n\nPrevious change.\n';
  writeFileSync(join(root, 'CHANGELOG.md'), candidateNotes + '\n' + previousNotes);

  const notes = (...args) => execFileSync(process.execPath, [script, '--release-notes', ...args], { encoding: 'utf8' });
  assert.equal(notes(), candidateNotes);
  assert.equal(notes(published), previousNotes);
  assert.equal(notes('1.9.4'), previousNotes);
});
