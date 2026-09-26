import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { frontendFixture, until } from './fixtures/frontend.mjs';
const exec = promisify(execFile);

test('real DSH preset runs the bundled workflow guest and native child lifecycle with durable results', { timeout: 180000 }, async t => {
  const seen = [], returns = []; let issued = false;
  const fx = await frontendFixture(t, { headless: true, modelReply(payload) {
    if (!payload.tools?.length) return;
    const text = payload.messages.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
    if (text.includes('OMD_WORKFLOW_CHILD_ALPHA') || text.includes('OMD_WORKFLOW_CHILD_BETA')) {
      const value = text.includes('OMD_WORKFLOW_CHILD_ALPHA') ? 'alpha' : 'beta'; seen.push(value);
      return { delta: { role: 'assistant', content: value }, finish_reason: 'stop' };
    }
    if (!issued) {
      issued = true;
      return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'workflow-integration-call', type: 'function', function: { name: 'workflow', arguments: JSON.stringify({
        meta: { name: 'integration', description: 'Test native child composition' },
        script: `return await parallel([() => agent('OMD_WORKFLOW_CHILD_ALPHA'), () => agent('OMD_WORKFLOW_CHILD_BETA')])`,
      }) } }] }, finish_reason: 'tool_calls' };
    }
    returns.push(...payload.messages.filter(m => m.role === 'tool').map(m => m.content));
    return { delta: { role: 'assistant', content: 'Workflow verified.' }, finish_reason: 'stop' };
  } });
  assert.deepEqual(seen.sort(), ['alpha', 'beta'], fx.log());
  assert.match(JSON.stringify(returns), /alpha/); assert.match(JSON.stringify(returns), /beta/);
  assert.doesNotMatch(JSON.stringify(returns), /workflow run failed|Unresolved host dependency|matching DSH component is missing/);
  const root = join(fx.home, 'trisoul-x', 'workflows'), scopes = await readdir(root);
  assert.equal(scopes.length, 1);
  const runs = await readdir(join(root, scopes[0])); assert.equal(runs.length, 1);
  const journal = (await readFile(join(root, scopes[0], runs[0], 'journal.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(journal.filter(row => row.type === 'result' && row.result.stopReason === 'completed').length, 2);
  assert.equal(journal.at(-1).outcome, 'completed');
});

test('real workflow tool saves inline scripts, nests named workflows, and resumes only unchanged calls', { timeout: 180000 }, async t => {
  let phase = 0, firstRun, nestedPath; const seen = [], returned = [];
  const tool = args => ({ delta: { role: 'assistant', tool_calls: [{ index: 0, id: `resume-${phase}`, type: 'function', function: { name: 'workflow', arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' });
  const fx = await frontendFixture(t, { headless: true,
    async setupWorkspace({ workspace }) {
      const dir = join(workspace, '.omd', 'workflows'); await mkdir(dir, { recursive: true }); nestedPath = join(dir, 'nested.js');
      await writeFile(nestedPath, `export const meta = {name:'nested',description:'Named workflow fixture'};\nreturn await pipeline(args, item => agent('OMD_RESUME_CHILD_' + item));`);
    },
    async modelReply(payload) {
      if (!payload.tools?.length) return;
      const user = JSON.stringify(payload.messages.filter(m => m.role === 'user'));
      if (user.includes('OMD_RESUME_CHILD_')) {
        const value = user.match(/OMD_RESUME_CHILD_([a-zA-Z]+)/)?.[1]; seen.push(value);
        return { delta: { role: 'assistant', content: value }, finish_reason: 'stop' };
      }
      if (phase === 0) {
        phase++;
        return tool({ script: `export const meta = {name:'resume-fixture',description:'Inline and nested workflow'}; return await workflow('nested', args);`, args: ['red','blue'] });
      }
      const result = String(payload.messages.filter(m => m.role === 'tool').at(-1)?.content ?? ''); returned.push(result);
      if (phase === 1) {
        firstRun = { runId: result.match(/Run ID: (\S+)/)?.[1], scriptPath: result.match(/Script: ([^\n]+)/)?.[1] };
        if (!firstRun.runId || !firstRun.scriptPath) return { delta: { role: 'assistant', content: 'Missing saved run.' }, finish_reason: 'stop' };
        phase++; return tool({ scriptPath: firstRun.scriptPath, resumeFromRunId: firstRun.runId, args: ['red','blue'] });
      }
      if (phase === 2) {
        await writeFile(nestedPath, `export const meta = {name:'nested',description:'Named workflow fixture'};\nreturn await pipeline(args, item => agent('OMD_RESUME_CHILD_' + (item === 'red' ? 'RED' : item)));`);
        phase++; return tool({ scriptPath: firstRun.scriptPath, resumeFromRunId: firstRun.runId, args: ['red','blue'] });
      }
      return { delta: { role: 'assistant', content: 'Resume verified.' }, finish_reason: 'stop' };
    },
  });
  assert.equal(phase, 3, JSON.stringify(returned) + '\n' + fx.log());
  assert.deepEqual(seen.sort(), ['RED','blue','blue','red']);
  assert.ok(returned.every(result => result.includes('completed')), JSON.stringify(returned));
  assert.match(await readFile(firstRun.scriptPath, 'utf8'), /^export const meta =/);
});

test('background workflow exposes an existing script and delivers its result through native Jobs', { timeout: 180000 }, async t => {
  let phase = 0, savedPath, jobId; const returned = [];
  const call = (name, args) => ({ delta: { role: 'assistant', tool_calls: [{ index: 0, id: `background-${phase}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' });
  const fx = await frontendFixture(t, { headless: true, async modelReply(payload) {
    if (!payload.tools?.length) return;
    if (payload.messages.some(m => m.role === 'user' && (typeof m.content === 'string' ? m.content : m.content?.map(b => b.text ?? '').join('\n')).trim() === 'OMD_BACKGROUND_CHILD')) return { delta: { role: 'assistant', content: 'background value' }, finish_reason: 'stop' };
    if (phase === 0) { phase++; return call('workflow', { script: `export const meta = {name:'background-fixture',description:'Native Jobs integration'}; return await agent('OMD_BACKGROUND_CHILD');`, run_in_background: true }); }
    const text = String(payload.messages.filter(m => m.role === 'tool').at(-1)?.content ?? ''); returned.push(text);
    if (phase === 1) {
      jobId = text.match(/background as job ([^.\s]+)/)?.[1]; savedPath = text.match(/Script: ([^\n]+)/)?.[1];
      if (!jobId || !savedPath) return { delta: { role: 'assistant', content: 'Missing background handle.' }, finish_reason: 'stop' };
      await stat(savedPath); phase++; return call('job_output', { job_id: jobId, wait: true });
    }
    return { delta: { role: 'assistant', content: 'Background verified.' }, finish_reason: 'stop' };
  } });
  assert.equal(phase, 2, JSON.stringify(returned) + '\n' + fx.log());
  await until(() => returned.some(text => text.includes('background value') && text.includes('completed')), 20000).catch(async error => {
    const journal = savedPath ? await readFile(join(savedPath, '..', 'journal.jsonl'), 'utf8').catch(() => null) : null;
    throw new Error(error.message + '\n' + JSON.stringify({ phase, returned, journal }));
  });
  assert.ok(returned.some(text => text.includes('background value') && text.includes('completed')), JSON.stringify(returned));
  assert.match(await readFile(savedPath, 'utf8'), /OMD_BACKGROUND_CHILD/);
});

test('explicit output budget counts native main and child usage before further workflow dispatch', { timeout: 180000 }, async t => {
  let issued = false, children = 0; const returned = [];
  const usage = tokens => ({ prompt_tokens: 2, completion_tokens: tokens, total_tokens: tokens + 2 });
  const fx = await frontendFixture(t, { headless: true, initialPrompt: 'Complete the fixture with an output target +6', modelReply(payload) {
    if (!payload.tools?.length) return;
    if (JSON.stringify(payload.messages.filter(m => m.role === 'user')).includes('OMD_BUDGET_CHILD')) {
      children++; return { delta: { role: 'assistant', content: 'child result' }, finish_reason: 'stop', usage: usage(5) };
    }
    if (!issued) {
      issued = true;
      return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'budget-workflow', type: 'function', function: { name: 'workflow', arguments: JSON.stringify({
        script: `export const meta = {name:'budget-fixture',description:'Shared output target'}; await agent('OMD_BUDGET_CHILD'); return await agent('OMD_BUDGET_CHILD_SECOND');`,
      }) } }] }, finish_reason: 'tool_calls', usage: usage(1) };
    }
    returned.push(...payload.messages.filter(m => m.role === 'tool').map(m => m.content));
    return { delta: { role: 'assistant', content: 'Token target verified.' }, finish_reason: 'stop', usage: usage(1) };
  } });
  assert.equal(children, 1, JSON.stringify(returned) + '\n' + fx.log());
  assert.match(JSON.stringify(returned), /token target reached/);
  const state = JSON.parse(await readFile(join(fx.home, 'trisoul-x', 'sessions', fx.sessionId + '.json'), 'utf8'));
  const pool = state.workflowBudget.pools[state.workflowBudget.active];
  assert.equal(pool.total, 6); assert.equal(pool.spent, 7); assert.equal(pool.unmetered, 0);
});

test('native workflow child effort reaches the provider without changing the parent selection', { timeout: 180000 }, async t => {
  let issued = false; const parentEfforts = [], childEfforts = [], returned = [];
  const fx = await frontendFixture(t, { headless: true,
    modelProfile: { reasoningEfforts: { off: null, low: 'low', xhigh: 'xhigh' }, compat: { supportsReasoningEffort: true } },
    modelReply(payload) {
      if (!payload.tools?.length) return;
      const user = JSON.stringify(payload.messages.filter(m => m.role === 'user'));
      if (user.includes('OMD_EFFORT_CHILD')) {
        childEfforts.push(payload.reasoning_effort);
        return { delta: { role: 'assistant', content: 'effort verified' }, finish_reason: 'stop' };
      }
      parentEfforts.push(payload.reasoning_effort);
      if (!issued) {
        issued = true;
        return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'effort-workflow', type: 'function', function: { name: 'workflow', arguments: JSON.stringify({
          script: `export const meta = {name:'effort-fixture',description:'Independent reasoning effort'}; return await parallel([() => agent('OMD_EFFORT_CHILD_HIGH',{effort:'xhigh'}), () => agent('OMD_EFFORT_CHILD_LOW',{effort:'low'})]);`,
        }) } }] }, finish_reason: 'tool_calls' };
      }
      returned.push(...payload.messages.filter(m => m.role === 'tool').map(m => m.content));
      return { delta: { role: 'assistant', content: 'Parent preserved.' }, finish_reason: 'stop' };
    },
  });
  assert.deepEqual(childEfforts.sort(), ['low','xhigh'], JSON.stringify(returned) + '\n' + fx.log());
  assert.ok(parentEfforts.length >= 2); assert.ok(parentEfforts.every(value => value === parentEfforts[0]));
});

test('OMD-PTC invokes the enhanced workflow through its generated SDK', { timeout: 180000 }, async t => {
  let issued = false, children = 0; const returned = [];
  const fx = await frontendFixture(t, { headless: true, agentPreset: 'omd-ptc', modelReply(payload) {
    if (!payload.tools?.length) return;
    if (JSON.stringify(payload.messages.filter(m => m.role === 'user')).includes('OMD_PTC_WORKFLOW_CHILD')) {
      children++; return { delta: { role: 'assistant', content: 'ptc-workflow-value' }, finish_reason: 'stop' };
    }
    if (!issued) {
      issued = true;
      const script = `export const meta = {name:'ptc-workflow',description:'Use the live generated SDK'}; return await agent('OMD_PTC_WORKFLOW_CHILD');`;
      return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'ptc-workflow-call', type: 'function', function: { name: 'run_code', arguments: JSON.stringify({ code: `return await tools.workflow(${JSON.stringify({ script, args: ['value'] })});`, description: 'Run a workflow from PTC' }) } }] }, finish_reason: 'tool_calls' };
    }
    returned.push(...payload.messages.filter(m => m.role === 'tool').map(m => m.content));
    return { delta: { role: 'assistant', content: 'PTC verified.' }, finish_reason: 'stop' };
  } });
  assert.equal(children, 1, JSON.stringify(returned) + '\n' + fx.log());
  assert.match(JSON.stringify(returned), /ptc-workflow-value/); assert.match(JSON.stringify(returned), /scriptPath/);
});

test('real workflow children write only in their worktree and can select a native agent preset', { timeout: 180000 }, async t => {
  let issued = false, childToolIssued = false; const customTools = [], returns = [], childReturns = [];
  const fx = await frontendFixture(t, { headless: true,
    async setupWorkspace({ workspace }) {
      for (const args of [['init','-q'], ['config','user.name','Workflow Fixture'], ['config','user.email','fixture@example.invalid']]) await exec('git', args, { cwd: workspace });
      await writeFile(join(workspace, 'baseline.txt'), 'baseline');
      await exec('git', ['add','.'], { cwd: workspace }); await exec('git', ['commit','-qm','baseline'], { cwd: workspace });
    },
    modelReply(payload) {
      if (!payload.tools?.length) return;
      const user = JSON.stringify(payload.messages.filter(m => m.role === 'user'));
      if (user.includes('OMD_CUSTOM_PRESET_PROBE')) {
        customTools.push(...payload.tools.map(tool => tool.function.name));
        return { delta: { role: 'assistant', content: 'custom type complete' }, finish_reason: 'stop' };
      }
      if (user.includes('OMD_ISOLATED_WRITE_PROBE')) {
        if (!childToolIssued) {
          childToolIssued = true;
          return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'child-write', type: 'function', function: { name: process.platform === 'win32' ? 'pwsh' : 'bash', arguments: JSON.stringify({ description: 'Write an isolated fixture file', command: process.platform === 'win32' ? "Set-Content -Path child-change.txt -Value 'isolated child'" : "printf 'isolated child' > child-change.txt" }) } }] }, finish_reason: 'tool_calls' };
        }
        childReturns.push(...payload.messages.filter(m => m.role === 'tool').map(m => m.content));
        return { delta: { role: 'assistant', content: 'isolated write complete' }, finish_reason: 'stop' };
      }
      if (!issued) {
        issued = true;
        return { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'isolated-workflow', type: 'function', function: { name: 'workflow', arguments: JSON.stringify({
          meta: { name: 'isolation-and-types', description: 'Verify native isolated and custom children' },
          script: `return await parallel([() => agent('OMD_ISOLATED_WRITE_PROBE', {isolation:'worktree'}), () => agent('OMD_CUSTOM_PRESET_PROBE', {agentType:'omd-ptc'})])`,
        }) } }] }, finish_reason: 'tool_calls' };
      }
      returns.push(...payload.messages.filter(m => m.role === 'tool').map(m => m.content));
      return { delta: { role: 'assistant', content: 'Isolation verified.' }, finish_reason: 'stop' };
    },
  });
  assert.equal(childToolIssued, true, fx.log() + '\n' + JSON.stringify(returns));
  assert.ok(customTools.includes('run_code'), JSON.stringify(customTools));
  assert.ok(!customTools.includes('bash'));
  const dir = join(fx.workspace, '.omd', 'worktrees'), receipts = (await readdir(dir)).filter(name => name.endsWith('.json'));
  assert.equal(receipts.length, 1);
  const receipt = JSON.parse(await readFile(join(dir, receipts[0]), 'utf8'));
  assert.equal(receipt.retained, true, JSON.stringify({receipt, childReturns, returns})); assert.match(receipt.reason, /changed/);
  assert.equal((await readFile(join(receipt.cwd, 'child-change.txt'), 'utf8')).trim(), 'isolated child');
  await assert.rejects(stat(join(fx.workspace, 'child-change.txt')), /ENOENT/);
  const states=await Promise.all((await readdir(join(fx.home,'trisoul-x','sessions'))).filter(name=>name.endsWith('.json')).map(async name=>JSON.parse(await readFile(join(fx.home,'trisoul-x','sessions',name),'utf8'))));
  const parent=states.find(state=>state.id===fx.sessionId), isolated=states.find(state=>state.workflowProject);
  assert.equal(isolated?.workflowProject,parent.cwd,'an isolated workflow keeps the originating project context');
  assert.doesNotMatch(JSON.stringify(returns), /workflow run failed|not been installed/);
});
