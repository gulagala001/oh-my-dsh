import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('../scripts/dsh-release-plan.mjs', import.meta.url));
const plan = (...args) => JSON.parse(execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' }));

test('release planning names every SDK section and distinguishes prepared source from an official tag', () => {
  const before = readFileSync(new URL('../package.json', import.meta.url));
  const result = plan('99.0.0');
  assert.equal(result.pluginVersion, '99.0.0-omd.' + JSON.parse(before).version.split('.omd.')[1]);
  assert.ok(result.sdkChanges.some(change => change.section === 'dependencies' && change.name === '@deepseek-ai/dsh-mcp-client'));
  assert.ok(result.sdkChanges.some(change => change.section === 'peerDependencies' && change.name === '@deepseek-ai/dsh-tools'));
  assert.ok(result.sdkChanges.some(change => change.source === 'OpenCU package.json'));
  assert.ok(result.sourceSnapshots.every(source => source.matchesRequestedRelease === false));
  assert.ok(result.desktopTargets.every(target => target.verifiedMetadataPresent === false));
  assert.deepEqual(readFileSync(new URL('../package.json', import.meta.url)), before);
  assert.equal(plan('0.2.0-rc.1', '--omd', '1.3.0').pluginVersion, '0.2.0-rc.1.omd.1.3.0');
});
