import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('structured saved drafts never hide history and retain text and reference chips on rc.2', { timeout: 90000 }, async t => {
  const f = await frontendFixture(t), { page, sessionId } = f;
  const key = 'dsh.conversation.' + sessionId;
  const seed = async draft => {
    await page.evaluate(({key,draft}) => localStorage.setItem(key, JSON.stringify({draft,view:'chat',viewRequest:null})), {key,draft});
    await page.reload();
    await page.getByRole('button', { name: '打开工作台', exact: true }).waitFor();
    await page.locator('[data-chat-node-key]').filter({hasText:'已经梳理好今天的工作。'}).first().waitFor();
  };
  await seed({text:'',references:[]});
  assert.equal((await page.locator('[data-composer-input]').innerText()).trim(), '');
  await seed({text:'保留未发送的原文\n第二行',references:[]});
  await until(async () => (await page.locator('[data-composer-input]').innerText()).includes('保留未发送的原文'));
  const mention='@draft-reference.md', text='请检查 '+mention;
  const ref={source:'reference',ref:'draft-reference.md',offset:4,length:mention.length,label:'draft-reference.md',appearance:'file',clipboardText:mention};
  await seed({text,references:[ref]});
  await until(async () => await page.locator('[data-composer-chip="reference"]').count() === 1);
  await page.reload();
  await until(async () => await page.locator('[data-composer-chip="reference"]').count() === 1);
  assert.ok((await page.locator('[data-composer-input]').innerText()).includes('draft-reference.md'));
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  assert.deepEqual(saved.draft,{text,references:[ref]},'seed restoration does not rewrite the original cache');
  const backup=await page.evaluate(id=>JSON.parse(localStorage.getItem('omd.draft-recovery.v1.'+id)),sessionId);
  assert.ok(backup.some(raw=>JSON.parse(raw).draft.references?.[0]?.ref === ref.ref));
  await page.getByRole('tab', {name:'轨迹',exact:true}).click();
  await page.getByRole('searchbox', {name:'搜索轨迹'}).waitFor();
  await page.getByRole('tab', {name:'对话',exact:true}).click();
  await seed({text:12,references:[]});
  await page.getByText('已保存的草稿格式无法识别，原稿已保留。', {exact:true}).waitFor();
  assert.deepEqual(f.errors, []);
  assert.equal(f.diagnostics().some(v=>v.includes('slot entry crashed')),false);
});
