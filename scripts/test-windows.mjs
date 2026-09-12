import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { release } from 'node:os';

if (process.platform !== 'win32') throw new Error('请在 Windows PowerShell 7 中运行此自检；其他平台的结果不能替代 Windows 验收。');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, 'cu-artifacts', 'windows-check-' + new Date().toISOString().replaceAll(/[:.]/g, '-'));
await mkdir(directory, { recursive: true });
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const report = { startedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, osRelease: release(), node: process.version, plugin: pkg.version, steps: [], nativeDesktop: { observation: 'not-tested', input: 'not-tested', pluginAdapter: 'not-tested', remaining: ['physical pointer and drag', 'clipboard restoration', 'physical user intervention', 'multi-monitor and DPI', 'uninstall', 'window handle reuse', 'lock screen'] }, status: 'running' };
const redact = value => value.replace(/([?&]token=)[^\s"'<>]+/g, '$1[redacted]');

async function step(name, command, args, timeoutMs = 600000, environment = {}) {
  console.log('开始：' + name);
  const started = Date.now(), logPath = join(directory, name + '.log'), log = createWriteStream(logPath);
  let tail = '', spawnError, timedOut = false;
  const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, ...environment, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } });
  const append = chunk => { const text = redact(chunk.toString()); tail = (tail + text).slice(-8000); log.write(text); process.stdout.write(text); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  const timeout = setTimeout(() => {
    timedOut = true;
    if (name === 'native-desktop') child.kill(); // EOF lets native children release input and clipboard; do not kill their recovery processes as a tree.
    else if (child.pid) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => child.kill());
  }, timeoutMs);
  const code = await new Promise(resolve => {
    child.once('error', error => { spawnError = error; resolve(null); });
    child.once('close', resolve);
  });
  clearTimeout(timeout); log.end(); await finished(log);
  const result = { name, code, timedOut, durationMs: Date.now() - started, log: logPath, ...(spawnError ? { error: spawnError.message } : {}) };
  report.steps.push(result); await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (code !== 0 || spawnError || timedOut) throw new Error(name + ' 未通过，日志：' + logPath);
  return tail;
}

try {
  await step('powershell', 'pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], 10000);
  const sdks = await step('dotnet', process.env.TRISOUL_CU_DOTNET || 'dotnet', ['--list-sdks'], 10000);
  if (!/^10\./m.test(sdks)) throw new Error('请安装 .NET 10 SDK，再重新运行自检。');
  await step('build', process.execPath, ['scripts/build.mjs']);
  await step('core', process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1', 'test/build.test.mjs', 'test/dsh-core.test.mjs', 'test/task-ledger.test.mjs', 'test/context-history.test.mjs', 'test/memory-parity.test.mjs', 'test/memory-curation.test.mjs', 'test/restored-mechanisms.test.mjs', 'test/dsh-http.test.mjs', 'test/dsh-install.test.mjs']);
  await step('browser', process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1', 'test/computer-use-browser.test.mjs', 'test/computer-use-view.test.mjs', 'test/computer-use-files.test.mjs', 'test/computer-use-windows-install.test.mjs', 'test/computer-use-windows-bridge.test.mjs', 'test/computer-use-windows-browser.test.mjs']);
  await step('frontend', process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1', 'test/computer-use-annotation.test.mjs', 'test/frontend-ui.test.mjs', 'test/computer-use-ui.test.mjs', 'test/computer-use-windows-setup-ui.test.mjs']);
  report.nativeDesktop.observation = 'running';
  await step('native-desktop', process.execPath, ['--test', '--test-reporter=tap', '--test-concurrency=1', 'test/computer-use-windows-native-protocol.test.mjs', 'test/computer-use-windows-input-events.test.mjs', 'test/computer-use-windows-input-recovery.test.mjs', 'test/computer-use-windows-native-runtime.test.mjs', 'test/computer-use-windows-native.test.mjs', 'test/computer-use-windows-apps.test.mjs'], 600000, { TRISOUL_CU_WINDOWS_NATIVE_TEST: '1' });
  report.nativeDesktop.observation = 'passed';
  report.nativeDesktop.input = 'keyboard-uia-and-pointer-passed'; report.nativeDesktop.pluginAdapter = 'passed'; report.nativeDesktop.installation = 'install-uninstall-reinstall-passed';
  report.nativeDesktop.remaining = report.nativeDesktop.remaining.filter(item => !['physical pointer and drag', 'uninstall'].includes(item));
  report.status = 'passed';
  console.log('本次 Windows 自检项目通过。报告中的 remaining 项仍须分别验证，此结果不代表 Windows 全部能力完成。');
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
  if (report.nativeDesktop.observation === 'running') report.nativeDesktop.observation = 'failed';
  console.error(error.message);
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('完整自检结果：' + directory);
}
