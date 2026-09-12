import { setTimeout as delay } from 'node:timers/promises';

export async function panViewport(cdp, y = 180) {
  // Inject a real touch sequence into the target renderer. The synthesized
  // gesture's platform touch route can miss viewport panning in Aura.
  // Injection mode leaves subsequent mouse clicks and drags as mouse input.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 300, y }] });
  try {
    for (let x = 290; x >= 220; x -= 10) {
      await delay(20);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x, y }] });
    }
    // Stop before lifting the finger so momentum cannot move the next frame.
    await delay(150);
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const samples = [];
  for (let i = 0; i < 50; i++) {
    const metrics = await cdp.send('Page.getLayoutMetrics');
    if (metrics.cssVisualViewport.pageX > 20 && metrics.cssVisualViewport.offsetX > 20) return metrics;
    if (i === 0 || i === 49) samples.push(metrics);
    await delay(20);
  }
  throw new Error('The fixture did not actually pan after the touch gesture: ' + JSON.stringify(samples));
}
