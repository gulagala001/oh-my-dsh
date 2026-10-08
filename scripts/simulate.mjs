#!/usr/bin/env node
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from './simulator/scenarios.mjs';
import { runScenario, runControls, writeReport } from './simulator/run.mjs';
import { generateCases, exploreCases, minimizeFailure } from './simulator/explore.mjs';
import { createGeneratedDefinition } from './simulator/generated-scenario.mjs';

const help = `用法：pnpm simulate [选项]
  --list                    列出已实现的真实宿主场景
  --scenario <id>           运行单个场景（默认 full-lifecycle）
  --all                     运行全部场景
  --ui                      加入真实 Web 浏览器点击与截图
  --clock virtual|real      默认 virtual；超时场景要求虚拟时间
  --isolation native|process 默认 native（macOS 原生出网/写入隔离）
  --report <目录>           报告输出父目录
  --replay <input.json>     重放报告中的明确场景输入
  --transcript <文件>       使用严格实录响应（与 --replay 配合）
  --explore                自动生成并真实执行会话组合
  --seed <整数>            探索seed，默认1
  --cases <数量>           默认12
  --max-steps <数量>       默认12
  --budget-ms <毫秒>       探索真实耗时预算，默认120000
  --minimize               对探索失败在预算内最小化
  --self-test               执行独立断言的故意缺陷对照
  --help                    显示用法
真实模型API不会被调用。完整运行需要已安装项目依赖与已构建客户端。
process 模式有模型出口及 Node 网络封锁，不宣称提供 OS 沙箱。`;

export function suiteStatus(reports, { aborted = false, exploration } = {}) {
  if (!exploration) return !aborted && reports.length && reports.every(result => result.status === 'pass') ? 'pass' : 'fail';
  if (exploration.results.some(result => ['fail', 'invalid'].includes(result.status))) return 'fail';
  if (reports.some(report => report.status === 'fail' && !['exploration_timeout', 'exploration_cancelled'].includes(report.interruption))) return 'fail';
  if (aborted || exploration.status !== 'completed' || exploration.results.some(result => ['timeout', 'cancelled'].includes(result.status))) return 'incomplete';
  return exploration.results.length === exploration.total && exploration.results.every(result => result.status === 'pass') ? 'pass' : 'incomplete';
}

export async function main(args = process.argv.slice(2)) {
  const options = { clock: 'virtual', isolation: 'native' };
  const valued = new Set(['--scenario', '--report', '--replay', '--transcript', '--clock', '--isolation', '--seed', '--cases', '--max-steps', '--budget-ms']);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (valued.has(argument)) { const value = args[++index]; if (!value || value.startsWith('--')) throw Error('Missing value for ' + argument); options[argument.slice(2)] = value; }
    else if (['--all', '--ui', '--list', '--self-test', '--help', '--explore', '--minimize'].includes(argument)) options[argument.slice(2)] = true;
    else throw Error('Unknown option: ' + argument);
  }
  if (options.help) { console.log(help); return 0; }
  if (options.list) { for (const scenario of SCENARIOS) console.log(scenario.id + '\t' + scenario.title); return 0; }
  if ([options.all, options.explore, options['self-test'], Boolean(options.replay), Boolean(options.scenario)].filter(Boolean).length > 1) throw Error('Choose one of --all, --explore, --self-test, --replay or --scenario');
  if (!['virtual', 'real'].includes(options.clock) || !['native', 'process'].includes(options.isolation)) throw Error('Unsupported clock or isolation mode');
  if (options.minimize && !options.explore) throw Error('--minimize requires --explore');
  if (options.replay) {
    const input = JSON.parse(await readFile(resolve(options.replay), 'utf8'));
    if (input.version !== 1 || input.kind !== 'omd-simulation-input' || (!input.generatedCase && !SCENARIOS.some(item => item.id === input.scenario))) throw Error('Unsupported or invalid scenario input');
    for (const key of Object.keys(input)) if (!['version', 'kind', 'scenario', 'parameters', 'clock', 'isolation', 'ui', 'generatedCase', 'recording'].includes(key)) throw Error('Unknown replay input field: ' + key);
    Object.assign(options, input);
  }
  if (options.transcript) { if (!options.replay) throw Error('--transcript requires the corresponding --replay input.json'); options.transcript = JSON.parse(await readFile(resolve(options.transcript), 'utf8')); }
  if (!['virtual', 'real'].includes(options.clock) || !['native', 'process'].includes(options.isolation)) throw Error('Replay has unsupported clock or isolation mode');
  const base = resolve(options.report || 'work/conversation-simulator/runs');
  const directory = join(base, new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8));
  await mkdir(directory, { recursive: true });
  const controller = new AbortController();
  const stop = () => controller.abort(Error('User stopped the simulation'));
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const start = performance.now(), reports = []; let exploration;
  try {
    if (options['self-test']) reports.push({ ...await runControls(join(directory, 'negative-controls')), reportPath: 'negative-controls/report.html' });
    else if (options.explore) {
      const cases = generateCases({ seed: Number(options.seed ?? 1), count: Number(options.cases ?? 12), maxSteps: Number(options['max-steps'] ?? 12) });
      if (!cases.length) throw Error('Exploration requires at least one case');
      const pending = new Set(); let attempt = 0;
      const execute = (caseValue, { signal }) => {
        let definition; try { definition = createGeneratedDefinition(caseValue); } catch (error) { return Promise.resolve({ status: 'invalid', error }); }
        const caseDirectory = 'case-' + (++attempt);
        const work = runScenario(definition, { directory: join(directory, caseDirectory), clock: options.clock, isolation: options.isolation, ui: options.ui, signal,
          onProgress: message => console.log(message) }).then(report => { report.reportPath = caseDirectory + '/report.html'; reports.push(report); return { status: report.status, error: report.error, report }; });
        pending.add(work); work.finally(() => pending.delete(work)).catch(() => {}); return work;
      };
      exploration = await exploreCases(cases, execute, { deadlineMs: Number(options['budget-ms'] ?? 120000), signal: controller.signal });
      await Promise.allSettled([...pending]);
      if (options.minimize) {
        const failed = exploration.results.find(result => result.status === 'fail');
        if (failed) exploration.minimized = await minimizeFailure(failed.caseValue, execute, { maxRuns: 16, deadlineMs: Number(options['budget-ms'] ?? 120000), signal: controller.signal });
        await Promise.allSettled([...pending]);
      }
    }
    else for (const id of options.all ? SCENARIOS.map(item => item.id) : [options.scenario || 'full-lifecycle']) {
      if (controller.signal.aborted) break;
      const scenarioDirectory = 'scenario-' + reports.length;
      reports.push({ ...await runScenario(options.generatedCase ? createGeneratedDefinition(options.generatedCase) : id, { directory: join(directory, scenarioDirectory), parameters: options.parameters, clock: options.clock, isolation: options.isolation,
        ui: options.ui, signal: controller.signal, transcript: options.transcript, recording: options.transcript ? options.recording : undefined, onProgress: message => console.log(message) }), reportPath: scenarioDirectory + '/report.html' });
    }
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  const report = { kind: 'simulation-suite', status: suiteStatus(reports, { aborted: controller.signal.aborted, exploration }),
    elapsedMs: performance.now() - start, results: reports, ...(exploration ? { exploration } : {}) };
  await writeReport(report, directory); console.log('报告：' + join(directory, 'report.html'));
  return report.status === 'pass' ? 0 : report.status === 'incomplete' ? 2 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
