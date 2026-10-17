import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root)));
const manifest = JSON.parse(readFileSync(new URL('scripts/desktop-releases.json', root)));
const workflow = readFileSync(new URL('.github/workflows/desktop.yml', root), 'utf8');
const gate = workflow.match(/node --input-type=module - <<'NODE'\n([\s\S]*?)\n          NODE/)[1]
  .split('\n').map(line => line.replace(/^          /, '')).join('\n');

function eligibility(version, releases = manifest.releases) {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-desktop-gate-'));
  try {
    mkdirSync(join(cwd, 'scripts'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ devDependencies: { '@deepseek-ai/dsh': version } }));
    writeFileSync(join(cwd, 'scripts/desktop-releases.json'), JSON.stringify({ schema: 1, releases }));
    writeFileSync(join(cwd, 'output'), '');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', gate], {
      cwd, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: join(cwd, 'output'), GITHUB_STEP_SUMMARY: join(cwd, 'summary') },
    });
    assert.ifError(result.error);
    return { ...result, output: readFileSync(join(cwd, 'output'), 'utf8') };
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

test('the pinned SDK enables both verified official Desktop package jobs', () => {
  assert.equal(pkg.devDependencies['@deepseek-ai/dsh'], '0.2.1-rc.2');
  const result = eligibility(pkg.devDependencies['@deepseek-ai/dsh']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /^available=true\n/);
  const matrix = JSON.parse(result.output.split('matrix=')[1]);
  assert.deepEqual(matrix.include, [
    { os: 'windows-latest', target: 'win-x64' }, { os: 'macos-latest', target: 'mac-arm64' },
  ]);
});

test('an unreviewed SDK cannot pass even when metadata exists', () => {
  for (const version of ['0.2.1-alpha.2', '0.2.1-rc.3']) {
    const result = eligibility(version, { [version]: manifest.releases['0.2.1-rc.2'] });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires the verified 0.2.1-rc.2 SDK/);
    assert.equal(result.output, '');
  }
});

test('missing release or platform metadata fails rather than silently skipping packaging', () => {
  for (const releases of [{}, { '0.2.1-rc.2': { 'mac-arm64': manifest.releases['0.2.1-rc.2']['mac-arm64'] } }]) {
    const result = eligibility('0.2.1-rc.2', releases);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /both targets are required/);
    assert.equal(result.output, '');
  }
});
