import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// A few known regressions only; no host installation, browser or build matrix.
const core = [
  'startup-isolation', 'metering-contract',
  'start', 'monitor-partial', 'monitor-read-cache', 'monitor-metadata', 'monitor-pricing-route', 'monitor-overview-cache', 'workflow-budget', 'task-budget-persistence',
  'file-upload-compat', 'search-compat', 'context-original-search-boundary', 'background-owner-reload', 'recommended-update',
  'context-store-cache', 'context-coordinate-release',
  'model-reply', 'temporary-chat', 'prompt-optimizer-drafts',
  'dream-source-lifecycle', 'dream-job-control',
  'context-controls', 'settings-state',
  'task-ledger-authority', 'task-history-replay', 'task-verification', 'task-verification-mode', 'plugin-operation-state', 'plugin-preflight', 'plugin-update-admission',
  'session-migration-cache', 'host-component-reload', 'loader-lifecycle-retention', 'codegraph-lifecycle', 'projectless-allocation',
].map(name => `test/${name}.test.mjs`);
core.push('test/opencu-browser-generation.test.mjs');
core.push('test/opencu-app-approval-session-cancel.test.mjs');
core.push('test/opencu-source-sync.test.mjs');
core.push('test/prompt-adaptation.test.mjs');
core.push('test/prompt-styles.test.mjs');
core.push('test/context-memory-cache.test.mjs');
core.push('test/image-budget.test.mjs');
core.push('test/context-first-window.test.mjs');
core.push('test/host-component-overlay.test.mjs');
core.push('test/ultra-mode.test.mjs', 'test/conversation-input-owner.test.mjs', 'test/model-label-contract.test.mjs');
core.push('test/overview-native-style.test.mjs', 'test/session-overview.test.mjs', 'test/session-overview-client.test.mjs');
core.push('test/web-chat-page-scripts.test.mjs');
core.push('test/context-optimization.test.mjs', 'test/bc-compatibility.test.mjs',
  'test/personality-files-session.test.mjs', 'test/projectless-disposal.test.mjs', 'test/projectless-cancellation.test.mjs', 'test/projectless-navigation.test.mjs');
core.push('test/tool-optimization-paths.test.mjs', 'test/monitor-preflight.test.mjs',
  'test/tool-computation.test.mjs', 'test/web-fetch-pool.test.mjs');
core.push('test/result-reduction-memo.test.mjs', 'test/legacy-identity.test.mjs', 'test/legacy-settings.test.mjs');
core.push('test/evidence-lifecycle.test.mjs');
core.push('test/client-injection.test.mjs');
core.push('test/glyph-rendering.test.mjs');
core.push('test/btw-integration.test.mjs');
core.push('test/extensions-commands-native.test.mjs');
core.push('test/extensions-skills-native.test.mjs');
core.push('test/extensions-instructions-native.test.mjs');
core.push('test/persona-settings-api.test.mjs');
core.push('test/monitor-import.test.mjs', 'test/monitor-aggregate-cache.test.mjs');
core.push('test/ptc-lifecycle.test.mjs', 'test/preset-projection.test.mjs');

const [command = 'run', suite = 'core', shard = '1/1'] = process.argv.slice(2);
if (command === 'matrix') {
  console.log(JSON.stringify({ include: [{ os: 'ubuntu-latest', node: '24', suite: 'core', shard: '1/1' }] }));
} else {
  const files = ['core', 'all', 'general', 'compatibility', 'windows'].includes(suite) ? core : null;
  if (!files || !/^[1-9]\d*\/[1-9]\d*$/.test(shard)) throw new Error('Unknown suite or invalid shard');
  if (new Set(files).size !== files.length || files.some(file => !existsSync(file))) throw new Error('Suite contains duplicate or missing tests');
  if (command === 'list') console.log(JSON.stringify(files));
  else if (command === 'run') {
    const built=spawnSync(process.execPath,['scripts/build-metering.mjs'],{stdio:'inherit'});
    if(built.status!==0)throw Error('Metering build failed');
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', `--test-shard=${shard}`, ...files], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else throw new Error('Usage: test-ci.mjs run/list [core|all] [shard], or matrix');
}
