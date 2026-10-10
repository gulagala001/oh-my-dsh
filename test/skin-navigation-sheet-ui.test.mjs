import test from 'node:test';
import assert from 'node:assert/strict';
import { frontendFixture, until } from './fixtures/frontend.mjs';

test('phone theme sheets close on native selection and retain session action menus', { timeout: 120000 }, async t => {
  const f = await frontendFixture(t), { page } = f;
  const frame = page.locator('[data-omd-surface="frame"]');
  const row = page.locator(`[data-row-key="session:${f.sessionId}"]`);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const tap=async locator=>{
    await until(()=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}));
    const box=await locator.boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  for (const skin of ['codex-desktop','ios-liquid-glass','claude-cli-terminal']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'外观',exact:true}).click();
    await page.getByLabel('主题',{exact:true}).selectOption(skin);
    await until(async()=>await page.getByLabel('主题',{exact:true}).inputValue()===skin);
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:390,height:844});
    await until(async()=>await frame.getAttribute('data-sidebar-collapsed')==='true');
    const open=async()=>{await tap(page.getByRole('button',{name:'打开侧边栏',exact:true}));await until(async()=>await frame.getAttribute('data-sidebar-collapsed')!=='true')};
    await open();
    await row.scrollIntoViewIfNeeded();await tap(row.locator('button').first());
    await page.getByRole('menu').waitFor();
    assert.notEqual(await frame.getAttribute('data-sidebar-collapsed'),'true',skin+': actions keep the sheet open');
    await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'});
    await tap(row);
    await until(async()=>await frame.getAttribute('data-sidebar-collapsed')==='true');
    assert.equal(await page.locator('[data-composer-card]').isVisible(),true);
  }
  assert.deepEqual(f.errors,[]);
});
