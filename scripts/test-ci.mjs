import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// A few known regressions only; no host installation, browser or build matrix.
const core = [
  'start', 'monitor-partial', 'workflow-budget', 'task-budget-persistence',
  'file-upload-compat', 'context-original-search-boundary', 'background-owner-reload', 'recommended-update',
].map(name => `test/${name}.test.mjs`);
core.push('plugins/deepseek-workbench/test/ui-adapter.test.mjs');

const [command = 'run', suite = 'core', shard = '1/1'] = process.argv.slice(2);
if (command === 'matrix') {
  console.log(JSON.stringify({ include: [{ os: 'ubuntu-latest', node: '24', suite: 'core', shard: '1/1' }] }));
} else {
  const files = ['core', 'all', 'general', 'compatibility', 'windows'].includes(suite) ? core : null;
  if (!files || !/^[1-9]\d*\/[1-9]\d*$/.test(shard)) throw new Error('Unknown suite or invalid shard');
  if (new Set(files).size !== files.length || files.some(file => !existsSync(file))) throw new Error('Suite contains duplicate or missing tests');
  if (command === 'list') console.log(JSON.stringify(files));
  else if (command === 'run') {
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', `--test-shard=${shard}`, ...files], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else throw new Error('Usage: test-ci.mjs run/list [core|all] [shard], or matrix');
}
