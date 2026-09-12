import { setTimeout as delay } from 'node:timers/promises';

export async function panViewport(cdp, y = 180) {
  // The gesture supplies its own touch source. Global touch emulation can
  // reinterpret subsequent mouse clicks and change the pinch scale.
  await cdp.send('Input.synthesizeScrollGesture', { x: 300, y, xDistance: -80, yDistance: 0, gestureSourceType: 'touch', speed: 800 });
  const samples = [];
  for (let i = 0; i < 50; i++) {
    const metrics = await cdp.send('Page.getLayoutMetrics');
    if (metrics.cssVisualViewport.pageX > 20) return metrics;
    if (i === 0 || i === 49) samples.push(metrics);
    await delay(20);
  }
  throw new Error('The fixture did not actually pan after the touch gesture: ' + JSON.stringify(samples));
}
