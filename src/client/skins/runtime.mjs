import { advancedDefaults, normalizeAdvanced, advancedTokens, advancedCss, prepareLogo } from './advanced.mjs';
import { bundledSkins } from './bundled.mjs';
import { validateSkin, compileSkinCss } from './format.mjs';
import { hostTokens, tokenCss, customTokenCss } from './mapping.mjs';
import { composePalette, paletteCatalog } from './palette.mjs';
import { extraPalettes } from './palettes.mjs';
import { createBackgroundRuntime, backgroundDefaults } from './background.mjs';
export const STORAGE_KEY = 'omd.skins.v1';
export function createSkinRuntime(ctx, adapterCss, layouts = {}, appearanceCss = '') {
  const recovery = new URLSearchParams(location.search).get('omd-skin') === 'default';
  let state = { skins: [], palettes: paletteCatalog([]), selected: 'default', palette: 'theme', reduceEffects: false, advanced: advancedDefaults(), background: { ...backgroundDefaults, name: '', url: '', loading: false, error: '' }, error: '' };
  let disposeTokens, style, customStyle, disposed = false, logoSequence = 0;
  const listeners = new Set();
  const prepare = value => {
    const skin = validateSkin(value, CSS.supports.bind(CSS));
    return { skin, css: compileSkinCss(skin.css, skin.id) };
  };
  const bundled = new Map(bundledSkins.map(value => { const item = prepare(value); item.skin = { ...item.skin, builtin: true }; return [item.skin.id, item]; }));
  let prepared = new Map();
  const emit = () => { state = { ...state }; for (const fn of listeners) fn(); };
  const read = () => {
    const next = { ...state, skins: [], selected: 'default', palette: 'theme', reduceEffects: false, advanced: advancedDefaults(), error: '' };
    const ready = new Map(bundled), savedIds = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved.skins !== undefined && !Array.isArray(saved.skins)) throw new Error('皮肤列表损坏');
      for (const item of saved.skins || []) {
        try {
          const result = prepare(item);
          if (savedIds.has(result.skin.id)) throw new Error('重复皮肤 id');
          savedIds.add(result.skin.id); ready.set(result.skin.id, result);
        } catch { next.error = '部分皮肤数据无效，已跳过；可重新导入。'; }
      }
      if (ready.has(saved.selected)) next.selected = saved.selected;
      if (ready.has(saved.palette) || extraPalettes.some(p => p.id === saved.palette)) next.palette = saved.palette;
      next.reduceEffects = saved.reduceEffects === true;
      next.advanced = normalizeAdvanced(saved.advanced);
    } catch { next.error = '无法读取皮肤记录，已使用默认外观。'; }
    if (recovery) { next.selected = 'default'; next.palette = 'theme'; next.advanced = advancedDefaults(); next.advanced.brand = { ...next.advanced.brand, logo: 'native', title: 'native' }; }
    next.skins = [...ready.values()].map(item => item.skin);
    next.palettes = paletteCatalog(next.skins);
    state = next; prepared = ready;
  };
  const syncMode = snapshot => {
    if (state.selected !== 'default' || state.palette !== 'theme' || state.advanced.enabled) document.documentElement.dataset.appearance = snapshot.active.colorScheme;
    emit();
  };
  const background = createBackgroundRuntime(appearanceCss, value => { state = { ...state, background: value }; emit(); }, { recovery });
  const apply = () => {
    const root = document.documentElement;
    const active = prepared.get(state.selected);
    const source = state.palettes.find(p => p.id === state.palette);
    const composed = composePalette(active?.skin, source);
    background.reduceEffects(state.reduceEffects);
    // Remove the previous layer before installing the next; all values were parsed first.
    disposeTokens?.(); disposeTokens = undefined;
    style?.remove(); style = undefined;
    customStyle?.remove(); customStyle = undefined;
    root.classList.remove('omd');
    for (const name of ['omdSkin', 'omdLayout', 'omdPalette', 'omdColors', 'appearance', 'omdReduceEffects', 'omdCustom']) delete root.dataset[name];
    if (state.reduceEffects) root.dataset.omdReduceEffects = '';
    if (!composed && !state.advanced.enabled) return;
    root.dataset.appearance = ctx.theme.getTheme().active.colorScheme;
    if (composed) {
      root.dataset.omdColors = '';
      if (source) root.dataset.omdPalette = source.id;
      if (active) { root.classList.add('omd'); root.dataset.omdSkin = active.skin.id; }
      if (active?.skin.layout) root.dataset.omdLayout = active.skin.layout;
      style = document.createElement('style'); style.dataset.omdSkinStyle = active?.skin.id || 'default';
      style.textContent = tokenCss(composed, 'html[data-omd-colors]') + '\n' + adapterCss + '\n' + (active?.css || '')
        + (active?.skin.layout ? '\n' + (layouts[active.skin.layout] || '') : '');
      document.head.append(style);
    }
    const overrides = advancedTokens(state.advanced);
    if (state.advanced.enabled) {
      root.dataset.omdCustom = '';
      customStyle = document.createElement('style'); customStyle.dataset.omdCustomStyle = '';
      customStyle.textContent = customTokenCss(overrides) + '\n' + advancedCss(state.advanced);
      document.head.append(customStyle);
    }
    if (composed) disposeTokens = ctx.theme.overrideTokens('trisoul_x/skin', hostTokens(composed));
  };
  const save = next => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ skins: next.skins.filter(skin => !skin.builtin), selected: next.selected, palette: next.palette, reduceEffects: next.reduceEffects, advanced: next.advanced })); }
    catch { throw new Error('浏览器存储不可用或空间不足，未更改皮肤。请移除不用的皮肤后重试。'); }
    state = { ...next, palettes: paletteCatalog(next.skins), error: '' }; apply(); emit();
  };
  read();
  const offTheme = ctx.on('theme/change', syncMode);
  apply();
  const onStorage = event => {
    if (event.key === STORAGE_KEY || event.key === null) { read(); apply(); emit(); }
  };
  window.addEventListener('storage', onStorage);
  // The phone layout presents navigation as a full sheet. Use the host action
  // after its own row handler; never move React nodes or simulate button clicks.
  const hasNavigationSheet = () => ['ios-liquid', 'codex-desktop', 'claude-cli-terminal'].includes(prepared.get(state.selected)?.skin.layout);
  const onNavigation = event => {
    if (!hasNavigationSheet() || !matchMedia('(max-width: 600px)').matches) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.YDXeBa_rowActions') || event.button !== 0) return;
    if (!target.closest('.YDXeBa_sessionRow, .YDXeBa_searchResultRow, .hHd-Xa_newSession, .hHd-Xa_panelRow')) return;
    const frame = target.closest('.pI_x6G_frame');
    if (frame && frame.dataset.sidebarCollapsed !== 'true') queueMicrotask(() => {
      if (!disposed && frame.isConnected && frame.dataset.sidebarCollapsed !== 'true'
        && hasNavigationSheet()) ctx.layout.toggleSidebar();
    });
  };
  // Session rows stop bubbling; capture only schedules the host action after dispatch.
  document.addEventListener('click', onNavigation, true);
  return {
    getSnapshot: () => state,
    background,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    getAppearance: () => ctx.theme.getTheme().preference,
    async setAppearance(value) {
      const form = ctx.configForms.get('ui-theme');
      if (form.getSnapshot().mode === 'memory') return ctx.theme.setTheme(value);
      // rc.2 re-adopts the shared settings mirror during writes. Let the
      // native form commit before the theme adopts it, so an older snapshot
      // cannot flash the previous palette over an optimistic selection.
      if (!await form.set('preference', value)) throw new Error('明暗模式未保存，请重试。');
    },
    select(id) {
      if (id !== 'default' && !prepared.has(id)) throw new Error('皮肤不存在，请重新导入');
      save({ ...state, selected: id });
    },
    selectPalette(id) {
      if (id !== 'theme' && !state.palettes.some(p => p.id === id)) throw new Error('配色不存在，请重新选择');
      save({ ...state, palette: id });
    },
    import(value) {
      const item = prepare(value);
      const previous = prepared.get(item.skin.id);
      prepared.set(item.skin.id, item);
      try { save({ ...state, skins: [...state.skins.filter(s => s.id !== item.skin.id), item.skin], selected: item.skin.id }); }
      catch (error) { if (previous) prepared.set(item.skin.id, previous); else prepared.delete(item.skin.id); throw error; }
    },
    remove(id) {
      if (prepared.get(id)?.skin.builtin) return;
      const baseline = bundled.get(id);
      const previous = prepared.get(id);
      if (baseline) prepared.set(id, baseline); else prepared.delete(id);
      try { save({ ...state, skins: [...state.skins.filter(s => s.id !== id), ...(baseline ? [baseline.skin] : [])], selected: state.selected === id ? 'default' : state.selected, palette: state.palette === id && !baseline ? 'theme' : state.palette }); }
      catch (error) { if (previous) prepared.set(id, previous); throw error; }
    },
    setAdvanced(value) {
      const advanced = normalizeAdvanced(value);
      if (JSON.stringify(advanced.brand) !== JSON.stringify(state.advanced.brand)) ++logoSequence;
      save({ ...state, advanced });
    },
    async uploadLogo(file) {
      const seq = ++logoSequence, image = await prepareLogo(file);
      if (!disposed && seq === logoSequence) save({ ...state, advanced: { ...state.advanced, brand: { ...state.advanced.brand, logo: 'custom', image } } });
    },
    resetAdvanced() { ++logoSequence; save({ ...state, advanced: advancedDefaults() }); },
    reduceEffects: value => save({ ...state, reduceEffects: value }),
    reset() {
      const next = { ...state, selected: 'default' };
      try { save(next); }
      catch (error) { state = { ...next, error: '已恢复默认外观，但浏览器未能保存此选择。' }; apply(); emit(); }
    },
    dispose() {
      if (disposed) return; disposed = true; ++logoSequence;
      offTheme(); window.removeEventListener('storage', onStorage); document.removeEventListener('click', onNavigation, true);
      state = { ...state, selected: 'default', palette: 'theme', advanced: advancedDefaults() }; apply(); background.dispose(); listeners.clear();
    },
  };
}
