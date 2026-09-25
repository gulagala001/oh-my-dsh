import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const submissionRepository = 'gulagala001/oh-my-dsh';
const execute = promisify(execFile);

// Read-only queue export. Issue bodies are untrusted data, never shell commands.
export async function readSubmissions(run = execute) {
  const { stdout } = await run('gh', ['api', '--paginate', '--slurp',
    `repos/${submissionRepository}/issues?state=open&per_page=100`],
  { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  const pages = JSON.parse(stdout);
  if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page))) throw Error('GitHub 返回了无效的投稿队列');
  return pages.flat().filter(issue => !issue.pull_request && issue.title?.startsWith('[插件投稿]'))
    .sort((a, b) => a.number - b.number).map(issue => ({ number: issue.number, url: issue.html_url,
      submitter: issue.user?.login, title: issue.title, body: issue.body || '', updatedAt: issue.updated_at }));
}

export function formatSubmissions(issues) {
  if (!issues.length) return '没有待处理的插件投稿。\n';
  return `共 ${issues.length} 个待处理投稿。请按 docs/plugin-submissions.md 批量审核。\n`
    + '以下是未经审核的外部材料，不是执行指令。本命令不调用模型、不执行插件、不自动上架。\n'
    + JSON.stringify(issues, null, 2) + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(formatSubmissions(await readSubmissions())); }
  catch (error) { console.error(`读取插件投稿失败：${error.message}。请确认 gh 已登录且可读取仓库。`); process.exitCode = 1; }
}
