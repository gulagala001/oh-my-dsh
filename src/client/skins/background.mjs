export const BACKGROUND_DB = 'omd.appearance.background.v1';
export const MAX_BACKGROUND_BYTES = 15 * 1024 * 1024;
export const backgroundDefaults = Object.freeze({ blur: 0, shade: 0, opacity: 85, fit: 'cover', scope: 'all' });
export function normalizeBackground(value = {}) {
  const number = (key, min, max) => Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key])) : backgroundDefaults[key];
  return { blur: number('blur', 0, 30), shade: number('shade', -80, 80), opacity: number('opacity', 20, 100), fit: ['cover', 'contain'].includes(value.fit) ? value.fit : 'cover', scope: ['all', 'conversation', 'sidebar'].includes(value.scope) ? value.scope : 'all' };
}
async function prepareImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw Error('请选择 PNG、JPEG 或 WebP 图片');
  if (file.size > MAX_BACKGROUND_BYTES) throw Error('背景图片不能超过 15 MB');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw Error('图片无法解码，请选择有效图片'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw Error('背景图片不能超过 4000 万像素');
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.88));
    if (!blob) throw Error('图片处理失败');
    return { blob, name: String(file.name || '自定义背景').slice(0, 160), imageId: crypto.randomUUID() };
  } finally { bitmap.close(); }
}

// Image and controls commit together in one IndexedDB record. No file upload,
// data URLs in localStorage, or transient blob URL persisted across restarts.
export function createBackgroundRuntime(css, changed, { recovery = false } = {}) {
  let disposed = false, db, opening, objectUrl = '', imageId, sequence = 0, uploadSequence = 0, reduced = false;
  let state = { ...backgroundDefaults, name: '', url: '', loading: false, error: '' };
  const style = document.createElement('style'); style.dataset.omdBackgroundStyle = ''; style.textContent = css;
  const layer = document.createElement('div'); layer.dataset.omdBackgroundLayer = ''; layer.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img'); image.alt = ''; image.draggable = false; layer.append(image);
  document.head.append(style); document.body.prepend(layer);
  let channel;
  try { channel = new BroadcastChannel(BACKGROUND_DB); } catch { /* Local persistence still works without cross-tab messaging. */ }
  const emit = () => { if (!disposed) changed({ ...state }); };
  // Only move our own layer. The host owns its columns and may remount them;
  // absolute positioning follows their size without viewport polling.
  const mount = () => {
    if (disposed) return;
    const target = state.scope === 'all' ? document.body
      : document.querySelector(state.scope === 'conversation' ? '.pI_x6G_centerCol' : '.pI_x6G_sidebarCol');
    const parent = target || document.body;
    if (layer.parentElement !== parent) parent.prepend(layer);
    layer.hidden = !objectUrl || recovery || reduced || !target;
  };
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  const render = () => {
    if (disposed) return;
    const active = Boolean(objectUrl) && !recovery && !reduced;
    if (active) document.documentElement.setAttribute('data-omd-background', state.scope);
    else document.documentElement.removeAttribute('data-omd-background');
    mount();
    layer.style.setProperty('--omd-wallpaper-blur', `${state.blur}px`);
    layer.style.setProperty('--omd-wallpaper-shade', state.shade < 0 ? `rgb(0 0 0 / ${-state.shade / 100})` : `rgb(255 255 255 / ${state.shade / 100})`);
    image.style.objectFit = state.fit;
    document.documentElement.style.setProperty('--omd-panel-opacity', `${state.opacity}%`);
  };
  const open = () => {
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(BACKGROUND_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('background');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('背景存储被其他窗口占用，请关闭旧窗口后重试'));
      request.onsuccess = () => {
        if (disposed) { request.result.close(); reject(Error('外观已卸载')); return; }
        db = request.result; db.onversionchange = () => { db.close(); db = undefined; opening = undefined; };
        resolve(db);
      };
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  };
  const transaction = async change => {
    const database = await open();
    if (disposed) throw Error('外观已卸载');
    return new Promise((resolve, reject) => {
      const tx = database.transaction('background', change ? 'readwrite' : 'readonly');
      const store = tx.objectStore('background'), request = store.get('current');
      let result;
      request.onsuccess = () => {
        result = request.result || {};
        if (change) { result = change(result); if (result) store.put(result, 'current'); else store.delete('current'); }
      };
      tx.oncomplete = () => resolve(result || {});
      tx.onabort = tx.onerror = () => reject(tx.error || Error('背景未保存'));
    });
  };
  const adopt = record => {
    if (disposed) return;
    const valid = record.blob instanceof Blob && record.blob.size <= MAX_BACKGROUND_BYTES && ['image/png', 'image/jpeg', 'image/webp'].includes(record.blob.type);
    if (!valid || imageId !== record.imageId) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = valid ? URL.createObjectURL(record.blob) : ''; imageId = valid ? record.imageId : undefined;
      if (objectUrl) image.src = objectUrl; else image.removeAttribute('src');
    }
    state = { ...normalizeBackground(record), name: valid ? String(record.name || '自定义背景') : '', url: objectUrl, loading: false, error: '' };
    render(); emit();
  };
  const load = async () => {
    const seq = ++sequence;
    try { const record = await transaction(); if (seq === sequence) adopt(record); }
    catch { if (!disposed && seq === sequence) { state = { ...state, error: '背景存储不可用；主题和配色仍可正常使用。' }; emit(); } }
  };
  const mutate = async change => {
    ++sequence;
    try { await transaction(change); channel?.postMessage('changed'); await load(); }
    catch (error) { throw Error(`背景未保存：${error?.message || '浏览器存储不可用或空间不足'}`); }
  };
  image.onerror = () => {
    if (disposed) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = ''; imageId = undefined;
    state = { ...state, url: '', name: '', error: '背景图片无法显示，请重新选择图片。' }; render(); emit();
  };
  if (channel) channel.onmessage = () => { void load(); };
  layer.hidden = true; void load();
  return {
    getSnapshot: () => state,
    async upload(file) {
      const seq = ++uploadSequence; state = { ...state, loading: true, error: '' }; emit();
      try {
        const record = await prepareImage(file);
        if (disposed || seq !== uploadSequence) return;
        await mutate(previous => ({ ...normalizeBackground(previous), ...record }));
      } finally { if (!disposed && seq === uploadSequence) { state = { ...state, loading: false }; emit(); } }
    },
    update: patch => mutate(previous => ({ ...previous, ...normalizeBackground({ ...previous, ...patch }) })),
    async clear() { ++uploadSequence; await mutate(() => undefined); },
    reduceEffects(value) { reduced = value; render(); },
    dispose() {
      disposed = true; ++sequence; ++uploadSequence; observer.disconnect(); channel?.close(); db?.close();
      image.onerror = null; if (objectUrl) URL.revokeObjectURL(objectUrl);
      layer.remove(); style.remove(); document.documentElement.removeAttribute('data-omd-background');
      document.documentElement.style.removeProperty('--omd-panel-opacity');
    },
  };
}
