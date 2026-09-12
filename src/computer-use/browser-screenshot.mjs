import sharp from 'sharp';
import { setTimeout as delay } from 'node:timers/promises';

// Chromium temporarily changes target-wide viewport/preferences for capture.
// Captures and explicit viewport changes across model/preview CDP sessions
// must not overlap: a capture can otherwise restore over a newer set/reset.
const captures = new Map();

export async function withViewportTransaction(record, operation, signal) {
  signal?.throwIfAborted();
  const key = record.id ?? record;
  const previous = captures.get(key);
  const pending = (previous?.catch(() => {}) ?? Promise.resolve()).then(() => {
    signal?.throwIfAborted();
    return operation();
  });
  captures.set(key, pending);
  const clear = () => { if (captures.get(key) === pending) captures.delete(key); };
  void pending.then(clear, clear);
  // Return cancellation promptly while retaining the transaction's place in
  // the queue until its predecessor and any in-flight CDP restoration finish.
  if (!signal) return pending;
  let cancel;
  const aborted = new Promise((_, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
  try { return await Promise.race([pending, aborted]); }
  finally { signal.removeEventListener('abort', cancel); }
}

export async function observeScreenshot(record, options = {}, signal, capture) {
  screenshotOptions(options);
  return withViewportTransaction(record, async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      signal?.throwIfAborted();
      const before = await screenshotGeometry(record);
      const data = await capture(options, before);
      const { screenshot, region } = options.fullPage ? { screenshot: data, region: { x: 0, y: 0, scale: 1 } } : await cropViewport(data, before, options.clip);
      let after = await screenshotGeometry(record);
      // Restoration reaches the renderer after the screenshot reply. Wait
      // read-only for that update; never reset user viewport/scroll settings.
      const deadline = performance.now() + 250;
      while (options.fullPage && before.generation === after.generation && !sameScreenshotGeometry(before, after) && performance.now() < deadline) {
        await delay(16); after = await screenshotGeometry(record);
      }
      signal?.throwIfAborted();
      if (!sameScreenshotGeometry(before, after)) { if (options.fullPage) throw staleScreenshot(); continue; }
      const screenshotFrame = { ...after, fullPage: options.fullPage === true, region };
      record.screenshotFrame = screenshotFrame;
      return { screenshot, screenshotFrame };
    }
    throw staleScreenshot();
  }, signal);
}

export const staleScreenshot = () => Object.assign(new Error('The screenshot geometry has changed. Capture the current screenshot before using point coordinates.'), { code: 'STALE_SCREENSHOT' });

export async function screenshotGeometry(record) {
  return { source: record.coordinateId, generation: record.generation, ...viewportGeometry(await record.cdp.send('Page.getLayoutMetrics')) };
}

export function viewportGeometry(metrics) {
  const visual = metrics.cssVisualViewport, layout = metrics.cssLayoutViewport;
  return {
    layoutWidth: layout.clientWidth, layoutHeight: layout.clientHeight,
    width: visual.clientWidth, height: visual.clientHeight,
    pageX: visual.pageX, pageY: visual.pageY, offsetX: visual.offsetX, offsetY: visual.offsetY,
    scale: visual.scale, zoom: visual.zoom ?? 1,
    rasterScale: metrics.visualViewport.clientWidth / visual.clientWidth,
  };
}

export function sameScreenshotGeometry(a, b) {
  return Object.keys(b).every(key => a[key] === b[key]);
}

export function screenshotOptions(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('Screenshot options must be an object.');
  if(options.fullPage!==undefined&&typeof options.fullPage!=='boolean')throw new Error('fullPage must be a boolean.');
  if(options.clip!==undefined){
    const c=options.clip;
    if(!c||!['x','y','width','height'].every(key=>Number.isFinite(c[key]))||c.x<0||c.y<0||c.width<=0||c.height<=0)throw new Error('clip requires finite x/y >= 0 and width/height > 0.');
    if(options.fullPage)throw new Error('Choose either fullPage or a viewport clip.');
  }
  return options;
}

export async function cropViewport(data,geometry,clip){
  if(!clip)return {screenshot:data,region:{x:0,y:0,scale:geometry.scale}};
  if(clip.x+clip.width>geometry.width+.01||clip.y+clip.height>geometry.height+.01)throw new Error('The clip is outside the visible CSS viewport. Scroll or capture the full page first.');
  const image=sharp(Buffer.from(data,'base64')),meta=await image.metadata(),scale=geometry.scale;
  const left=Math.round(clip.x*scale),top=Math.round(clip.y*scale),right=Math.min(meta.width,Math.round((clip.x+clip.width)*scale)),bottom=Math.min(meta.height,Math.round((clip.y+clip.height)*scale));
  if(right<=left||bottom<=top)throw new Error('The clip does not contain any screenshot pixels.');
  return {screenshot:(await image.extract({left,top,width:right-left,height:bottom-top}).png().toBuffer()).toString('base64'),region:{x:left/scale,y:top/scale,scale}};
}

export async function captureFullPage(record){
  const {cssContentSize}=await record.cdp.send('Page.getLayoutMetrics');
  const {data}=await record.cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip:{x:0,y:0,width:cssContentSize.width,height:cssContentSize.height,scale:1}});
  const bytes=Buffer.from(data,'base64'),image=sharp(bytes),meta=await image.metadata();
  const width=Math.ceil(cssContentSize.width),height=Math.ceil(cssContentSize.height);
  if(Math.abs(meta.width/width-meta.height/height)>2/Math.min(width,height))throw new Error('The browser did not return a complete full-page image.');
  return meta.width===width&&meta.height===height?data:(await image.resize(width,height,{fit:'fill'}).png().toBuffer()).toString('base64');
}

export async function captureViewport(record, geometry) {
  // clip and captureBeyondViewport can restore Chromium's cached emulation
  // over another client's settings, including the current pinch zoom. Resize
  // only the returned pixels, never the live page as part of observation.
  const { data } = await record.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const image = Buffer.from(data, 'base64'), metadata = await sharp(image).metadata();
  const scale = geometry.rasterScale;
  const crop = {
    left: 0, top: 0,
    width: Math.min(metadata.width, Math.round(geometry.width * geometry.scale * scale)),
    height: Math.min(metadata.height, Math.round(geometry.height * geometry.scale * scale)),
  };
  if (scale === 1 && crop.width === metadata.width && crop.height === metadata.height) return data;
  return (await sharp(image).extract(crop).resize(Math.max(1, Math.round(crop.width / scale)), Math.max(1, Math.round(crop.height / scale)), { fit: 'fill' }).png().toBuffer()).toString('base64');
}
