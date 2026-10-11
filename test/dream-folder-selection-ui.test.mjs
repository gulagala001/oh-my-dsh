import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { openWorkbench } from './fixtures/workbench.mjs';

const preparedSummary = '文件夹选择的合成会话已完成原生回复。';
const tool = (name, args) => ({
  delta: { role: 'assistant', tool_calls: [{ index: 0, id: crypto.randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
  finish_reason: 'tool_calls', usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
});

function dreamInput(payload) {
  for (const message of payload.messages.filter(item => item.role === 'user').reverse()) {
    const text = typeof message.content === 'string' ? message.content : (message.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n');
    try {
      const input = JSON.parse(text);
      if (['session', 'project', 'global'].includes(input.kind) && Array.isArray(input.sources)) return input;
    } catch {}
  }
  throw Error('Native Dream request did not contain its source input');
}

test('real Dream folder selections match nested groups, preserve pending edits and keep the narrow conversation usable', { timeout: 120000 }, async t => {
  let workspacePath, parentPath, deepPath, releaseSave;
  const dreamInputs = [];
  t.after(() => releaseSave?.());
  const f = await frontendFixture(t, {
    omdConfig: { memoryScope: 'project', dreamAutoEnabled: false, dreamProvider: 'fixture', dreamModel: 'fixture',
      computerUseEnabled: false, codegraphEnabled: false, keepTailEvents: 0, automaticReplace: false },
    async setupWorkspace({ workspace }) {
      workspacePath = await realpath(workspace);
      parentPath = join(workspacePath, 'folder-parent');
      deepPath = join(parentPath, 'folder-deep');
      // Only explicit synthetic directories are seeded. Workspace and Session
      // records below are created by the actual host's public RPC methods.
      await mkdir(join(parentPath, '.git'), { recursive: true });
      await mkdir(join(deepPath, '.git'), { recursive: true });
    },
    modelReply(payload) {
      const names = (payload.tools || []).map(item => item.function.name);
      if (names.includes('prepare_segment')) return tool('prepare_segment', { summary: preparedSummary, documents: [], decisions: [] });
      if (names.includes('submit_context_choices')) return tool('submit_context_choices', { choices: [] });
      if (names.includes('save_memory')) {
        const input = dreamInput(payload); dreamInputs.push(input);
        return tool('save_memory', { summary: `${input.kind}：${input.target}`, references: input.sources.map(item => item.id) });
      }
      if (names.length) return { delta: { role: 'assistant', content: preparedSummary }, finish_reason: 'stop' };
    },
  });
  const { page, rpc } = f;
  const api = async (path, body) => {
    const endpoint = new URL('/trisoul-x/api' + path, page.url()).href;
    const response = body === undefined ? await page.request.get(endpoint) : await page.request.post(endpoint, { data: body });
    assert.equal(response.ok(), true, `${path}: ${await response.text()}`);
    return response.json();
  };
  const createSession = async (path, prompt) => {
    const registered = await rpc('workspace/create', { path });
    assert.equal(registered.workspace.path, path);
    const created = await rpc('session/create', { workspaceId: registered.workspace.workspaceId, agentPreset: 'trisoul-x' });
    await rpc('session/selectModel', { sessionId: created.sessionId, provider: 'fixture', model: 'fixture' });
    await rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: created.sessionId, mode: 'queue', content: [{ type: 'text', text: prompt }] });
    await until(async () => (await api('/state?session=' + created.sessionId)).running === 'idle');
    return created.sessionId;
  };
  const parentSession = await createSession(parentPath, 'DREAM_FOLDER_PARENT_SYNTHETIC');
  const deepSession = await createSession(deepPath, 'DREAM_FOLDER_DEEP_SYNTHETIC');
  for (const sessionId of [f.sessionId, parentSession, deepSession]) {
    await api('/context/prepare?session=' + sessionId, {});
    await until(async () => (await api('/context?session=' + sessionId)).records.some(record => record.summary === preparedSummary));
  }
  await api('/dream/refresh', {});
  const status = await api('/dream?session=' + f.sessionId);
  assert.equal(status.session.shared, true);
  assert.deepEqual(status.settings.dreamProjects, []);
  assert.equal(status.folders.length, 2);
  assert.deepEqual(status.folders.find(item => item.folder === workspacePath)?.projects, [workspacePath, parentPath].sort());
  assert.deepEqual(status.folders.find(item => item.folder === parentPath)?.projects, [deepPath]);

  await openWorkbench(page, '记忆');
  const panel = page.locator('.cx-dream');
  const settingsRead = page.waitForResponse(response => new URL(response.url()).pathname === '/trisoul-x/api/dream/settings' && response.request().method() === 'GET');
  const directoryRead = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/trisoul-x/api/state' && !url.searchParams.has('session') && response.request().method() === 'GET';
  });
  await panel.getByRole('button', { name: '自动整理设置', exact: true }).click();
  for (const response of await Promise.all([settingsRead, directoryRead]))
    assert.equal(response.ok(), true, `Opening real Dream settings failed at ${new URL(response.url()).pathname}: ${await response.text()}`);
  const folders = panel.getByRole('group', { name: '整理的文件夹', exact: true });
  const parent = folders.getByRole('checkbox', { name: '整理文件夹 ' + parentPath, exact: true });
  const workspace = folders.getByRole('checkbox', { name: '整理文件夹 ' + workspacePath, exact: true });
  const save = panel.getByRole('button', { name: '保存自动 Dream 设置', exact: true });
  await parent.waitFor();
  assert.equal(await parent.isChecked(), false);
  assert.equal(await workspace.isChecked(), false);
  assert.equal(await save.isDisabled(), true, 'an unchanged folder array must not dirty the form');
  assert.match(await parent.locator('..').innerText(), /1 个项目/);
  assert.match(await workspace.locator('..').innerText(), /2 个项目/);

  const submitted = [];
  await page.route('**/trisoul-x/api/dream/settings?*', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted.push(route.request().postDataJSON());
    // Fetch the real mutation and retain its real response. Delaying delivery
    // tests the edit race without inventing settings, folders or job results.
    const response = await route.fetch();
    if (submitted.length === 1) await new Promise(resolve => { releaseSave = resolve; });
    await route.fulfill({ response });
  });
  await parent.check();
  await save.click(); await until(() => releaseSave);
  await workspace.check();
  const composer = page.locator('[data-composer-input]');
  const draft = '保存文件夹设置期间继续输入对话草稿';
  await composer.fill(draft);
  releaseSave(); releaseSave = null;
  await panel.getByText('自动 Dream 设置已保存。', { exact: true }).waitFor();
  assert.equal(await parent.isChecked(), true);
  assert.equal(await workspace.isChecked(), true, 'an edit made during save must survive the earlier response');
  assert.equal(await save.isEnabled(), true);
  assert.equal(await composer.innerText(), draft);
  assert.equal(await composer.evaluate(element => element.contains(document.activeElement)), true, 'saving must not steal focus from the conversation');
  assert.deepEqual(submitted, [{ dreamProjects: [parentPath] }]);
  assert.deepEqual((await api('/dream/settings')).dreamProjects, [parentPath], 'unsaved checkbox edits must not expand the actual job scope');

  const runGlobal = async () => {
    const response = page.waitForResponse(value => new URL(value.url()).pathname === '/trisoul-x/api/dream/run' && value.request().method() === 'POST');
    await panel.getByRole('button', { name: '整理全局', exact: true }).click();
    const accepted = await response;
    assert.equal(accepted.status(), 202);
    const job = await accepted.json();
    return until(async () => {
      const current = (await api('/dream')).jobs.find(item => item.id === job.id);
      if (current?.state === 'failed' || current?.state === 'budget') throw Error(current.error || current.state);
      return current?.state === 'complete' ? current : null;
    });
  };
  const selectedStart = dreamInputs.length;
  const selected = await runGlobal();
  assert.equal(selected.total, 3, 'one displayed project means one session, one project and the global target');
  assert.equal(selected.done, selected.total);
  assert.deepEqual(dreamInputs.slice(selectedStart).filter(input => input.kind === 'session').map(input => input.target), [deepSession]);
  assert.equal((await api('/dream?session=' + parentSession)).sessionMemory, null, 'the selected folder must not also admit its own project from another group');
  assert.equal((await api('/dream?session=' + f.sessionId)).sessionMemory, null);
  const deepMemory = (await api('/dream?session=' + deepSession)).sessionMemory;
  assert.ok(deepMemory);

  const saveFolders = async expected => {
    const mutation = page.waitForResponse(response => new URL(response.url()).pathname === '/trisoul-x/api/dream/settings' && response.request().method() === 'POST');
    await save.click();
    const response = await mutation;
    assert.equal(response.ok(), true, await response.text());
    assert.deepEqual((await response.json()).dreamProjects, expected);
    await panel.getByText('自动 Dream 设置已保存。', { exact: true }).waitFor();
    // Disabled also means a save is still pending. Its real response and the
    // success notice must arrive before treating a disabled button as clean.
    await until(() => save.isDisabled());
    assert.deepEqual((await api('/dream/settings')).dreamProjects, expected);
  };
  await saveFolders([parentPath, workspacePath]);
  await panel.getByRole('button', { name: '清空', exact: true }).click();
  assert.equal(await parent.isChecked(), false);
  assert.equal(await workspace.isChecked(), false);
  await saveFolders([]);
  assert.deepEqual(submitted, [{ dreamProjects: [parentPath] }, { dreamProjects: [parentPath, workspacePath] }, { dreamProjects: [] }]);
  const displayedProjects = (await api('/dream/settings')).folders.flatMap(folder => folder.projects);
  assert.equal(new Set(displayedProjects).size, displayedProjects.length, 'displayed folder groups must cover each project once');
  const sharedSessions = new Set();
  for (const project of displayedProjects) {
    let cursor;
    const cursors = new Set(), entries = new Set();
    do {
      const query = new URLSearchParams({ kind: 'session', project, ...(cursor ? { cursor } : {}) });
      const directory = await api('/dream/catalog?' + query);
      for (const entry of directory.entries) {
        assert.equal(entry.project, project, 'the public session directory must stay inside the requested project');
        assert.equal(entries.has(entry.id), false, 'directory pagination must not repeat a session');
        entries.add(entry.id);
        if (entry.shared) {
          assert.equal(sharedSessions.has(entry.id), false, 'a shared session must belong to one displayed project');
          sharedSessions.add(entry.id);
        }
      }
      cursor = directory.nextCursor;
      if (cursor) {
        assert.equal(cursors.has(cursor), false, 'directory pagination must advance to its final page');
        cursors.add(cursor);
      }
    } while (cursor);
  }
  for (const sessionId of [f.sessionId, parentSession, deepSession]) assert.ok(sharedSessions.has(sessionId));
  const allStart = dreamInputs.length;
  const all = await runGlobal();
  assert.equal(all.total, sharedSessions.size + displayedProjects.length + 1, 'empty selection covers the complete public shared directories, all displayed projects and the global target');
  assert.equal(all.done, all.total);
  assert.deepEqual(dreamInputs.slice(allStart).filter(input => input.kind === 'session').map(input => input.target).sort(), [f.sessionId, parentSession].sort());
  assert.ok((await api('/dream?session=' + parentSession)).sessionMemory);
  assert.ok((await api('/dream?session=' + f.sessionId)).sessionMemory);
  assert.equal((await api('/dream?session=' + deepSession)).sessionMemory.revision, deepMemory.revision, 'unchanged admitted material must not be regenerated');

  await page.setViewportSize({ width: 1100, height: 900 });
  const handle = await page.locator('[data-side="rightbar"]').boundingBox();
  assert.ok(handle);
  await page.mouse.move(handle.x + handle.width / 2, 240); await page.mouse.down();
  await page.mouse.move(780, 240, { steps: 8 }); await page.mouse.up();
  await until(async () => Math.abs((await panel.boundingBox()).width - 320) < 2);
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    assert.equal(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, colorScheme + ' folders must fit the narrow panel');
    assert.equal(await folders.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
    await composer.fill(draft + ' · ' + colorScheme);
    assert.equal(await composer.innerText(), draft + ' · ' + colorScheme);
    assert.equal(await composer.evaluate(element => element.contains(document.activeElement)), true);
    assert.equal(await save.isDisabled(), true);
    if (process.env.TRISOUL_UI_ARTIFACTS) {
      await mkdir(process.env.TRISOUL_UI_ARTIFACTS, { recursive: true });
      await page.screenshot({ path: join(process.env.TRISOUL_UI_ARTIFACTS, `dream-folder-selection-${colorScheme}.png`) });
    }
  }
  assert.deepEqual(f.errors, []);
});
