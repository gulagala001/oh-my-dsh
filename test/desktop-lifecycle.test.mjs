import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../src/client/desktop-lifecycle.mjs', import.meta.url), 'utf8')).replace('export function', 'function');

test('desktop changes require one persistent restart notice, including enabled-to-enabled updates', () => {
  for (const [boot, current] of [[undefined, 'new'], ['old', undefined], ['old', 'new']]) {
    let listener, dispose, syncing = true;
    const nodes = [], row = rev => rev === undefined ? [] : [{ id: 'trisoul_x', rev }];
    const root = { effect(fn) { dispose = fn(); } };
    const modules = { manifest: { modules: row(current) }, entries: { state: {
      getSnapshot: () => ({ syncing }), subscribe(fn) { listener = fn; return () => { listener = undefined; }; },
    } } };
    const context = vm.createContext({ window: { location: { protocol: 'dsh-app:' }, __DSH_BOOT__: { entries: row(boot) } },
      document: { body: { append(node) { nodes.push(node); } }, createElement: () => ({ dataset: {}, style: {}, setAttribute() {}, remove() { nodes.splice(nodes.indexOf(this), 1); } }) },
    });
    vm.runInContext(source, context);
    context.installDesktopLifecycle({ root, modules });
    assert.equal(nodes.length, 0, 'wait for graph synchronization');
    syncing = false; listener(); listener();
    assert.equal(nodes.length, 1);
    assert.match(nodes[0].textContent, /重启应用与 Host/);
    context.installDesktopLifecycle({ root, modules });
    assert.equal(nodes.length, 1, 'hot replacement does not duplicate the root notice');
    modules.manifest.modules = row(boot); listener();
    assert.equal(nodes.length, 1, 'returning to the boot graph does not erase a restart already required');
    dispose(); assert.equal(nodes.length, 0); assert.equal(listener, undefined);
  }
});

test('unchanged desktop boot and Web do not request a restart', () => {
  for (const protocol of ['dsh-app:', 'https:']) {
    const row = { id: 'trisoul_x', rev: 'same' };
    const context = vm.createContext({ window: { location: { protocol }, __DSH_BOOT__: { entries: [row] } }, document: { createElement() { assert.fail('unexpected restart notice'); } } });
    vm.runInContext(source, context);
    context.installDesktopLifecycle({ root: { effect(fn) { fn()(); } }, modules: { manifest: { modules: [row] }, entries: { state: { getSnapshot: () => ({ syncing: false }), subscribe: () => () => {} } } } });
  }
});
