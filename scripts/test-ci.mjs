import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// A few known regressions only; no host installation, browser or build matrix.
const core = [
  'market-release-check',
  'chat-style-adapter', 'host-build-contracts', 'file-context',
  'startup-isolation', 'metering-contract',
  'start', 'monitor-partial', 'monitor-read-cache', 'monitor-metadata', 'monitor-pricing-route', 'monitor-overview-cache', 'workflow-budget', 'task-budget-persistence',
  'file-upload-compat', 'search-compat', 'context-original-search-boundary', 'background-owner-reload', 'recommended-update', 'dsh-ops-compat',
  'context-store-cache', 'context-coordinate-release',
  'model-reply', 'temporary-chat', 'prompt-optimizer-drafts',
  'dream-source-lifecycle', 'dream-job-control',
  'context-controls', 'settings-state',
  'task-ledger-authority', 'task-history-replay', 'task-verification', 'task-verification-mode', 'plugin-operation-state', 'plugin-preflight', 'plugin-update-admission',
  'session-migration-cache', 'host-component-reload', 'loader-lifecycle-retention', 'codegraph-lifecycle', 'projectless-allocation', 'projectless-directory-native',
].map(name => `test/${name}.test.mjs`);
core.push('test/opencu-browser-generation.test.mjs');
core.push('test/opencu-control-continuity.test.mjs');
core.push('test/opencu-app-approval-session-cancel.test.mjs');
core.push('test/opencu-source-sync.test.mjs');
core.push('test/prompt-adaptation.test.mjs');
core.push('test/prompt-styles.test.mjs');
core.push('test/context-memory-cache.test.mjs');
core.push('test/image-budget.test.mjs');
core.push('test/context-first-window.test.mjs');
core.push('test/context-prepare-validation.test.mjs');
core.push('test/host-component-overlay.test.mjs');
core.push('test/ultra-mode.test.mjs', 'test/conversation-input-owner.test.mjs', 'test/model-label-contract.test.mjs');
core.push('test/overview-native-style.test.mjs', 'test/session-overview.test.mjs', 'test/session-overview-client.test.mjs');
core.push('test/web-chat-page-scripts.test.mjs');
core.push('test/context-optimization.test.mjs', 'test/bc-compatibility.test.mjs',
  'test/personality-files-session.test.mjs', 'test/projectless-disposal.test.mjs', 'test/projectless-cancellation.test.mjs', 'test/projectless-navigation.test.mjs');
core.push('test/tool-optimization-paths.test.mjs', 'test/document-views.test.mjs', 'test/session-plugin-records.test.mjs', 'test/monitor-preflight.test.mjs',
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
core.push('test/reasoning-replay.test.mjs');
core.push(...[
  'desktop-deny-contract', 'task-sdk-schema',
  'auto-compact-surface-index', 'auto-compact-native-session', 'auto-compact-coordinate',
  'auto-compact-retry', 'auto-compact-native-boundaries', 'recommended-update-native',
  'build-opencu-imports', 'conversation-controller-readiness',
].map(name => `test/${name}.test.mjs`));
const builtChecks = ['test/opencu-delivery.test.mjs', 'test/titlebar-clearance.test.mjs'];

const prebuilt = process.argv.includes('--built');
const [command = 'run', suite = 'core', ...extra] = process.argv.slice(2).filter(arg => arg !== '--built');
{
  const files = suite === 'core' ? prebuilt ? [...core, ...builtChecks] : core : null;
  if (!files || extra.length) throw new Error('Unknown suite or arguments');
  if (new Set(files).size !== files.length || files.some(file => !existsSync(file))) throw new Error('Suite contains duplicate or missing tests');
  if (command === 'list') console.log(JSON.stringify(files));
  else if (command === 'run') {
    if (prebuilt) {
      if (!existsSync('lib/host/metering-version.mjs') || !existsSync('lib/client.js')) throw Error('Run npm run build before using --built');
    } else {
      const built=spawnSync(process.execPath,['scripts/build-metering.mjs'],{stdio:'inherit'});
      if(built.status!==0)throw Error('Metering build failed');
    }
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...files], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else throw new Error('Usage: test-ci.mjs run/list core [--built]');
}
