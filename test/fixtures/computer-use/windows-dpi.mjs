import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';

// Reuse the already-built native runtime and WPF fixture; do not compile a
// separate application or repeat the complete desktop suite for each DPI.
export async function verifyDisplayScaling({ t, fixture, native, target, artifact, nextFrame }) {
  if (process.env.GITHUB_ACTIONS !== 'true') return [];
  const request = (action, values = {}) => fixture.request('fixture', { action, ...values });
  const wait = async predicate => {
    for (let i = 0; i < 150; i++) { const state = await request('state'); if (predicate(state)) return state; await delay(40); }
    const last = await request('state');
    assert.fail('Display/input did not settle: ' + JSON.stringify({ dpi: last.dpi, cursor: last.cursor, text: last.text, held: last.held, pointerEvents: last.pointerEvents.slice(-3) }));
  };
  const initialDpi = (await request('state')).dpi;
  const identity = { pid: target.pid, window_id: target.window_id, process_identity: target.process_identity }, reports = [];
  const capture = async () => {
    for (let i = 0; ; i++) {
      try { return await native.call('dpi', 'get_window_state', { ...identity, include_screenshot: true, max_dimension: 400 }); }
      catch (error) { if (i >= 9 || !['WINDOW_MOVED', 'CAPTURE_GEOMETRY_CHANGED'].includes(error.code)) throw error; await delay(100); }
    }
  };
  try {
    t.diagnostic('DPI test resolution: ' + JSON.stringify(await request('display-scale-prepare')));
    await request('resize', { width: 440, height: 320 });
    await request('move', { x: 20, y: 20 });
    await request('focus');
    for (const percent of [125, 150, 200]) await t.test('physical screenshot and input at ' + percent + '% display scaling', async () => {
      const binding = await native.bind('dpi', { id: target.app_id, windowId: target.window_id });
      try {
        await capture();
        t.diagnostic('Applied display scale: ' + JSON.stringify(await request('display-scale', { percent })));
        const expectedDpi = percent * 96 / 100;
        await wait(state => state.dpi === expectedDpi);
        await assert.rejects(native.invoke('dpi', binding.id, 'click', [{ x: 10, y: 10 }]), error => error.code === 'WINDOW_MOVED', 'old screenshot coordinates cannot survive a DPI change');
        await request('focus');
        const shot = await capture(), state = shot.structuredContent;
        const image = Buffer.from(shot.content.find(item => item.type === 'image').data, 'base64');
        const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.equal(info.width, state.screenshot_width); assert.equal(info.height, state.screenshot_height);
        assert.ok(info.width < state.bounds.width, 'exercise real downsampling as well as Windows display scaling');
        let left = Infinity, top = Infinity, right = -1, bottom = -1;
        for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
          const p = (y * info.width + x) * info.channels;
          if (data[p] > 190 && data[p + 1] < 70 && data[p + 2] < 90) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
        }
        assert.ok(right - left > 50 && bottom - top > 25, 'actual scaled screenshot contains the application marker');
        const point = fraction => ({ x: Math.floor(left + (right - left) * fraction), y: Math.floor((top + bottom) / 2) });
        const from = point(.25), to = point(.75);
        const physical = p => ({ x: state.bounds.x + Math.floor(p.x * state.bounds.width / info.width), y: state.bounds.y + Math.floor(p.y * state.bounds.height / info.height) });
        const before = await request('state'), ups = before.pointerEvents.filter(e => e.kind === 'up').length;
        await native.invoke('dpi', binding.id, 'click', [from]);
        const clicked = await wait(s => s.pointerEvents.filter(e => e.kind === 'up').length === ups + 1);
        assert.deepEqual(clicked.cursor, physical(from));
        await native.invoke('dpi', binding.id, 'drag', [from, to]);
        const dragged = await wait(s => s.pointerEvents.filter(e => e.kind === 'up').length === ups + 2);
        assert.deepEqual(dragged.cursor, physical(to));
        assert.ok(dragged.pointerEvents.slice(clicked.pointerEvents.length).some(e => e.kind === 'move' && e.held));
        assert.ok(Object.values(dragged.held).every(value => value === false));
        const marker = state.elements.find(e => e.label === '颜色标记');
        assert.ok(marker?.bounds && marker.bounds.x >= state.bounds.x && marker.bounds.x < state.bounds.x + state.bounds.width, 'UIA returns physical bounds in the same window');
        assert.ok(Math.abs(marker.bounds.x - (state.bounds.x + left * state.bounds.width / info.width)) <= 2 * state.bounds.width / info.width, 'UIA marker and screenshot use the same physical X coordinate');
        assert.ok(Math.abs(marker.bounds.y - (state.bounds.y + top * state.bounds.height / info.height)) <= 2 * state.bounds.height / info.height, 'UIA marker and screenshot use the same physical Y coordinate');
        await request('focus');
        await native.invoke('dpi', binding.id, 'pressKey', ['ctrl+a']);
        const text = `缩放 ${percent}% 中文🙂`;
        await native.invoke('dpi', binding.id, 'typeText', [text]);
        await wait(s => s.text === text);
        // The long-lived preview started before the DPI change must recover
        // with current geometry rather than reuse old screenshot dimensions.
        let frame;
        for (let i = 0; i < 10; i++) {
          try { frame = await nextFrame(); if (frame.bounds.width === state.bounds.width && frame.bounds.height === state.bounds.height) break; }
          catch (error) { if (!['WINDOW_MOVED', 'CAPTURE_GEOMETRY_CHANGED'].includes(error.code)) throw error; }
        }
        assert.deepEqual(frame?.bounds, state.bounds); assert.equal(frame.geometryVerified, true);
        await writeFile(join(artifact, `scale-${percent}.png`), image);
        reports.push({ percent, dpi: expectedDpi, screenshot: { width: info.width, height: info.height }, bounds: state.bounds, click: clicked.cursor, drag: dragged.cursor, unicodeInput: true, preview: true, staleCoordinatesRejected: true });
      } finally { await native.release('dpi'); }
    });
  } finally {
    await request('display-scale-restore');
    await wait(state => state.dpi === initialDpi);
    await request('resize', { width: 640, height: 420 });
    await request('move', { x: 100, y: 100 });
  }
  await writeFile(join(artifact, 'display-scaling.json'), JSON.stringify(reports, null, 2));
  assert.equal(reports.length, 3, 'all three real display scales must pass');
  return reports;
}
