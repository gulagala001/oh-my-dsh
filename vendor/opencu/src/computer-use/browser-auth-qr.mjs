import { readFile } from 'node:fs/promises';

// Codex browser-service.mjs: om/Yz/eG, Gk/tG, Kk/sG/aG/fw.
const WATCH_INTERVAL_MS = 125;
const SCREENSHOT_TIMEOUT_MS = 2000;
const BINDING_CHECK_INTERVAL = 8;
const DISAPPEARANCE_CONFIRMATIONS = 3;
let readerReady;

async function qrReader() {
  readerReady ??= (async () => {
    const readerUrl = import.meta.resolve('zxing-wasm/reader');
    const reader = await import(readerUrl);
    // Load the WASM paired with the installed reader, without a CDN request.
    const bytes = await readFile(new URL('../../reader/zxing_reader.wasm', readerUrl));
    const wasmBinary = Uint8Array.from(bytes).buffer;
    await reader.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
    return reader;
  })();
  return await readerReady;
}

function screenshotBytes(imageUrl) {
  if (typeof imageUrl !== 'string') return;
  const match = /^data:(image\/(?:png|jpe?g|webp|gif|bmp|avif));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(imageUrl);
  if (match == null || !match[2] || match[2].length % 4 !== 0) return;
  return { bytes: new Uint8Array(Buffer.from(match[2], 'base64')), mimeType: match[1] };
}

function boundsFromPoints(points) {
  if (!Array.isArray(points) || points.length < 4
    || points.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) return null;
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const x = Math.max(0, Math.floor(Math.min(...xs)));
  const y = Math.max(0, Math.floor(Math.min(...ys)));
  const width = Math.ceil(Math.max(...xs)) - x;
  const height = Math.ceil(Math.max(...ys)) - y;
  if (![x, y, width, height].every(Number.isSafeInteger) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function decodedQrCode(payload, points) {
  if (typeof payload !== 'string' || payload.length === 0) return null;
  const bounds = boundsFromPoints(points);
  return bounds == null ? null : { payload, bounds };
}

async function decodeWithReader(image) {
  try {
    const reader = await qrReader();
    const symbols = await reader.readBarcodes(image.bytes, { formats: ['QRCode'], maxNumberOfSymbols: 2 });
    if (symbols.length === 0) return null;
    if (symbols.length !== 1) return;
    const symbol = symbols[0];
    if (symbol == null || !symbol.isValid) return;
    const position = symbol.position;
    return decodedQrCode(symbol.text, [position?.topLeft, position?.topRight,
      position?.bottomRight, position?.bottomLeft]) ?? undefined;
  } catch { return; }
}

async function decodeScreenshotInPage(_element, helperOrArgument, selectorArgument) {
  const argument = selectorArgument ?? helperOrArgument;
  const Detector = globalThis.BarcodeDetector;
  if (Detector == null) return;
  const encoded = argument.screenshotUrl.split(',', 2)[1];
  if (encoded == null) return;
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  const image = await createImageBitmap(new Blob([bytes], { type: argument.mimeType }));
  try {
    const symbols = await new Detector({ formats: ['qr_code'] }).detect(image);
    if (symbols.length === 0) return null;
    if (symbols.length !== 1) return;
    const symbol = symbols[0];
    if (symbol == null || typeof symbol.rawValue !== 'string' || !symbol.rawValue.length) return;
    const box = symbol.boundingBox;
    const points = symbol.cornerPoints != null && symbol.cornerPoints.length >= 4
      ? symbol.cornerPoints : box == null ? null : [
        { x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
        { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height },
      ];
    return points == null ? undefined : { payload: symbol.rawValue,
      points: points.map(({ x, y }) => ({ x, y })) };
  } finally { image.close(); }
}

async function decodeWithBrowser(imageUrl, image, params, ctx) {
  try {
    const playwright = ctx?.playwright;
    const arg = { screenshotUrl: imageUrl, mimeType: image.mimeType };
    let result;
    if (typeof playwright?.evaluateOnPlaywrightPage === 'function') {
      result = await playwright.evaluateOnPlaywrightPage(params.tab_id, decodeScreenshotInPage,
        { arg, isolatedWorld: true, timeoutMs: params.timeout_ms });
    } else if (typeof playwright?.evaluateOnPlaywrightSelector === 'function') {
      result = await playwright.evaluateOnPlaywrightSelector(params.tab_id, 'html', decodeScreenshotInPage,
        { arg, isolatedWorld: true, timeoutMs: params.timeout_ms });
    } else return;
    return result == null ? result : decodedQrCode(result.payload, result.points) ?? undefined;
  } catch { return; }
}

// null confirms no QR code; undefined means decoding was unavailable or ambiguous.
export async function decodeBrowserAuthQrCode(imageUrl, params, ctx) {
  const image = screenshotBytes(imageUrl);
  if (image == null) return;
  const decoded = await decodeWithReader(image);
  return decoded !== undefined ? decoded : await decodeWithBrowser(imageUrl, image, params, ctx);
}

async function captureQrCode(params, ctx, signal) {
  try {
    const screenshot = await ctx.cdp.call(Number(params.tab_id), 'Page.captureScreenshot',
      { format: 'jpeg', fromSurface: true, optimizeForSpeed: true, quality: 80 },
      { preserveDebuggerOnTimeout: true, timeoutMs: SCREENSHOT_TIMEOUT_MS, signal });
    if (signal.aborted) return;
    return await decodeBrowserAuthQrCode(`data:image/jpeg;base64,${screenshot.data}`, params, ctx);
  } catch { return; }
}

async function waitForNextCapture(startedAt, signal) {
  const remaining = WATCH_INTERVAL_MS - (Date.now() - startedAt);
  if (remaining <= 0 || signal.aborted) return;
  await new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, remaining);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

async function watchQrCode({ signal, completeWhenQrCodeDisappears, ctx, initialPayload,
  pageBindingStatus, params, publishPayload }) {
  let iteration = 0, payload = initialPayload, absentCount = 0, pageHasChanged = false;
  while (!signal.aborted) {
    const startedAt = Date.now();
    if (iteration % BINDING_CHECK_INTERVAL === 0) {
      try {
        const status = await pageBindingStatus();
        if (status != null) {
          if (!completeWhenQrCodeDisappears || status !== 'page_changed') return;
          pageHasChanged = true;
        }
      } catch {
        absentCount = 0;
        await waitForNextCapture(startedAt, signal);
        continue;
      }
    }
    if (signal.aborted) return;
    const current = await captureQrCode(params, ctx, signal);
    if (signal.aborted) return;
    if (current === undefined) absentCount = 0;
    else if (current !== null) {
      if (pageHasChanged) return;
      payload = current.payload;
      absentCount = 0;
      await publishPayload(payload);
    } else if (completeWhenQrCodeDisappears && ++absentCount >= DISAPPEARANCE_CONFIRMATIONS) {
      try {
        const status = await pageBindingStatus();
        if (status != null && status !== 'page_changed') return;
      } catch {
        absentCount = 0;
        await waitForNextCapture(startedAt, signal);
        continue;
      }
      if (!signal.aborted) await publishPayload(payload, true);
      return;
    }
    iteration += 1;
    await waitForNextCapture(startedAt, signal);
  }
}

export function startBrowserAuthQrCodeWatch({ completeWhenQrCodeDisappears = false, ctx,
  initialQrCode, pageBindingStatus, params, publishPayload }) {
  if (typeof initialQrCode?.payload !== 'string' || !initialQrCode.payload
    || typeof pageBindingStatus !== 'function' || typeof publishPayload !== 'function'
    || typeof ctx?.cdp?.call !== 'function'
    || !Number.isSafeInteger(Number(params?.tab_id)) || Number(params.tab_id) <= 0) {
    throw new Error('Browser auth QR code watch is unavailable');
  }
  const controller = new AbortController();
  const initialPublication = publishPayload(initialQrCode.payload);
  void Promise.resolve(initialPublication).then(() => watchQrCode({
    signal: controller.signal, completeWhenQrCodeDisappears: completeWhenQrCodeDisappears === true,
    ctx, initialPayload: initialQrCode.payload, pageBindingStatus, params, publishPayload,
  })).catch(() => {});
  return { stop() { controller.abort(); } };
}
