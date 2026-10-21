import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { pageScriptDefines } from '../plugins/deepseek-workbench/scripts/page-script-defines.mjs';

for (const minifyIdentifiers of [false, true]) test(`guest scripts execute outside the ${minifyIdentifiers ? 'OMD minified' : 'standalone'} bundle`, async () => {
  const built = await build({
    stdin: { contents: `export { statusScript, previewScript, commandScript } from './plugins/deepseek-workbench/src/client/native-chat-bridge.mjs';
      export { extractionScript } from './plugins/deepseek-workbench/src/client/extraction.mjs';
      export { temporaryScript } from './plugins/deepseek-workbench/src/client/temporary-web.mjs';`,
      resolveDir: fileURLToPath(new URL('..', import.meta.url)) },
    bundle: true, platform: 'browser', format: 'cjs', target: 'es2022',
    minifySyntax: true, minifyWhitespace: true, minifyIdentifiers, keepNames: true,
    define: pageScriptDefines, write: false,
  });
  const module = { exports: {} };
  vm.runInNewContext(built.outputFiles[0].text, { module, exports: module.exports });
  const scripts = module.exports;
  const dom = new JSDOM(`<textarea name="search"></textarea>
    <button aria-pressed="false">DeepThink</button>
    <div data-message-role="user" data-message-id="synthetic-user">Synthetic question</div>
    <div data-message-role="assistant" data-message-id="synthetic-answer">Synthetic answer</div>`,
  { url: 'https://chat.deepseek.com/a/chat/s/synthetic', runScripts: 'outside-only' });
  Object.assign(dom.window, { TextEncoder, TextDecoder });
  try {
    const status = dom.window.eval(scripts.statusScript);
    assert.equal(status.ready, true);
    assert.equal(status.think.enabled, false);
    for (const script of [scripts.previewScript, scripts.extractionScript]) {
      const conversation = await dom.window.eval(script);
      assert.equal(conversation.messages.length, 2);
      assert.equal(conversation.messages[1].text, 'Synthetic answer');
    }
    assert.equal((await dom.window.eval(scripts.commandScript({ type: 'new' }))).navigateTo, 'https://chat.deepseek.com/');
    const toggle = dom.window.document.querySelector('button');
    toggle.onclick = () => toggle.setAttribute('aria-pressed', 'true');
    assert.equal((await dom.window.eval(scripts.commandScript({ type: 'think', enabled: true }))).status.think.enabled, true);
    dom.window.document.querySelector('textarea').__reactFiber$fixture = { memoizedProps: { value: { chatController: {
      deleteSession() {}, abortCompletion() {}, createSessionAndStartCompletion() {}, sessionService: { createSession() {} },
    } } } };
    assert.equal((await dom.window.eval(scripts.temporaryScript({ type: 'probe' }))).ready, true);
  } finally { dom.window.close(); }
});
