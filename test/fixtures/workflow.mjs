import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
const resolvers = ['@deepseek-ai/dsh-session-persistence-jsonl', '@deepseek-ai/dsh-workflow', '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-jobs']
  .map(name => createRequire(import.meta.resolve(name)));
export async function loadWorkflowFactory(name) {
const { createModule } = await import(new URL(`../../lib/host/${name}.factory.mjs`, import.meta.url));
const entry = await readFile(new URL(`../../lib/host/${name}.mjs`, import.meta.url), 'utf8');
const dependencies = JSON.parse(entry.match(/createModule, (\[.*\]), config/)[1]);
const modules = new Map(await Promise.all(dependencies.map(async name => {
  try { return [name, await import(name)]; } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    for (const resolve of resolvers) {
      let path; try { path = resolve.resolve(name); } catch { continue; }
      return [name, await import(pathToFileURL(path).href)];
    }
    throw error;
  }
})));
return createModule(name => name === '@deepseek-ai/schemastery' || name === 'koffi'
  ? modules.get(name).default : { ...modules.get(name), __esModule: true });
}
export const workflow = await loadWorkflowFactory('workflow-ptc');
