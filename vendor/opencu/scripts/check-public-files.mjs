import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateName = /(?:^|\/)(?:AGENTS|CLAUDE|AI_README|COMPUTER_USE_(?:HANDOFF|BASELINE|ASSESSMENT)|WINDOWS_HANDOFF|OMAA_HANDOFF|PROMPT_(?:MAINTENANCE|CHANGES))\.md$/i;
const privateTree = /^(?:\.cache|\.codegraph|\.context[^/]*|\.opencu-sync-[^/]*|work|data|cu-artifacts|test-results|native\/browser-engine)(?:\/|$)/;
const privateFile = /(?:^|\/)(?:\.credentials\.yaml|\.env(?:\.[^/]*)?|[^/]+\.log)$/;
const forbidden = path => {
  const relative = path.replace(/^package\//, '').replace(/^vendor\/opencu\//, '');
  return privateName.test(relative) || privateTree.test(relative) || (privateFile.test(relative) && !relative.startsWith('test/fixtures/') && !relative.endsWith('.env.example'));
};
const verify = (label, paths) => {
  const bad = paths.filter(forbidden);
  if (bad.length) throw new Error(`${label} contains private files:\n${bad.join('\n')}`);
};
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
let checkout = false;
try { checkout = git(['rev-parse', '--show-toplevel']).trim() === root.replace(/\/$/, ''); } catch {}
if (checkout) {
  verify('Git file list', git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean));
  let base;
  try { base = git(['rev-parse', '--verify', 'origin/main']).trim(); } catch {}
  if (base) {
    const commits = git(['rev-list', `${base}..HEAD`]).trim().split('\n').filter(Boolean);
    for (const commit of commits) verify(`Commit ${commit}`, git(['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean));
  }
}
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const [packed] = JSON.parse(execFileSync(command, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] }));
verify('npm package', packed.files.map(entry => entry.path));
console.error(`Public file gate passed: ${packed.entryCount} package entries${checkout ? ', Git and new history checked' : ''}.`);
