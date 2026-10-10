import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { until } from './frontend.mjs';
import { startFixture } from './computer-use/server.mjs';

export const workbenchSections = {
  任务: { section: 'tasks', kind: 'trisoul-x-context', title: '任务与验证' },
  上下文: { section: 'context', kind: 'trisoul-x-pipeline', title: '上下文' },
  记忆: { section: 'memory', kind: 'trisoul-x-memory', title: '记忆 · Dream' },
  监控: { section: 'monitor', kind: 'trisoul-x-monitor', title: '监控' },
};

export const nativeGuide = page => page.locator('[data-sidebar-right-guide]:visible');
export const nativeTabs = page => page.locator('[data-sidebar-right-panel] [role="tab"]').filter({ has: page.locator('[data-sidebar-right-tab]') });
export const workbenchPage = (page, name) => page.locator(`.tx-workbench[data-section="${workbenchSections[name].section}"]`);
export const browserAddress = page => page.getByRole('textbox', { name: '输入 HTTP(S) 地址', exact: true });
export async function nativeTab(page, name) {
  if (workbenchSections[name]) {
    const pageBody = workbenchPage(page, name);
    if (await pageBody.count()) {
      const id = await pageBody.evaluate(el => el.closest('[data-sidebar-right-tab]')?.dataset.sidebarRightTab);
      if (id) return nativeTabs(page).filter({ has: page.locator(`[data-sidebar-right-tab="${id}"]`) });
    }
  }
  return nativeTabs(page).filter({ hasText: workbenchSections[name]?.title || name });
}

export async function openNativeGuide(page) {
  const panel = page.locator('[data-sidebar-right-panel][data-sidebar-right-open]');
  if (!await panel.count()) await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  else if (!await nativeGuide(page).count()) await panel.getByRole('button', { name: '新标签页', exact: true }).click();
  await nativeGuide(page).waitFor();
  return nativeGuide(page);
}

// Exercise the actual host guide and tab strip; business tests need no knowledge
// of an OMD navigation implementation or private sidebar controller.
export async function openWorkbench(page, name = '任务') {
  const destination = workbenchSections[name];
  if (!destination) throw Error('Unknown workbench destination: ' + name);
  if (!await page.locator('[data-sidebar-right-panel][data-sidebar-right-open]').count())
    await page.getByRole('button', { name: '打开工作台', exact: true }).click();
  const existing = await nativeTab(page, name);
  if (await existing.count()) await existing.click();
  else {
    const guide = await openNativeGuide(page);
    await guide.locator(`[data-sidebar-right-guide-entry="${destination.kind}"]`).click();
  }
  const pane = workbenchPage(page, name);
  await pane.waitFor({ state: 'visible' });
  await until(async () => (await pane.boundingBox())?.width > 0);
  return pane;
}


// Real local target creation through the installed OMD tool loop. This supports
// integration checks that need CU content without reviving its retired empty page.
export async function prepareComputerTarget(t, f, fixture) {
  if (!fixture) { fixture = await startFixture(); t.after(() => fixture.close()); }
  let sent = false;
  f.replyWith(payload => {
    if (sent) return { delta: { role: 'assistant', content: '真实工作台目标已准备。' }, finish_reason: 'stop' };
    if (!payload.tools.some(tool => tool.function.name === 'computer_use')) throw Error('The actual OMD computer_use tool is unavailable');
    sent = true;
    const args = { title: '准备工作台真实目标', code: `var workbenchTarget = await cua.createBrowserTab('browser', ${JSON.stringify(fixture.url)}); await workbenchTarget.getAXStateAndScreenshot();` };
    return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'workbench-target', type: 'function', function: { name: 'computer_use', arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' };
  });
  await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: '准备工作台真实目标' }] });
  await f.page.getByText('真实工作台目标已准备。', { exact: true }).waitFor({ timeout: 45000 });
  const endpoint = new URL('/trisoul-x/computer-use/state?session=' + f.sessionId, f.page.url()).href;
  return until(async () => {
    const state = await (await f.page.request.get(endpoint)).json();
    return state.target?.kind === 'tab' && state.previewAt && state;
  });
}

// An independently installed provider proves the shipped guide's extension seam
// survives OMD. Its test-only buttons use the same public API as plugin links.
export async function workbenchProvider(t) {
  const root = await mkdtemp(join(tmpdir(), 'omd-workbench-provider-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = 'omd-workbench-provider';
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: id, version: '1.0.0', type: 'module', exports: { '.': './index.mjs', './client': './client.js' },
    dsh: { bundle: { patch: ['./cordis.patch.yml'] }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-sidebar-right'] } } }));
  await writeFile(join(root, 'cordis.patch.yml'), `- insert:\n    - id: ${id}\n      name: ${id}\n`);
  await writeFile(join(root, 'index.mjs'), 'export function apply() {}\n');
  await writeFile(join(root, 'client.js'), `window.__ModuleLoader__.load({id:${JSON.stringify(id)},factory:require=>{
    const React=require('react');
    return {inject:['slots','sidebarRightTabs','sidebarRight'],apply(ctx){
      ctx.effect(()=>ctx.sidebarRightTabs.register({id:'${id}/page',kind:'fixture-provider',title:()=> '第三方原生页',guide:[{id:'fixture-provider-guide',order:50,title:()=> '第三方原生页'}]}));
      ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:'${id}/page'},()=>React.createElement('div',{'data-fixture-provider':''},
        React.createElement('p',null,'第三方页面保留'),
        ...['tasks','context','memory','computer','monitor'].map(section=>React.createElement('button',{key:section,type:'button',onClick:()=>ctx.sidebarRight.openTab('trisoul-x-workbench',{params:{section}})},'旧工作台 '+section)),
        React.createElement('button',{type:'button',onClick:()=>ctx.sidebarRight.openTab('trisoul-x-context')},'旧任务链接'))));
    }};
  }});`);
  return 'file:' + root;
}
