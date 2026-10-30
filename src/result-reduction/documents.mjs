import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';

const formats = new Set(['pdf', 'docx', 'xlsx', 'csv', 'tsv']);
const MAX_BYTES = 32 * 1024 * 1024;
export const documentFormat = path => formats.has(extname(path).slice(1).toLowerCase()) ? extname(path).slice(1).toLowerCase() : null;

// A bounded, disposable parser realm. It receives approved bytes, never a path
// or credentials; cancellation cannot leave a busy parser on the host thread.
export async function decodeDocument(bytes, format, signal) {
  signal?.throwIfAborted();
  const worker = new Worker(new URL('../compute-worker.mjs', import.meta.url), {
    execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 384 },
  });
  let abort, timer;
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      timer = setTimeout(() => reject(Error('文档解析超时；未返回不完整结果')), 30_000);
      worker.on('error', reject);
      worker.on('exit', code => reject(Error(`文档解析进程退出（${code}）`)));
      worker.on('message', reply => reply.error ? reject(Error(reply.error.message)) : resolve(reply.value));
      worker.postMessage({ id: 1, operation: 'document', input: { bytes, format } });
    });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort); await worker.terminate();
  }
}

export async function documentSource(ctx, exec, path, view) {
  const format = documentFormat(path);
  if (!format || view === 'raw' && ['csv', 'tsv'].includes(format)) return null;
  if (!ctx.tools.get('read', exec.agent)) throw Error('当前会话没有文件读取工具');
  const fs = ctx.get('fs');
  if (!fs?.readBytes) throw Error('当前文件后端不支持文档字节读取');
  const cwd = await ctx.get('workingDirectory')?.ensure(exec.agent, exec.signal);
  const target = await fs.resolve(path, { cwd, signal: exec.signal });
  const before = await fs.stat(target, exec.signal);
  if (before?.type !== 'file' || before.size > MAX_BYTES) throw Error('文档读取支持 32 MiB 内的常规文件');
  // Same scoped provider as native read; never use host fs or a shell fallback.
  const bytes = await fs.readBytes(target, exec.signal, MAX_BYTES);
  exec.signal.throwIfAborted();
  if (bytes.length > MAX_BYTES) throw Error('文档超过 32 MiB');
  const after = await fs.stat(target, exec.signal);
  if (after?.type !== 'file' || before.version !== after.version) throw Error('文档在读取期间变化，请重新读取');
  const sourceHash = createHash('sha256').update(bytes).digest('hex');
  const parsed = await decodeDocument(bytes, format, exec.signal);
  parsed.data.sourceHash = sourceHash;
  return { text: JSON.stringify(parsed.data, null, 2), source: fs.processPath(target), complete: false,
    article: parsed.text, outline: parsed.outline,
    document: { format, sourceHash, representation: 'extracted', coverage: parsed.data.coverage, warnings: parsed.data.warnings } };
}
