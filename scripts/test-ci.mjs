import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const compatibility = [
  'native-tools-coexist', 'tool-cancellation', 'plugin-frontend-coexist', 'loader-lifecycle-compat', 'llm-request-projection', 'verification-native',
  'dsh-core', 'dsh-live-plugin', 'dsh-http', 'dsh-install', 'dsh-distribution',
  'host-component', 'host-lifecycle', 'session-migration', 'context-persistence',
  'workflow-host', 'workflow-integration', 'ultracode-integration', 'task-budget-native',
  'projectless-workspaces', 'projectless-state', 'projectless-workspaces-ui',
];
const windows = [
  'native-tools-coexist', 'tool-cancellation', 'plugin-frontend-coexist', 'loader-lifecycle-compat', 'llm-request-projection', 'verification-native',
  'dsh-install', 'host-lifecycle', 'desktop-lifecycle', 'session-migration',
  'background-runtime', 'host-jobs', 'neutral-environment-native', 'workflow-host',
  'workflow-integration', 'workflow-worktree', 'ultracode-integration',
  'model-panel-ui', 'workflow-status-ui', 'browser-tools', 'computer-use-ui',
  'projectless-workspaces', 'projectless-state', 'projectless-workspaces-ui',
  'opencu-sync',
];
// These have their own three-platform installation workflow on every code PR.
const offline = new Set(['offline.test.mjs', 'offline-install.test.mjs', 'offline-root.test.mjs']);
const [command, suite = 'general', shard = '1/1'] = process.argv.slice(2);

if (command === 'matrix') {
  const matrix = [];
  const add = (os, node, suite, count) => {
    for (let index = 1; index <= count; index++) matrix.push({ os, node, suite, shard: `${index}/${count}` });
  };
  if (suite === 'full') {
    add('ubuntu-latest', '22.19.0', 'all', 2);
    add('ubuntu-latest', '24', 'all', 2);
    add('windows-latest', '24', 'all', 4);
  } else if (suite === 'general') {
    add('ubuntu-latest', '24', 'general', 6);
    add('ubuntu-latest', '22.19.0', 'compatibility', 1);
    add('windows-latest', '24', 'windows', 2);
  } else throw new Error(`Unknown CI matrix: ${suite}`);
  console.log(JSON.stringify({ include: matrix }));
} else {
  const all = readdirSync('test').filter(name => name.endsWith('.test.mjs')).sort();
  const names = suite === 'all' ? all : suite === 'general' ? all.filter(name => !offline.has(name))
    : suite === 'compatibility' ? compatibility.map(name => `${name}.test.mjs`)
    : suite === 'windows' ? windows.map(name => `${name}.test.mjs`) : null;
  if (!names || !/^[1-9]\d*\/[1-9]\d*$/.test(shard)) throw new Error('Unknown CI suite or invalid shard');
  const files = names.map(name => `test/${name}`);
  if (new Set(files).size !== files.length || files.some(file => !existsSync(file))) throw new Error('CI suite contains duplicate or missing tests');
  if (command === 'list') console.log(JSON.stringify(files));
  else if (command === 'run') {
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', `--test-shard=${shard}`, ...files], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else throw new Error('Usage: test-ci.mjs matrix [general|full], or run/list <suite> [shard]');
}
