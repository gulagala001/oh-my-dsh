import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const core = [
  'native-session-read', 'native-session-fork', 'market-release-check', 'release-feed', 'alpha-tool-pipeline',
  'chat-style-adapter', 'host-build-contracts', 'file-context', 'permission-presets', 'startup-isolation',
  'metering-contract', 'console-dock', 'rewind-client', 'start', 'monitor-partial', 'monitor-read-cache',
  'monitor-metadata', 'monitor-pricing-route', 'monitor-overview-cache', 'workflow-budget',
  'task-budget-persistence', 'file-upload-compat', 'search-compat', 'context-original-search-boundary',
  'background-owner-reload', 'recommended-update', 'recommended-plugin-package', 'dsh-ops-compat',
  'context-store-cache', 'context-coordinate-release', 'context-runtime-retirement', 'model-reply',
  'temporary-chat', 'temporary-chat-client', 'overview-panel', 'sidebar-sections', 'prompt-optimizer-drafts',
  'dream-source-lifecycle', 'dream-job-control', 'context-controls', 'settings-state', 'experimental-presets',
  'task-ledger-authority', 'task-history-replay', 'task-verification', 'task-verification-mode',
  'plugin-operation-state', 'plugin-preflight', 'plugin-update-admission', 'session-migration-cache',
  'component-lease', 'host-component-reload', 'loader-lifecycle-retention', 'codegraph-lifecycle',
  'projectless-allocation', 'projectless-directory-native', 'opencu-browser-generation',
  'opencu-control-continuity', 'opencu-app-approval-session-cancel', 'opencu-source-sync', 'prompt-adaptation',
  'prompt-styles', 'context-memory-cache', 'image-budget', 'context-first-window', 'context-prepare-validation',
  'host-component-overlay', 'host-factory-imports', 'ultra-mode', 'conversation-input-owner',
  'model-label-contract', 'overview-native-style', 'session-overview', 'session-overview-client',
  'web-chat-page-scripts', 'context-optimization', 'bc-compatibility', 'personality-files-session',
  'projectless-disposal', 'projectless-cancellation', 'projectless-navigation', 'tool-optimization-paths',
  'document-views', 'session-plugin-records', 'monitor-preflight', 'tool-computation', 'web-fetch-native',
  'result-reduction-memo', 'legacy-identity', 'legacy-settings', 'evidence-lifecycle', 'client-injection',
  'glyph-rendering', 'btw-integration', 'extensions-commands-native', 'extensions-skills-native',
  'extensions-instructions-native', 'persona-settings-api', 'monitor-unharnessed', 'monitor-import',
  'monitor-aggregate-cache', 'ptc-lifecycle', 'preset-projection', 'reasoning-replay', 'desktop-deny-contract',
  'task-sdk-schema', 'auto-compact-surface-index', 'auto-compact-native-session', 'auto-compact-coordinate',
  'auto-compact-retry', 'auto-compact-native-boundaries', 'recommended-update-native', 'build-opencu-imports',
  'conversation-controller-readiness',
].map(name => `test/${name}.test.mjs`);
const builtChecks = ['test/opencu-delivery.test.mjs', 'test/titlebar-clearance.test.mjs', 'test/job-wait-cancel.test.mjs'];

const prebuilt = process.argv.includes('--built');
const [command = 'run', suite = 'core', ...extra] = process.argv.slice(2).filter(arg => arg !== '--built');
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
