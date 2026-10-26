import { parentPort } from 'node:worker_threads';
parentPort.on('message', async ({ id, operation, input }) => {
  try {
    let value;
    if (operation === 'ast') {
      const { structuralSearch } = await import('./result-reduction/ast-engine.mjs');
      value = await structuralSearch(input.text, input.language, input.pattern);
    } else if (operation === 'article') {
      const { articleView } = await import('./result-reduction/article.mjs');
      value = await articleView(input.html, input.url);
    } else throw new Error('Unsupported tool computation');
    parentPort.postMessage({ id, value });
  } catch (error) { parentPort.postMessage({ id, error: { name: error?.name ?? 'Error', message: error?.message ?? String(error), ...(error?.code !== undefined ? { code: error.code } : {}) } }); }
});
