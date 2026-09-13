window.__ModuleLoader__.load({id:"opencu",factory:(require)=>{var module={exports:{}};var exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/computer-use.jsx
var import_react17 = __toESM(require("react"), 1);

// src/client/computer-use.css
var computer_use_default = "/* DSH surfaces and blue accents, with compact controls and media-first previews. */\n.tx-cu-pane, .tx-cu-card, .tx-cu-chip, .tx-cu-group, .tx-cu-share,\n.tx-cu-share-dialog, .tx-cu-floating, .tx-cu-user-message, .tx-cu-image-dialog, .tx-cu-result-images, .tx-cu-group-toggle {\n  --cu-bg: var(--dsw-alias-bg-base, Canvas);\n  --cu-text: var(--dsw-alias-label-primary, CanvasText);\n  --cu-muted: var(--dsw-alias-label-tertiary, GrayText);\n  --cu-line: color-mix(in srgb, var(--cu-text) 12%, var(--cu-bg));\n  --cu-soft: color-mix(in srgb, var(--cu-text) 3%, var(--cu-bg));\n  --cu-hover: color-mix(in srgb, var(--cu-text) 6%, var(--cu-bg));\n  --cu-blue: #3877e8;\n  --cu-tint: color-mix(in srgb, var(--cu-blue) 9%, var(--cu-bg));\n  --cu-danger: var(--dsw-alias-state-error-primary, #c45252);\n  --cu-shadow: 0 8px 32px -8px #0003, 0 2px 6px #0000000a;\n  color: var(--cu-text);\n  font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n  font-variant-numeric: tabular-nums;\n  -webkit-font-smoothing: antialiased;\n}\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) *,\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) *::before,\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) *::after { box-sizing: border-box; }\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 30px;\n  border: 1px solid var(--cu-line);\n  border-radius: 8px;\n  padding: 5px 10px;\n  background: var(--cu-bg);\n  color: var(--cu-text);\n  font: inherit;\n  font-size: 12px;\n  line-height: 18px;\n  cursor: pointer;\n  transition: background .15s, border-color .15s, color .15s;\n}\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) button:hover:not(:disabled) { background: var(--cu-hover); }\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) button:disabled { opacity: .4; cursor: default; }\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) :is(button, input, select, textarea, summary):focus-visible {\n  outline: 2px solid var(--cu-blue);\n  outline-offset: 2px;\n}\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) svg { flex-shrink: 0; }\n:where(.tx-cu-pane, .tx-cu-share-dialog) :is(input:not([type=checkbox]), select, textarea) {\n  min-width: 0;\n  border: 1px solid var(--cu-line);\n  border-radius: 8px;\n  padding: 7px 10px;\n  background: var(--cu-bg);\n  color: var(--cu-text);\n  font: inherit;\n  font-size: 12px;\n}\n:where(.tx-cu-pane, .tx-cu-share-dialog) :is(input, textarea)::placeholder { color: var(--cu-muted); opacity: .8; }\n:where(.tx-cu-pane, .tx-cu-share-dialog, .tx-cu-floating) .tx-cu-primary {\n  background: var(--cu-blue);\n  color: #fff;\n  border-color: transparent;\n}\n:where(.tx-cu-pane, .tx-cu-share-dialog, .tx-cu-floating) .tx-cu-primary:hover:not(:disabled) { background: #2868d8; }\n.tx-cu-error { color: var(--cu-danger, #c45252) !important; overflow-wrap: anywhere; }\n.tx-cu-result-images { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 8px; }\n.tx-cu-image-button { display: block; width: 80px; height: 80px; padding: 0; overflow: hidden; border: 1px solid var(--cu-line); border-radius: 8px; background: var(--cu-bg); cursor: zoom-in; }\n.tx-cu-image-button .tx-cu-card-image { width: 100%; height: 100%; margin: 0; border: 0; border-radius: 0; object-fit: cover; }\n.tx-cu-image-retry { padding: 8px; color: var(--cu-danger); }\n.tx-cu-image-dialog { position: fixed; inset: 0; width: calc(100vw - 40px); height: calc(100dvh - 40px); max-width: none; max-height: none; margin: auto; padding: 0; border: 1px solid var(--cu-line); border-radius: 12px; background: var(--cu-bg); box-shadow: var(--cu-shadow); }\n.tx-cu-image-dialog::backdrop { background: #0009; }\n.tx-cu-image-dialog * { box-sizing: border-box; }\n.tx-cu-image-dialog header { min-height: 48px; padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-image-dialog header > span, .tx-cu-image-dialog header > div { display: flex; align-items: center; gap: 5px; }\n.tx-cu-image-dialog header > span { gap: 12px; font-size: 13px; }\n.tx-cu-image-dialog output { min-width: 40px; text-align: center; font-variant-numeric: tabular-nums; font-size: 11px; color: var(--cu-muted); }\n.tx-cu-image-dialog small { color: var(--cu-muted); font-size: 11px; }\n.tx-cu-image-dialog button, .tx-cu-image-dialog a { display: inline-flex; align-items: center; padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; text-decoration: none; }\n.tx-cu-image-dialog button:hover, .tx-cu-image-dialog a:hover { background: var(--cu-hover); }\n.tx-cu-image-dialog[open] { display: flex; flex-direction: column; }\n.tx-cu-image-canvas { flex: 1; min-height: 0; padding: 16px; overflow: auto; background: var(--cu-soft); touch-action: none; }\n.tx-cu-image-stage { min-width: 100%; min-height: 100%; width: max-content; display: flex; align-items: center; justify-content: center; }\n.tx-cu-image-canvas img { display: block; flex-shrink: 0; max-width: none; max-height: none; object-fit: contain; cursor: zoom-in; }\n.tx-cu-image-canvas.is-original img { cursor: grab; }\n.tx-cu-image-canvas.is-panning, .tx-cu-image-canvas.is-panning img { cursor: grabbing; }\n.tx-cu-image-dialog footer { padding: 6px 12px; text-align: center; color: var(--cu-muted); font-size: 10px; border-top: 1px solid var(--cu-line); }\n.tx-cu-image-dialog button:disabled { opacity: .4; cursor: default; }\n.tx-cu-image-loading { display: grid; place-items: center; width: 80px; height: 80px; border-radius: 8px; background: var(--cu-soft); color: var(--cu-muted); font-size: 10px; }\n.tx-cu-image-failure { display: flex; align-items: center; justify-content: center; min-height: 100%; gap: 12px; color: var(--cu-muted); font-size: 12px; }\n/* read_image keeps its original result in the host's inspect action. */\n.trisoul-shell .o3BgMG_imageBody :is(.o3BgMG_imageLabel, .o3BgMG_imageMeta) { display: none; }\n.tx-cu-muted { color: var(--cu-muted); }\n.tx-cu-pane > .tx-cu-error { padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--cu-danger) 7%, var(--cu-bg)); font-size: 12px; }\n\n/* The panel keeps the host layout and concentrates actions in its header. */\n.tx-cu-pane { height: 100%; padding: 18px 16px; overflow: auto; box-sizing: border-box; background: var(--cu-bg); container-type: inline-size; scrollbar-width: thin; }\n.tx-cu-pane > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }\n.tx-cu-pane-heading { display: flex; align-items: center; gap: 9px; min-width: 0; }\n.tx-cu-pane-heading > svg { color: var(--cu-muted); }\n.tx-cu-pane-heading > div { display: flex; flex-direction: column; gap: 1px; }\n.tx-cu-pane-heading strong { font-size: 13px; font-weight: 600; letter-spacing: -.15px; }\n.tx-cu-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--cu-muted); }\n.tx-cu-status::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .55; }\n.tx-cu-status.is-running { color: var(--cu-blue); }\n.tx-cu-status.is-running::before { opacity: 1; }\n.tx-cu-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-left: auto; }\n.tx-cu-toolbar button { min-height: 28px; padding: 4px 8px; font-size: 11px; }\n.tx-cu-toolbar .tx-cu-stop { background: var(--cu-soft); border-color: transparent; }\n.tx-cu-toolbar .tx-cu-stop:hover:not(:disabled) { background: var(--cu-hover); }\n.tx-cu-target { display: flex; align-items: center; gap: 7px; margin: 16px 0 9px; font-size: 12px; font-weight: 500; }\n.tx-cu-target svg { color: var(--cu-muted); }\n.tx-cu-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; margin: 12px 0 0; padding: 28px 18px 20px; text-align: center; }\n.tx-cu-empty > svg { width: 34px; height: 34px; margin-bottom: 16px; color: var(--cu-muted); stroke-width: 1.25; }\n.tx-cu-empty h3 { margin: 0 0 8px; font-size: 15px; font-weight: 550; letter-spacing: -.2px; }\n.tx-cu-empty p { max-width: 260px; margin: 0; color: var(--cu-muted); font-size: 12px; line-height: 1.75; }\n.tx-cu-information { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin: 24px 0; font-size: 12px; }\n.tx-cu-information span { color: var(--cu-muted); }\n.tx-cu-information strong { font-weight: 500; }\n\n/* Browser tabs preserve exact target identity; the strip remains keyboard accessible. */\n.tx-cu-browser-controls { position: relative; padding: 0 10px 6px; margin: 0 -16px; border-bottom: 1px solid var(--cu-line); background: var(--cu-bg); }\n.tx-cu-tabs { display: flex; align-items: center; gap: 4px; min-width: 0; margin-bottom: 7px; }\n.tx-cu-tablist { display: flex; align-items: center; gap: 3px; min-width: 0; max-width: calc(100% - 32px); overflow-x: auto; scrollbar-width: thin; }\n.tx-cu-browser-tab { display: flex; align-items: center; flex: 0 1 180px; min-width: 100px; max-width: 200px; border-radius: 8px; }\n.tx-cu-browser-tab.is-active { background: var(--cu-hover); }\n.tx-cu-tabs .tx-cu-browser-tab [role=tab] { width: auto; min-width: 0; flex: 1; justify-content: flex-start; padding: 5px 8px; color: var(--cu-text); }\n.tx-cu-browser-tab [role=tab] > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-browser-tab .tx-cu-tab-close { width: 22px; min-height: 22px; padding: 3px; margin-right: 3px; opacity: 0; }\n.tx-cu-browser-tab:is(:hover,:focus-within,.is-active) .tx-cu-tab-close { opacity: 1; }\n.tx-cu-tabs .tx-cu-tab-close:disabled { opacity: .35; }\n.tx-cu-tabs button, .tx-cu-address button { width: 28px; min-height: 28px; padding: 5px; flex-shrink: 0; border-color: transparent; background: transparent; color: var(--cu-muted); }\n.tx-cu-address { display: flex; align-items: center; gap: 2px; margin: 0; }\n.tx-cu-browser-navigation { display: grid; grid-template-columns: minmax(0,1fr) auto 28px 28px; gap: 2px; align-items: center; }\n.tx-cu-browser-actions { display: flex; align-items: center; gap: 2px; }\n.tx-cu-browser-actions > button { width: 28px; min-height: 28px; padding: 5px; border: 0; background: transparent; color: var(--cu-muted); }\n.tx-cu-browser-actions > .is-resume { color: var(--cu-blue); }\n.tx-cu-downloads { position: relative; }\n.tx-cu-downloads > button { border: 0; background: transparent; width: 28px; min-height: 28px; padding: 5px; color: var(--cu-muted); }\n.tx-cu-download-panel { position: absolute; z-index: 31; top: calc(100% + 5px); right: -30px; width: 320px; max-width: calc(100vw - 32px); max-height: min(480px,65vh); overflow: auto; padding: 12px; border: 1px solid var(--cu-line); border-radius: 12px; background: var(--cu-bg); box-shadow: var(--cu-shadow); font-size: 12px; }\n.tx-cu-download-panel header { display: flex; align-items: center; justify-content: space-between; }\n.tx-cu-download-panel header button { border: 0; background: transparent; min-height: 26px; padding: 5px; }\n.tx-cu-download-panel ul { list-style: none; padding: 0; margin: 8px 0; }\n.tx-cu-download-panel li { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-download-panel li > svg { flex-shrink: 0; margin-top: 2px; color: var(--cu-muted); }\n.tx-cu-download-panel li > div { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }\n.tx-cu-download-panel li strong { overflow-wrap: anywhere; font-weight: 500; }\n.tx-cu-download-panel :is(small,footer) { color: var(--cu-muted); overflow-wrap: anywhere; font-size: 11px; }\n.tx-cu-download-panel progress { width: 100%; height: 4px; accent-color: var(--cu-blue); }\n.tx-cu-download-filters { display: flex; gap: 6px; margin-top: 10px; }\n.tx-cu-download-filters input { min-width: 0; width: 0; flex: 1; }\n.tx-cu-download-filters select { width: 82px; }\n.tx-cu-download-filters :is(input,select) { min-height: 28px; padding: 4px 6px; font-size: 11px; }\n.tx-cu-download-panel footer, .tx-cu-browser-popover footer { display: flex; flex-direction: column; gap: 8px; }\n.tx-cu-download-panel footer > div, .tx-cu-browser-popover footer > div { display: flex; justify-content: space-between; gap: 8px; }\n.tx-cu-download-panel footer button, .tx-cu-browser-popover footer button { min-height: 26px; padding: 3px 5px; border: 0; background: transparent; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-browser-popover { position: absolute; z-index: 32; top: 76px; right: 10px; width: min(420px,calc(100% - 20px)); max-height: min(520px,70vh); overflow: auto; padding: 12px; border: 1px solid var(--cu-line); border-radius: 12px; background: var(--cu-bg); box-shadow: var(--cu-shadow); font-size: 12px; }\n.tx-cu-browser-popover header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }\n.tx-cu-browser-popover header button { border: 0; background: transparent; min-height: 26px; padding: 5px; }\n.tx-cu-browser-popover > input { width: 100%; min-height: 30px; font-size: 12px; }\n.tx-cu-history-entries h4 { margin: 14px 0 6px; font-size: 11px; font-weight: 500; color: var(--cu-muted); }\n.tx-cu-history-link { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 4px; text-align: left; border: 0; background: transparent; }\n.tx-cu-history-link > svg { flex-shrink: 0; color: var(--cu-muted); }\n.tx-cu-history-link > span { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }\n.tx-cu-history-link strong, .tx-cu-history-link small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }\n.tx-cu-history-link small, .tx-cu-history-link time { color: var(--cu-muted); font-size: 10px; }\n.tx-cu-history-more { margin-block: 8px; width: 100%; border: 0; background: transparent; font-size: 11px; }\n.tx-cu-browser-popover footer { border-top: 1px solid var(--cu-line); padding-top: 10px; margin-top: 12px; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-browser-tools { position: relative; }\n.tx-cu-browser-tools .tx-cu-browser-options { border: 0; background: transparent; width: 28px; padding: 0; min-height: 28px; font-size: 18px; color: var(--cu-muted); }\n.tx-cu-browser-menu { position: absolute; top: calc(100% + 5px); right: 0; z-index: 30; width: 240px; max-width: calc(100vw - 32px); padding: 5px; border: 1px solid var(--cu-line); border-radius: 16px; background: var(--cu-bg); box-shadow: var(--cu-shadow); }\n.tx-cu-browser-menu button { width: 100%; justify-content: flex-start; border: 0; background: transparent; padding: 6px 8px; }\n.tx-cu-browser-menu button > span { flex: 1; text-align: left; }\n.tx-cu-browser-menu kbd { margin-left: auto; font: inherit; font-size: 10px; color: var(--cu-muted); }\n.tx-cu-browser-menu hr { border: 0; border-top: 1px solid var(--cu-line); margin: 4px 6px; }\n.tx-cu-find .is-missing { color: var(--dsw-alias-state-error-primary,#c6333d); }\n.tx-cu-device-toolbar { grid-column: 1/-1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 5px -10px -6px; padding: 6px 10px; border-block: 1px solid var(--cu-line); background: var(--cu-soft); color: var(--cu-muted); font-size: 11px; }\n.tx-cu-device-toolbar :is(input,select,button) { min-height: 26px; padding: 3px 5px; font-size: 11px; }\n.tx-cu-device-toolbar input { width: 72px; min-width: 0; appearance: textfield; text-align: center; font-weight: 550; border-color: transparent; border-radius: 10px; background: var(--cu-hover); }\n.tx-cu-device-toolbar input::-webkit-inner-spin-button { appearance: none; }\n.tx-cu-device-toolbar select { width: 80px; border-color: transparent; background: transparent; }\n.tx-cu-device-toolbar .tx-cu-device-preset { width: clamp(88px,25cqw,176px); }\n.tx-cu-device-dimensions { display: flex; align-items: center; gap: 4px; }\n.tx-cu-device-toolbar button { border-color: transparent; background: transparent; }\n.tx-cu-device-toolbar button[hidden] { display: none; }\n.tx-cu-device-toolbar .tx-cu-device-close { margin-left: auto; }\n.tx-cu-device-apply { width: 26px; }\n.tx-cu-browser-tool-progress { position: absolute; right: 12px; bottom: -20px; z-index: 5; padding: 2px 6px; border-radius: 4px; background: var(--cu-bg); font-size: 11px; color: var(--cu-muted); }\n.tx-cu-find { grid-column: 1/-1; display: flex; align-items: center; gap: 3px; padding: 5px; border: 1px solid var(--cu-line); border-radius: 8px; margin: 3px 0; }\n.tx-cu-find input { flex: 1; width: 80px; min-width: 0; border: 0; background: transparent; padding: 3px; }\n.tx-cu-find > span { font-size: 11px; white-space: nowrap; color: var(--cu-muted); }\n.tx-cu-find button { width: 25px; padding: 3px; min-height: 26px; border: 0; background: transparent; }\n.tx-cu-location { position: relative; flex: 1; min-width: 0; }\n.tx-cu-address .tx-cu-location input { width: 100%; min-height: 30px; padding: 5px 32px 5px 9px; border-color: transparent; background: transparent; }\n.tx-cu-location > span { position: absolute; inset: 5px 32px 5px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; pointer-events: none; font-size: 12px; }\n.tx-cu-location .tx-cu-open-external { position: absolute; right: 1px; top: 1px; width: 28px; }\n.tx-cu-location:focus-within > span { display: none; }\n.tx-cu-location:not(:focus-within) input:not(:placeholder-shown) { color: transparent; }\n.tx-cu-location:focus-within input { background: var(--cu-soft); }\n.tx-cu-address button[type=submit] { display: none; }\n.tx-cu-browser-open { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }\n.tx-cu-pane:has(.tx-cu-empty) .tx-cu-browser-open { justify-content: center; margin: 0 0 30px; }\n.tx-cu-pane:has(.tx-cu-empty) .tx-cu-browser-open > button { background: var(--cu-blue); border-color: transparent; color: #fff; padding-inline: 14px; }\n.tx-cu-browser-open select { flex: 1 1 100%; width: 100%; }\n.tx-cu-loading { position: absolute; inset: auto 0 -1px; height: 2px; overflow: hidden; pointer-events: none; background: color-mix(in srgb,var(--cu-blue) 12%,transparent); }\n.tx-cu-loading::before { content: ''; position: absolute; width: 35%; height: 100%; background: var(--cu-blue); animation: tx-cu-loading 1.2s ease-in-out infinite; }\n@keyframes tx-cu-loading { from { transform: translateX(-100%); } to { transform: translateX(390%); } }\n.tx-cu-tab-loading { animation: tx-cu-tab-loading 1s ease-in-out infinite alternate; }\n@keyframes tx-cu-tab-loading { to { opacity: .3; } }\n.tx-cu-pane-browser { display: flex; flex-direction: column; padding-top: 6px; padding-bottom: 0; overflow: hidden; }\n.tx-cu-pane-browser > * { flex-shrink: 0; }\n.tx-cu-pane-browser > .tx-cu-browser-controls { z-index: 3; }\n.tx-cu-pane-browser > header { margin-bottom: 8px; }\n.tx-cu-pane-browser .tx-cu-pane-heading > div { flex-direction: row; align-items: center; gap: 8px; }\n.tx-cu-pane-browser > .tx-cu-live { display: flex; flex: 1 1 0; min-height: 100px; flex-direction: column; margin-inline: -16px; border: 0; border-radius: 0; }\n.tx-cu-pane-browser > .tx-cu-live > .tx-cu-preview-stage { flex: 1 1 0; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; }\n.tx-cu-pane-browser > .tx-cu-live > :not(.tx-cu-preview-stage) { flex-shrink: 0; }\n.tx-cu-pane-browser > .tx-cu-live > .tx-cu-live-meta { order: 1; padding: 5px 12px; background: transparent; border-top: 1px solid var(--cu-line); }\n.tx-cu-pane-browser > .tx-cu-live > .tx-cu-dialog { order: 2; }\n.tx-cu-pane-browser > .tx-cu-live.is-device { align-items: center; background: var(--cu-soft); }\n.tx-cu-preview-stage { position: relative; width: 100%; min-width: 0; }\n.tx-cu-pane-browser > .tx-cu-live.is-device > .tx-cu-preview-stage { max-height: none; }\n.tx-cu-pane-browser .tx-cu-pane-support { flex: 0 1 auto; min-height: 0; max-height: 40%; overflow: auto; scrollbar-width: thin; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-setup { margin-top: 0; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-setup-toggle { padding-block: 8px; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-history { margin-block: 0; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-history summary { padding-block: 8px; }\n.tx-cu-browser-blank { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: var(--cu-bg); color: var(--cu-muted); }\n.tx-cu-browser-blank h3 { color: var(--cu-text); font-size: 15px; font-weight: 550; margin: 16px 0 8px; }\n.tx-cu-browser-blank p { font-size: 13px; margin: 0; }\n.tx-cu-live.is-blank > .tx-cu-preview-stage { overflow: hidden; }\n.tx-cu-live.is-blank .tx-cu-live-surface { visibility: hidden; }\n.tx-cu-pane-browser > .tx-cu-live.is-blank > .tx-cu-live-meta { visibility: hidden; border-color: transparent; }\n@media (prefers-reduced-motion: reduce) { .tx-cu-loading::before, .tx-cu-tab-loading { animation: none; } }\n.tx-cu-live.is-device > .tx-cu-preview-stage { display: flex; align-items: flex-start; max-height: var(--cu-preview-height,none); overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; background: #3f3f3f; }\n.tx-cu-device-frame { position: relative; width: 100%; min-width: 0; }\n.tx-cu-device-frame.is-device { box-sizing: border-box; width: calc(var(--cu-device-width) + 40px); padding: 0 20px 20px; flex-shrink: 0; margin-inline: auto; }\n.tx-cu-device-frame.is-device > .tx-cu-live-surface { width: var(--cu-device-width); }\n.tx-cu-device-frame > .tx-cu-device-handle { position: absolute; z-index: 2; min-height: 0; padding: 0; border: 0; border-radius: 0; background: transparent; color: #b9b9b9; touch-action: none; }\n.tx-cu-device-frame > .tx-cu-device-handle:hover:not(:disabled) { background: #ffffff12; }\n.tx-cu-device-frame > .tx-cu-device-handle:focus-visible { outline-offset: -3px; }\n.tx-cu-device-handle::after { content: ''; display: block; }\n.tx-cu-device-handle:is(.is-left,.is-right) { top: 0; bottom: 20px; width: 20px; cursor: ew-resize; }\n.tx-cu-device-handle.is-left { left: 0; }\n.tx-cu-device-handle.is-right { right: 0; }\n.tx-cu-device-handle:is(.is-left,.is-right)::after { width: 4px; height: 30px; border-inline: 1px solid currentColor; }\n.tx-cu-device-handle.is-bottom { bottom: 0; left: 20px; right: 20px; height: 20px; cursor: ns-resize; }\n.tx-cu-device-handle.is-bottom::after { height: 4px; width: 30px; border-block: 1px solid currentColor; }\n.tx-cu-device-handle:is(.is-bottom-left,.is-bottom-right) { bottom: 0; width: 20px; height: 20px; }\n.tx-cu-device-handle.is-bottom-left { left: 0; cursor: nesw-resize; }\n.tx-cu-device-handle.is-bottom-right { right: 0; cursor: nwse-resize; }\n.tx-cu-device-handle:is(.is-bottom-left,.is-bottom-right)::after { width: 11px; height: 4px; border-block: 1px solid currentColor; transform: rotate(45deg); }\n.tx-cu-device-handle.is-bottom-right::after { transform: rotate(-45deg); }\n.tx-cu-device-ghost-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3; }\n.tx-cu-device-ghost { position: absolute; top: 0; box-sizing: border-box; border: 2px solid var(--cu-blue); }\n.tx-cu-device-ghost-layer output { position: absolute; left: 50%; top: 6px; transform: translateX(-50%); padding: 3px 6px; border-radius: 4px; background: #252525; color: #fff; font-size: 11px; white-space: nowrap; }\n.tx-cu-live.is-device > :is(.tx-cu-live-meta,.tx-cu-dialog) { align-self: stretch; }\n@container (max-width: 320px) {\n  .tx-cu-address button[type=submit] { display: none; }\n}\n\n/* Live surfaces: image geometry is shared by the screenshot and assistant cursor. */\n.tx-cu-preview, .tx-cu-live { position: relative; overflow: hidden; border: 1px solid var(--cu-line); border-radius: 10px; }\n.tx-cu-preview img { display: block; width: 100%; height: auto; background: #fff; }\n.tx-cu-preview small { display: block; padding: 8px 10px; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-live-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; color: var(--cu-muted); font-size: 10px; background: var(--cu-soft); }\n.tx-cu-live-dot::before { content: ''; display: inline-block; width: 5px; height: 5px; margin-right: 6px; border-radius: 50%; background: #28966b; }\n.tx-cu-live-surface { position: relative; overflow: hidden; touch-action: none; overscroll-behavior: contain; line-height: 0; outline-offset: -2px; }\n.tx-cu-live-surface:focus-within { outline: 2px solid var(--cu-blue); }\n.tx-cu-live-surface > img, .tx-cu-observed-image > img { display: block; width: 100%; height: auto; user-select: none; -webkit-user-drag: none; background: #fff; }\n.tx-cu-observed-image { position: relative; line-height: 0; }\n.tx-cu-live-placeholder { display: grid; place-items: center; min-height: 220px; padding: 16px; color: var(--cu-muted); font-size: 12px; line-height: 1.5; background: var(--cu-soft); }\n.tx-cu-live-overlay { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: #171717a6; color: #fff; font-size: 12px; line-height: 1.5; pointer-events: none; }\n.tx-cu-keyboard { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; padding: 0; border: 0; pointer-events: none; resize: none; }\n.tx-cu-dialog { padding: 14px; border-top: 1px solid var(--cu-line); background: var(--cu-bg); }\n.tx-cu-dialog p { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 12px; font-size: 12px; }\n.tx-cu-dialog input { width: 100%; }\n.tx-cu-dialog > div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }\n.tx-cu-reconnect { margin: 8px; }\n.tx-cu-assistant-cursor { position: absolute; z-index: 2; pointer-events: none; transform: translate(-2px,-2px); filter: drop-shadow(0 2px 3px #0005); transition: left 35ms linear,top 35ms linear; line-height: 0; }\n.tx-cu-assistant-cursor.is-pressed { transition: none; }\n.tx-cu-assistant-cursor svg { display: block; transform-origin: 2px 2px; }\n.tx-cu-assistant-cursor.is-pressed svg { transform: scale(.9); }\n.tx-cu-cursor-pulse { position: absolute; z-index: 2; pointer-events: none; left: 2px; top: 2px; width: 22px; height: 22px; margin: -11px; border: 2px solid #fff; box-shadow: 0 0 0 1px #377cdb99; border-radius: 50%; animation: tx-cu-cursor-click .25s ease-out both; }\n@keyframes tx-cu-cursor-click { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.3); } }\n\n/* One quiet strip below the composer, plus collapsible conversation records. */\n.tx-cu-chip { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; padding: 2px 0; font-size: 11px; }\n.tx-cu-chip button { min-height: 26px; padding: 3px 7px; border-color: transparent; background: transparent; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-chip .tx-cu-entry { color: var(--cu-text); }\n.tx-cu-chip .tx-cu-entry svg { color: var(--cu-muted); }\n.tx-cu-chip-status { display: inline-flex; align-items: center; gap: 5px; margin-inline: 5px; color: var(--cu-muted); font-size: 10px; }\n.tx-cu-chip .tx-cu-chip-resume { color: var(--cu-blue); }\n.tx-cu-share { font-size: 11px; }\n.tx-cu-share-entry { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 7px; background: transparent; color: var(--cu-muted); padding: 3px 7px; font: inherit; cursor: pointer; }\n.tx-cu-share-entry:hover { background: var(--cu-hover); }\n.tx-cu-card { margin: 0; max-width: 100%; min-width: 0; }\n.tx-cu-card-heading { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; min-height: 26px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--cu-muted); text-align: left; font: var(--dsh-content-font-size-secondary, 13px)/26px -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; }\n.tx-cu-card-heading:hover { color: var(--dsw-alias-label-secondary, var(--cu-text)); }\n.tx-cu-card-heading:focus-visible, .tx-cu-group-toggle:focus-visible { outline: 2px solid var(--cu-blue); outline-offset: 2px; }\n.tx-cu-card-heading svg { flex-shrink: 0; }\n.tx-cu-card-leading { position: relative; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex-shrink: 0; }\n.tx-cu-card-chevron { position: absolute; opacity: 0; }\n.tx-cu-card-heading:is(:hover, :focus-visible, [aria-expanded=true]) .tx-cu-card-leading > svg:first-child { opacity: 0; }\n.tx-cu-card-heading:is(:hover, :focus-visible, [aria-expanded=true]) .tx-cu-card-chevron { opacity: 1; }\n.tx-cu-card-chevron, .tx-cu-disclosure { transition: transform .15s; }\n[aria-expanded=true] .tx-cu-card-chevron, [aria-expanded=true] > .tx-cu-disclosure { transform: rotate(90deg); }\n.tx-cu-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }\n.tx-cu-card-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-card-count { font-size: 10px; flex-shrink: 0; }\n.tx-cu-card-heading small { margin-left: auto; font-size: 10px; font-weight: 400; flex-shrink: 0; color: var(--cu-muted); }\n.tx-cu-card[data-state=running] .tx-cu-card-heading small { color: var(--cu-blue); }\n.tx-cu-card-body { margin: 4px 0 8px 22px; padding: 4px 10px; border-left: 1px solid var(--cu-line); overflow: hidden; }\n.tx-cu-card-body > p { font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }\n.tx-cu-card-body > details { color: var(--cu-muted); font-size: 11px; }\n.tx-cu-card-body summary { cursor: pointer; padding: 6px 0; }\n.tx-cu-card-image { display: block; max-width: 100%; max-height: 340px; border: 1px solid var(--cu-line); border-radius: 9px; margin: 10px 0; }\n.tx-cu-card pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.6 ui-monospace, monospace; max-height: 300px; overflow: auto; }\n[data-chat-flow-key]:has([data-cu-group-hidden=true]) { display: none; }\n.tx-cu-group-toggle { display: flex; align-items: center; gap: 6px; width: fit-content; max-width: 100%; min-height: 26px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-secondary, var(--cu-muted)); font: var(--dsh-content-font-size-secondary, 13px)/26px -apple-system, BlinkMacSystemFont, sans-serif; text-align: left; cursor: pointer; }\n.tx-cu-group-toggle:hover { color: var(--cu-text); }\n.tx-cu-group-toggle strong { font-weight: 400; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-group-toggle > span, .tx-cu-group-toggle > svg { flex-shrink: 0; }\n.tx-cu-group-toggle > span { font-size: 10px; }\n.tx-cu-export-files { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }\n.tx-cu-export-files button { display: flex; align-items: center; gap: 12px; max-width: 100%; padding: 7px 10px; border: 1px solid var(--cu-line); border-radius: 8px; background: var(--cu-soft); color: inherit; cursor: pointer; overflow-wrap: anywhere; }\n.tx-cu-export-files small { color: var(--cu-muted); font-size: 10px; white-space: nowrap; }\n.tx-cu-vision-warning { color: color-mix(in srgb, #a97520 85%, var(--cu-text)); font-size: 11px; line-height: 1.7; }\n.tx-cu-pane > .tx-cu-vision-warning { padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, #a97520 7%, var(--cu-bg)); }\n\n/* Setup is a compact disclosure; paths and implementation details stay inside it. */\n.tx-cu-setup { margin: 18px 0 0; border-top: 1px solid var(--cu-line); }\n.tx-cu-pane .tx-cu-setup-toggle { justify-content: space-between; width: 100%; padding: 13px 0; border: 0; border-radius: 0; background: transparent; text-align: left; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-setup-toggle > span { display: inline-flex; align-items: center; gap: 7px; }\n.tx-cu-setup-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; }\n.tx-cu-setup-row strong { font-size: 12px; font-weight: 500; }\n.tx-cu-setup p { margin: 4px 0 0; color: var(--cu-muted); font-size: 11px; line-height: 1.7; }\n.tx-cu-setup-row > span { font-size: 10px; flex-shrink: 0; }\n.tx-cu-setup .is-ready { color: var(--cu-muted); }\n.tx-cu-setup .is-ready::before { content: ''; display: inline-block; width: 5px; height: 5px; border-radius: 50%; margin-right: 5px; background: #28966b; }\n.tx-cu-setup .is-needed { color: var(--cu-muted); }\n.tx-cu-setup-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 12px 0; }\n.tx-cu-setup-actions > span { flex: 1; min-width: 160px; font-size: 10px; }\n.tx-cu-setup-advanced { font-size: 11px; margin-bottom: 10px; color: var(--cu-muted); }\n.tx-cu-setup-advanced summary { cursor: pointer; }\n.tx-cu-setup code { display: block; padding: 8px 10px; border-radius: 7px; background: var(--cu-soft); font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 8px; }\n.tx-cu-setup-install { padding: 10px 0; }\n.tx-cu-setup-install button { margin-top: 10px; }\n.tx-cu-history { margin-top: 0; border-top: 1px solid var(--cu-line); }\n.tx-cu-history summary { padding: 12px 0; color: var(--cu-muted); font-size: 11px; cursor: pointer; }\n.tx-cu-history > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; padding: 8px 0; border-top: 1px solid var(--cu-line); font-size: 11px; }\n.tx-cu-history > div > span:last-of-type { color: var(--cu-muted); font-size: 10px; }\n.tx-cu-history small { width: 100%; overflow-wrap: anywhere; }\n\n/* Sharing and annotation use the same dialog, buttons and spacing. */\n.tx-cu-share-dialog { box-sizing: border-box; width: min(540px, calc(100vw - 32px)); max-height: min(720px, 80vh); overflow: auto; padding: 20px; border: 1px solid var(--cu-line); border-radius: 16px; background: var(--cu-bg); box-shadow: var(--cu-shadow); }\n.tx-cu-share-dialog::backdrop { background: #0005; backdrop-filter: blur(3px); }\n.tx-cu-share-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.tx-cu-share-dialog header strong { font-size: 15px; font-weight: 600; letter-spacing: -.2px; }\n.tx-cu-share-dialog header button { width: 28px; min-height: 28px; padding: 5px; border-color: transparent; background: transparent; color: var(--cu-muted); }\n.tx-cu-share-dialog > p { margin: 8px 0 16px; color: var(--cu-muted); font-size: 12px; line-height: 1.65; }\n.tx-cu-share-list { display: grid; gap: 4px; }\n.tx-cu-share-list button { justify-content: flex-start; gap: 10px; padding: 11px 10px; border-color: transparent; border-radius: 10px; text-align: left; }\n.tx-cu-share-window-icon { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border: 1px solid var(--cu-line); border-radius: 8px; background: var(--cu-soft); color: var(--cu-muted); }\n.tx-cu-share-window-info { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }\n.tx-cu-share-window-info strong { font-size: 12px; font-weight: 500; }\n.tx-cu-share-window-info > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-share-list small { white-space: nowrap; color: var(--cu-blue); font-size: 10px; }\n.tx-cu-window-picker { padding: 16px; }\n.tx-cu-window-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--cu-line); border-radius: 8px; padding: 0 8px; margin-bottom: 12px; color: var(--cu-muted); }\n.tx-cu-window-search input { min-width: 0; flex: 1; width: 0; border: 0!important; background: transparent!important; padding: 9px 0!important; }\n.tx-cu-window-search button { border: 0; background: transparent; padding: 5px; }\n.tx-cu-window-picker .tx-cu-share-list { max-height: 45vh; overflow: auto; }\n.tx-cu-share-list button.is-selected { background: var(--cu-tint); }\n.tx-cu-window-picker footer { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--cu-line); }\n.tx-cu-window-picker footer small { color: var(--cu-muted); font-size: 11px; }\n.tx-cu-annotation-modes { display: flex; align-items: center; gap: 4px; font-size: 11px; }\n.tx-cu-annotation-modes button { padding: 5px 10px; border-color: transparent; background: var(--cu-soft); }\n.tx-cu-annotation-modes button[aria-pressed=true] { color: var(--cu-blue); background: var(--cu-tint); }\n.tx-cu-annotation-element { font-size: 11px; padding: 8px 0; overflow-wrap: anywhere; }\n.tx-cu-annotation-element > span { margin-left: 8px; color: var(--cu-muted); }\n.tx-cu-annotation-element pre { max-height: 140px; overflow: auto; white-space: pre-wrap; }\n.tx-cu-annotation-element summary, .tx-cu-style-editor summary { color: var(--cu-muted); cursor: pointer; }\n.tx-cu-style-editor { font-size: 11px; margin: 8px 0; }\n.tx-cu-style-editor > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0; }\n.tx-cu-style-editor label { display: flex; flex-direction: column; gap: 5px; color: var(--cu-muted); }\n.tx-cu-style-editor input { box-sizing: border-box; width: 100%; padding: 6px 8px; }\n.tx-cu-style-editor button { margin-right: 6px; }\n.tx-cu-annotation-outline { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }\n.tx-cu-annotation-outline polygon { stroke: #3877e8; stroke-width: 2px; fill: #3877e81a; }\n.tx-cu-annotation-frame { overflow-wrap: anywhere; }\n.tx-cu-annotation-dialog { width: min(1120px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 0; overflow: hidden; }\n.tx-cu-annotation-dialog[open] { display: flex; flex-direction: column; }\n.tx-cu-annotation-dialog > header { padding: 14px 16px; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-annotation-dialog > header > div { display: flex; align-items: center; gap: 12px; }\n.tx-cu-annotation-dialog > header small { font-size: 11px; color: var(--cu-muted); }\n.tx-cu-annotation-dialog > .tx-cu-annotation-modes { padding: 8px 12px; flex-wrap: wrap; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-annotation-workspace { display: grid; grid-template-columns: minmax(0,1fr) 280px; flex: 1; min-height: 0; overflow: hidden; }\n.tx-cu-annotation-viewport { min-width: 0; min-height: 0; overflow: auto; background: var(--cu-soft); padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; }\n.tx-cu-annotation-surface { position: relative; width: fit-content; max-width: 100%; flex-shrink: 0; margin: 0 auto; touch-action: none; cursor: crosshair; line-height: 0; border-radius: 6px; }\n.tx-cu-annotation-surface img { display: block; max-width: 100%; max-height: min(62vh,calc(100dvh - 230px)); user-select: none; border-radius: 6px; }\n.tx-cu-annotation-inspector { min-height: 0; overflow: auto; padding: 16px; border-left: 1px solid var(--cu-line); }\n.tx-cu-selection-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }\n.tx-cu-selection-heading small, .tx-cu-annotation-hint { color: var(--cu-muted); font-size: 10px; }\n.tx-cu-annotation-hint { padding-top: 12px; }\n.tx-cu-annotation-empty { color: var(--cu-muted); font-size: 12px; line-height: 1.7; }\n.tx-cu-annotation-comment { display: block; margin-top: 16px; font-size: 12px; color: var(--cu-muted); }\n.tx-cu-annotation-comment textarea { margin-top: 8px; }\n.tx-cu-annotation-outline.is-hover polygon { stroke-dasharray: 4 3; fill: transparent; }\n.tx-cu-annotation-region.is-hover { border-style: dashed; background: transparent; }\n.tx-cu-annotation-hover-label { position: absolute; left: 6px; top: 6px; max-width: calc(100% - 12px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--cu-blue); color: #fff; padding: 4px 6px; border-radius: 4px; font-size: 10px; line-height: 14px; pointer-events: none; }\n.tx-cu-annotation-region { position: absolute; box-sizing: border-box; border: 2px solid #3877e8; background: #3877e81a; pointer-events: none; }\n.tx-cu-annotation-dialog textarea { box-sizing: border-box; display: block; width: 100%; min-height: 70px; padding: 10px; resize: vertical; }\n.tx-cu-annotation-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--cu-line); }\n.tx-cu-annotation-dialog footer > div { display: flex; gap: 8px; }\n.tx-cu-annotation-dialog footer > small { font-size: 11px; color: var(--cu-muted); }\n@media (max-width: 680px) {\n  .tx-cu-share-dialog.tx-cu-annotation-dialog { padding: 0; }\n  .tx-cu-annotation-workspace { display: block; overflow: auto; }\n  .tx-cu-annotation-viewport { padding: 12px; }\n  .tx-cu-annotation-surface img { max-height: 34vh; }\n  .tx-cu-annotation-inspector { border-left: 0; border-top: 1px solid var(--cu-line); overflow: visible; padding: 12px; }\n  .tx-cu-annotation-dialog > header small { display: none; }\n  .tx-cu-image-dialog { width: calc(100vw - 16px); height: calc(100dvh - 16px); }\n  .tx-cu-image-dialog header { padding: 6px 8px; }\n  .tx-cu-image-dialog header > span { width: 100%; justify-content: space-between; }\n  .tx-cu-image-dialog header > div { width: 100%; justify-content: space-between; }\n}\n.tx-cu-user-message { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 0; }\n.tx-cu-user-bubble { max-width: 82%; padding: 10px 14px; border-radius: 16px; background: var(--dsw-specific-bubble, var(--cu-tint)); color: var(--cu-text); font-size: 14px; line-height: 22px; white-space: pre-wrap; overflow-wrap: anywhere; }\n.tx-cu-reference { display: inline-flex; align-items: center; gap: 4px; max-width: min(100%, 320px); padding: 1px 5px; border-radius: 5px; background: color-mix(in srgb, var(--cu-blue) 8%, transparent); color: var(--cu-blue); font-size: 12px; line-height: 20px; vertical-align: middle; white-space: nowrap; }\n.tx-cu-reference > svg { flex-shrink: 0; }\n.tx-cu-reference > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }\n.tx-cu-user-actions { display: flex; justify-content: flex-end; gap: 8px; color: var(--dsw-alias-label-tertiary, GrayText); font-size: 12px; }\n.tx-cu-user-actions button { background: transparent; border: 0; padding: 2px 4px; font: inherit; color: inherit; cursor: pointer; }\n.tx-cu-user-attachments { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }\n.tx-cu-user-file { display: flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l3, #dce3ed); padding: 10px; border-radius: 10px; }\n.tx-cu-user-file svg { width: 20px; height: 20px; }\n\n/* Compact multi-target preview. No control actor is attached to these cards. */\n.tx-cu-floating { position: fixed; inset: 0; height: 100dvh; display: flex; flex-direction: column; gap: 5px; padding: 6px; box-sizing: border-box; background: var(--cu-bg); color-scheme: light dark; }\n.tx-cu-floating header, .tx-cu-floating header > div { display: flex; align-items: center; gap: 7px; min-width: 0; }\n.tx-cu-floating header { justify-content: space-between; flex-shrink: 0; min-height: 24px; }\n.tx-cu-floating header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 500; }\n.tx-cu-floating header > div > svg { color: var(--cu-muted); }\n.tx-cu-floating header > div:first-child { flex: 1; overflow: hidden; }\n.tx-cu-floating header strong { min-width: 0; }\n.tx-cu-floating header > div:last-child { flex-shrink: 0; }\n.tx-cu-floating-count { color: var(--cu-muted); font-size: 10px; white-space: nowrap; }\n.tx-cu-floating header button { width: 24px; min-height: 24px; padding: 4px; border-color: transparent; background: transparent; color: var(--cu-muted); }\n.tx-cu-floating header > div:last-child { gap: 1px; }\n.tx-cu-floating .tx-cu-live { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--cu-soft); border-radius: 8px; overflow: hidden; }\n.tx-cu-floating .tx-cu-live-meta { display: none; }\n.tx-cu-floating .tx-cu-live-surface { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }\n.tx-cu-floating .tx-cu-observed-image { position: relative; line-height: 0; width: 100%; height: 100%; }\n.tx-cu-floating .tx-cu-observed-image img { display: block; width: 100%; height: 100%; object-fit: contain; }\n.tx-cu-floating .tx-cu-live-placeholder { min-height: 80px; font-size: 11px; }\n.tx-cu-floating footer { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-shrink: 0; min-height: 24px; font-size: 11px; color: var(--cu-muted); }\n.tx-cu-floating footer > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-floating footer button { min-height: 24px; padding: 3px 6px; font-size: 10px; border-color: transparent; background: transparent; }\n.tx-cu-floating footer .tx-cu-stop { width: 25px; height: 25px; padding: 4px; border-radius: 50%; background: var(--cu-text); color: var(--cu-bg); }\n.tx-cu-floating footer .tx-cu-stop:hover:not(:disabled) { background: color-mix(in srgb, var(--cu-text) 80%, var(--cu-bg)); }\n.tx-cu-floating footer .tx-cu-stop:disabled { color: var(--cu-muted); background: var(--cu-hover); opacity: .55; }\n.tx-cu-floating footer .tx-cu-resume { width: 25px; height: 25px; padding: 4px; border-radius: 50%; background: var(--cu-blue); color: #fff; }\n.tx-cu-floating footer .tx-cu-resume:hover:not(:disabled) { background: #2868d8; }\n.tx-cu-preview-search { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border: 1px solid var(--cu-line); border-radius: 7px; background: var(--cu-bg); color: var(--cu-muted); }\n.tx-cu-preview-search input { width: 0; min-width: 0; flex: 1; border: 0; background: transparent; padding: 4px 0; outline: 0; font: inherit; font-size: 11px; color: var(--cu-text); }\n.tx-cu-preview-search:focus-within { outline: 2px solid var(--cu-blue); outline-offset: -1px; }\n.tx-cu-preview-empty { margin: auto; padding: 16px; color: var(--cu-muted); font-size: 11px; text-align: center; }\n.tx-cu-preview-stack { position: relative; flex: 1; min-height: 0; }\n.tx-cu-preview-card { position: absolute; left: 50%; top: calc(min(var(--preview-depth), 4)*22px); width: min(var(--cu-card-max-width, 400px), calc(var(--cu-card-max-height, 400px)*var(--preview-ratio, 1.7778))); aspect-ratio: var(--preview-ratio, 1.7778); transform: translateX(calc(-50% + (min(var(--preview-count) - 1, 4)/2 - min(var(--preview-depth), 4))*28px)); overflow: hidden; border: 0; border-radius: 6px; background: var(--cu-bg); box-shadow: 0 3px 12px #00000026; }\n.tx-cu-floating .tx-cu-preview-card .tx-cu-live { height: 100%; border: 0; border-radius: 0; }\n.tx-cu-floating .tx-cu-preview-card .tx-cu-observed-image img { max-height: none; }\n.tx-cu-floating .tx-cu-preview-open { position: absolute; inset: 0; width: 100%; padding: 0; border: 0; border-radius: 0; display: flex; align-items: flex-end; justify-content: space-between; background: transparent; color: #fff; text-align: left; }\n.tx-cu-floating .tx-cu-preview-open::before { content: ''; position: absolute; inset: auto 0 0; height: 36px; pointer-events: none; background: linear-gradient(transparent, #111b); opacity: 0; transition: opacity .12s; }\n.tx-cu-floating .tx-cu-preview-open > span { position: relative; display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; font-size: 11px; line-height: 16px; opacity: 0; transition: opacity .12s; }\n.tx-cu-floating .tx-cu-preview-open:hover::before, .tx-cu-floating .tx-cu-preview-open:focus-visible::before,\n.tx-cu-floating .tx-cu-preview-open:hover > span, .tx-cu-floating .tx-cu-preview-open:focus-visible > span { opacity: 1; }\n.tx-cu-preview-open > span:first-child { flex: 1; min-width: 0; }\n.tx-cu-preview-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-floating .tx-cu-preview-open:hover:not(:disabled) { background: #ffffff08; }\n.tx-cu-preview-open:focus-visible { outline: 2px solid var(--cu-blue); outline-offset: -2px; }\n.tx-cu-preview-stack:not(.is-expanded) .tx-cu-preview-card:nth-child(n+6) { visibility: hidden; }\n.tx-cu-preview-stack.is-expanded { overflow: auto; display: flex; flex-direction: column; gap: 8px; margin: 0; scrollbar-width: thin; }\n.tx-cu-preview-stack.is-focused { margin: 0; }\n.tx-cu-preview-stack.is-focused .tx-cu-preview-card { visibility: hidden; pointer-events: none; }\n.tx-cu-preview-stack.is-focused .tx-cu-preview-card[data-focused] { visibility: visible; pointer-events: auto; top: 0; left: 50%; transform: translateX(-50%); }\n.tx-cu-preview-stack.is-expanded .tx-cu-preview-card { position: relative; inset: auto; transform: none; flex: 0 0 auto; align-self: center; max-width: 100%; }\n.tx-cu-floating > .tx-cu-error { font-size: 11px; line-height: 1.4; margin: 0; max-height: 48px; overflow: auto; }\n.tx-cu-preview-card .tx-cu-reconnect { position: relative; z-index: 5; }\n.tx-cu-preview-card[data-connection=error], .tx-cu-preview-card[data-connection=closed] { box-shadow: 0 0 0 1px var(--cu-line),0 3px 12px #00000026; }\n.tx-cu-floating-inline { inset: auto; z-index: 30; width: min(400px, calc(100vw - 24px)); height: 289px; max-height: calc(100vh - 24px); padding: 0; background: transparent; border: 0; box-shadow: none; pointer-events: none; }\n.tx-cu-floating-inline > header, .tx-cu-floating-inline > footer { pointer-events: none; opacity: 0; transition: opacity .15s; background: var(--cu-bg); border-radius: 8px; padding: 0 5px; }\n.tx-cu-floating-inline:hover > header, .tx-cu-floating-inline:hover > footer,\n.tx-cu-floating-inline:focus-within > header, .tx-cu-floating-inline:focus-within > footer { opacity: 1; pointer-events: auto; }\n.tx-cu-floating-inline .tx-cu-preview-card, .tx-cu-floating-inline > .tx-cu-error { pointer-events: auto; }\n.tx-cu-floating-inline > .tx-cu-error { background: var(--cu-bg); padding: 5px; border-radius: 6px; }\n.tx-cu-floating-inline > header { pointer-events: auto; cursor: grab; touch-action: none; user-select: none; }\n.tx-cu-floating-inline.is-dragging > header { cursor: grabbing; }\n.tx-cu-floating-inline.is-list > header, .tx-cu-floating-inline.is-list > footer { opacity: 1; pointer-events: auto; }\n.tx-cu-floating-inline > .tx-cu-preview-search { pointer-events: auto; }\n/* Keep the observer connected while host @/command menus cover the composer. */\nbody:has([role=listbox]) .tx-cu-floating-inline { visibility: hidden; pointer-events: none; }\n@media (max-width: 700px) {\n  .tx-cu-style-editor > div { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  .tx-cu-share-dialog { padding: 16px; }\n}\n@media (prefers-reduced-motion: reduce) {\n  .tx-cu-assistant-cursor, .tx-cu-card-chevron, .tx-cu-disclosure { transition: none; }\n  .tx-cu-cursor-pulse { animation: none; opacity: .6; }\n}\n";

// src/client/browser-preview.jsx
var import_react4 = __toESM(require("react"), 1);

// src/client/assistant-cursor.jsx
var import_react = __toESM(require("react"), 1);
function AssistantCursor({ cursor, frame }) {
  const [pulseExpired, setPulseExpired] = (0, import_react.useState)(null);
  const pulse = cursor?.press && cursor.source + ":" + cursor.press.sequence;
  (0, import_react.useEffect)(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulseExpired(pulse), 250);
    return () => clearTimeout(timer);
  }, [pulse]);
  if (!cursor || !frame || cursor.loaderId !== frame.loaderId || !cursor.geometry || Object.keys(cursor.geometry).some((key) => cursor.geometry[key] !== frame.geometry?.[key])) return null;
  const x = cursor.x / frame.width, y = cursor.y / frame.height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
  const pressed = cursor.buttons !== 0;
  return /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, pulse && pulseExpired !== pulse && /* @__PURE__ */ import_react.default.createElement("span", { key: pulse, "aria-hidden": "true", className: "tx-cu-cursor-pulse", style: { left: cursor.press.x / frame.width * 100 + "%", top: cursor.press.y / frame.height * 100 + "%" } }), /* @__PURE__ */ import_react.default.createElement(
    "span",
    {
      className: "tx-cu-assistant-cursor" + (pressed ? " is-pressed" : ""),
      "aria-hidden": "true",
      "data-sequence": cursor.sequence,
      "data-state": pressed ? "pressed" : "moving",
      style: { left: x * 100 + "%", top: y * 100 + "%" }
    },
    /* @__PURE__ */ import_react.default.createElement("svg", { width: "22", height: "27", viewBox: "0 0 22 27", fill: "none" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M2 2L19 14.5L11.6 15.5L7.7 22.5L2 2Z", fill: "#17191c", stroke: "white", strokeWidth: "2", strokeLinejoin: "round" }))
  ));
}

// src/client/computer-icons.jsx
var import_react2 = __toESM(require("react"), 1);
function ComputerIcon({ name = "screen", size = 16, ...props }) {
  const paths = {
    globe: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "12", cy: "12", r: "9" }), /* @__PURE__ */ import_react2.default.createElement("ellipse", { cx: "12", cy: "12", rx: "4", ry: "9" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "M3 12h18" })),
    rotate: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "3", y: "3", width: "9", height: "15", rx: "2" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "M7 15h1m8-9a6 6 0 0 1 5 6m0-5v5h-5M15 16h4a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-9" })),
    region: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M8 3H4v4m12-4h4v4M4 17v4h4m8 0h4v-4M4 11v2m16-2v2M11 3h2m-2 18h2" })),
    pointer: /* @__PURE__ */ import_react2.default.createElement("path", { d: "m5 3 14 10-7 1-3 7Z" }),
    plus: /* @__PURE__ */ import_react2.default.createElement("path", { d: "M12 5v14M5 12h14" }),
    minus: /* @__PURE__ */ import_react2.default.createElement("path", { d: "M5 12h14" }),
    reset: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M3 10a9 9 0 1 1 2 8M3 4v6h6" })),
    history: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M3 10a9 9 0 1 1 2 8M3 4v6h6m3-4v6l4 2" })),
    download: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M12 3v12m-4-4 4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" })),
    book: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M12 5v16M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2Z" })),
    terminal: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "3", y: "4", width: "18", height: "16", rx: "3" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "m7 8 3 3-3 3m6 2h4" })),
    search: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "10", cy: "10", r: "6" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "m15 15 6 6" })),
    image: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "3", y: "3", width: "18", height: "18", rx: "3" }), /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "8", cy: "8", r: "1.5" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "m3 17 5-5 4 4 4-7 5 8" })),
    screen: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "3", y: "4", width: "18", height: "13", rx: "2.5" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "M8 21h8m-4-4v4" })),
    browser: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "3", y: "3", width: "18", height: "18", rx: "3" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "M3 8h18M7 5.5h.01M10 5.5h.01" })),
    share: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "3", y: "7", width: "18", height: "14", rx: "2.5" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "M12 15V2m-4 4 4-4 4 4" })),
    preview: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2.5" }), /* @__PURE__ */ import_react2.default.createElement("rect", { x: "11", y: "11", width: "7", height: "6", rx: "1" })),
    popout: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M14 3h7v7m0-7-9 9M10 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4" })),
    return: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M10 14H3V7m0 7 9-9m2 16h4a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h-4M3 18a3 3 0 0 0 3 3h4" })),
    close: /* @__PURE__ */ import_react2.default.createElement("path", { d: "m6 6 12 12M6 18 18 6" }),
    expand: /* @__PURE__ */ import_react2.default.createElement("path", { d: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" }),
    shrink: /* @__PURE__ */ import_react2.default.createElement("path", { d: "M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5" }),
    chevron: /* @__PURE__ */ import_react2.default.createElement("path", { d: "m9 5 7 7-7 7" }),
    stack: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("rect", { x: "6", y: "8", width: "15", height: "13", rx: "2.5" }), /* @__PURE__ */ import_react2.default.createElement("path", { d: "M17 4H6a3 3 0 0 0-3 3v10" })),
    stop: /* @__PURE__ */ import_react2.default.createElement("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2", fill: "currentColor", stroke: "none" }),
    play: /* @__PURE__ */ import_react2.default.createElement("path", { d: "m8 5 11 7-11 7Z", fill: "currentColor", stroke: "none" }),
    annotate: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-6M15 3l6 6M10 14l-1 4 4-1L22 8a2 2 0 0 0-6-6Z" })),
    settings: /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M4 7h16M4 17h16" }), /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "9", cy: "7", r: "3", fill: "var(--cu-bg, Canvas)" }), /* @__PURE__ */ import_react2.default.createElement("circle", { cx: "16", cy: "17", r: "3", fill: "var(--cu-bg, Canvas)" }))
  };
  return /* @__PURE__ */ import_react2.default.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.65", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...props }, paths[name] ?? paths.screen);
}

// src/client/device-frame.jsx
var import_react3 = __toESM(require("react"), 1);
function DeviceFrame({ enabled, interactive, width, height, scale, onResize, onError, children }) {
  const drag = (0, import_react3.useRef)(null), revision = (0, import_react3.useRef)(0), [preview, setPreview] = (0, import_react3.useState)(null), [pending, setPending] = (0, import_react3.useState)(false);
  const limit = (value) => Math.max(1, Math.min(1e7, Math.round(value)));
  const cancel = () => {
    const current = drag.current;
    drag.current = null;
    setPreview(null);
    if (current?.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
  };
  (0, import_react3.useEffect)(() => {
    cancel();
    setPending(false);
    return () => {
      revision.current++;
      const current = drag.current;
      drag.current = null;
      if (current?.element.hasPointerCapture(current.id)) current.element.releasePointerCapture(current.id);
    };
  }, [enabled, width, height, scale]);
  (0, import_react3.useEffect)(() => {
    if (!interactive) cancel();
  }, [interactive]);
  const apply2 = async (size) => {
    cancel();
    if (!interactive || pending || size.width === width && size.height === height) return;
    const version = revision.current;
    setPending(true);
    try {
      await onResize(size);
    } catch (error) {
      if (version === revision.current) onError?.(error.message);
    } finally {
      if (version === revision.current) setPending(false);
    }
  };
  const start = (event, x, y) => {
    if (!interactive || pending || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, element: event.currentTarget, startX: event.clientX, startY: event.clientY, x, y, size: { width, height } };
    setPreview({ width, height });
  };
  const move = (event) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    current.size = { width: current.x ? limit(width + current.x * 2 * (event.clientX - current.startX) / scale) : width, height: current.y ? limit(height + (event.clientY - current.startY) / scale) : height };
    setPreview(current.size);
  };
  const end = (event) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    move(event);
    void apply2(current.size);
  };
  const key = (event, x, y) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    const step = event.shiftKey ? 10 : 1, delta = { ArrowLeft: -step, ArrowRight: step, ArrowUp: -step, ArrowDown: step }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    if (x && ["ArrowLeft", "ArrowRight"].includes(event.key)) void apply2({ width: limit(width + x * delta), height });
    else if (y && ["ArrowUp", "ArrowDown"].includes(event.key)) void apply2({ width, height: limit(height + delta) });
  };
  return /* @__PURE__ */ import_react3.default.createElement("div", { className: "tx-cu-device-frame" + (enabled ? " is-device" : ""), "aria-busy": pending || void 0 }, children, enabled && /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, [[1, 0, "right", "\u8C03\u6574\u8BBE\u5907\u5BBD\u5EA6\uFF08\u53F3\uFF09"], [-1, 0, "left", "\u8C03\u6574\u8BBE\u5907\u5BBD\u5EA6\uFF08\u5DE6\uFF09"], [0, 1, "bottom", "\u8C03\u6574\u8BBE\u5907\u9AD8\u5EA6"], [1, 1, "bottom-right", "\u8C03\u6574\u8BBE\u5907\u5C3A\u5BF8\uFF08\u53F3\u4E0B\uFF09"], [-1, 1, "bottom-left", "\u8C03\u6574\u8BBE\u5907\u5C3A\u5BF8\uFF08\u5DE6\u4E0B\uFF09"]].map(([x, y, position, label]) => /* @__PURE__ */ import_react3.default.createElement("button", { key: position, type: "button", className: "tx-cu-device-handle is-" + position, "aria-label": label, title: label + "\uFF1B\u65B9\u5411\u952E\u5FAE\u8C03\uFF0CShift \u52A0\u901F\uFF0CEsc \u53D6\u6D88\u62D6\u52A8", disabled: !interactive || pending, tabIndex: x && y ? -1 : 0, onPointerDown: (event) => start(event, x, y), onPointerMove: move, onPointerUp: end, onPointerCancel: cancel, onLostPointerCapture: cancel, onKeyDown: (event) => key(event, x, y) })), preview && /* @__PURE__ */ import_react3.default.createElement("div", { className: "tx-cu-device-ghost-layer", "aria-live": "off" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "tx-cu-device-ghost", style: { left: 20 + (width - preview.width) * scale / 2, width: preview.width * scale, height: preview.height * scale } }), /* @__PURE__ */ import_react3.default.createElement("output", null, preview.width, " \xD7 ", preview.height))));
}

// src/client/browser-preview.jsx
var releases = /* @__PURE__ */ new Set(["release", "pointerup", "keyup"]);
function BrowserPreview({ sessionId, tabId, pageUrl, visible, state, api: api2, url: url2, onState, onError, onNavigation, onBrowserShortcut, onFrame, onViewportResize, deviceMode = false, previewScale = "1" }) {
  const [frame, setFrame] = (0, import_react4.useState)(null), [connection, setConnection] = (0, import_react4.useState)("connecting");
  const [dialog, setDialog] = (0, import_react4.useState)(null), [prompt, setPrompt] = (0, import_react4.useState)("");
  const [reconnect, setReconnect] = (0, import_react4.useState)(0);
  const [cursor, setCursor] = (0, import_react4.useState)(null);
  const input = (0, import_react4.useRef)(null), surface = (0, import_react4.useRef)(null), current = (0, import_react4.useRef)(null), queue = (0, import_react4.useRef)([]), draining = (0, import_react4.useRef)(false);
  const pressed = (0, import_react4.useRef)(/* @__PURE__ */ new Set()), keys = (0, import_react4.useRef)(/* @__PURE__ */ new Set()), composing = (0, import_react4.useRef)(false);
  const lastPointer = (0, import_react4.useRef)(null);
  const displayedData = (0, import_react4.useRef)(null);
  const activeStream = (0, import_react4.useRef)(null);
  const stage = (0, import_react4.useRef)(null), meta = (0, import_react4.useRef)(null), [space, setSpace] = (0, import_react4.useState)({ width: 0, height: 0 });
  const [layoutSize, setLayoutSize] = (0, import_react4.useState)(null), layoutResizing = (0, import_react4.useRef)(false);
  const isDevice = deviceMode || !!state?.viewViewport?.overridden;
  (0, import_react4.useLayoutEffect)(() => {
    if (!visible || isDevice || !state?.viewViewport?.layoutSupported) return;
    const element = stage.current;
    const measure = () => {
      const size = { width: Math.round(element.clientWidth), height: Math.round(element.clientHeight) };
      if (size.width < 100 || size.height < 80) return;
      setLayoutSize((old) => old?.width === size.width && old?.height === size.height ? old : size);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [visible, isDevice, state?.viewViewport?.layoutSupported]);
  (0, import_react4.useEffect)(() => {
    if (!visible || isDevice || state?.enabled === false || state?.transitioning || !state?.viewViewport?.layoutSupported || !layoutSize || !frame?.actor || connection !== "live") return;
    if (frame.width === layoutSize.width && frame.height === layoutSize.height) return;
    let active = true, timer;
    const controller = new AbortController();
    const resize = async () => {
      layoutResizing.current = true;
      try {
        const result = await api2("view-layout", sessionId, { actor: frame.actor, tabId, controlEpoch: state.controlEpoch, size: layoutSize }, controller.signal);
        if (active && result.layout !== "applied") layoutResizing.current = false;
        if (active && result.layout === "deferred") timer = setTimeout(resize, 500);
      } catch (error) {
        if (active) {
          layoutResizing.current = false;
          if (!controller.signal.aborted) callbacks.current.onError(error.message);
        }
      }
    };
    timer = setTimeout(resize, 200);
    return () => {
      active = false;
      layoutResizing.current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [sessionId, tabId, visible, isDevice, state?.enabled, state?.transitioning, state?.controlEpoch, state?.viewViewport?.layoutSupported, layoutSize?.width, layoutSize?.height, frame?.actor, frame?.width, frame?.height, connection]);
  (0, import_react4.useLayoutEffect)(() => {
    if (!isDevice || !visible) return;
    const element = stage.current, pane = element.closest(".tx-cu-pane");
    if (!pane) return;
    const measure = () => {
      const top = element.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
      const next = { width: element.clientWidth, height: pane.classList.contains("tx-cu-pane-browser") ? element.clientHeight : Math.max(120, pane.clientHeight - top - meta.current.offsetHeight - parseFloat(getComputedStyle(pane).paddingBottom || 0)) };
      setSpace((old) => old.width === next.width && old.height === next.height ? old : next);
    };
    const resize = new ResizeObserver(measure);
    const observe = () => {
      resize.disconnect();
      resize.observe(pane);
      resize.observe(element);
      resize.observe(meta.current);
      for (const child of pane.children) if (child !== element.parentElement) resize.observe(child);
      measure();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(pane, { childList: true });
    observe();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [isDevice, visible]);
  const frameWidth = frame?.width ?? state?.viewViewport?.width ?? 390, frameHeight = frame?.height ?? state?.viewViewport?.height ?? 844;
  const scale = previewScale === "fit" ? Math.min(1, Math.max(1, (space.width || frameWidth) - 40) / frameWidth, Math.max(1, (space.height || frameHeight) - 20) / frameHeight) : Number(previewScale) || 1;
  (0, import_react4.useLayoutEffect)(() => {
    if (stage.current) {
      stage.current.scrollLeft = 0;
      stage.current.scrollTop = 0;
    }
  }, [previewScale, isDevice, frameWidth, frameHeight]);
  const enabled = (0, import_react4.useRef)(state?.enabled);
  enabled.current = state?.enabled;
  const callbacks = (0, import_react4.useRef)({ onState, onError, onNavigation, onBrowserShortcut, onFrame });
  callbacks.current = { onState, onError, onNavigation, onBrowserShortcut, onFrame };
  const stopLocalInput = () => {
    setCursor(null);
    queue.current = [];
    pressed.current.clear();
    keys.current.clear();
    input.current?.blur();
  };
  (0, import_react4.useEffect)(() => {
    if (current.current) current.current.stopped = state?.status === "stopped";
    if (["stopped", "stopping"].includes(state?.status)) setCursor(null);
  }, [state?.status]);
  (0, import_react4.useEffect)(() => {
    const element = surface.current;
    const wheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!current.current?.id) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      send({ type: "wheel", ...position(event), deltaX: Math.max(-1e4, Math.min(1e4, event.deltaX * unit)), deltaY: Math.max(-1e4, Math.min(1e4, event.deltaY * unit)) });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [sessionId, tabId, visible, state?.enabled, reconnect]);
  (0, import_react4.useEffect)(() => {
    setFrame(null);
    setDialog(null);
    setCursor(null);
    current.current = null;
    displayedData.current = null;
    callbacks.current.onFrame?.(null);
    if (!visible) return;
    let active = true, navigationObservedAt = -Infinity;
    const stream = new EventSource(url2("stream", sessionId) + "&view=1&tab=" + encodeURIComponent(tabId));
    activeStream.current = stream;
    setConnection("connecting");
    stream.addEventListener("ready", (event) => {
      if (active) current.current = JSON.parse(event.data);
    });
    stream.addEventListener("frame", (event) => {
      if (!active) return;
      const next = JSON.parse(event.data);
      if (current.current) Object.assign(current.current, { actor: next.actor, controlEpoch: next.controlEpoch, stopped: next.stopped, transitioning: next.transitioning });
      if (displayedData.current === next.data) {
        current.current = next;
        callbacks.current.onFrame?.(next);
      }
      setFrame(next);
      setConnection("live");
    });
    stream.addEventListener("control", (event) => {
      const next = JSON.parse(event.data);
      if (current.current && next.controlEpoch !== current.current.controlEpoch) stopLocalInput();
      if (current.current) Object.assign(current.current, next);
      if (current.current?.data) callbacks.current.onFrame?.({ ...current.current });
      if (next.stopped || next.transitioning) setCursor(null);
    });
    stream.addEventListener("cursor", (event) => {
      if (!active) return;
      const next = JSON.parse(event.data), observed = current.current;
      if (!next) {
        setCursor(null);
        return;
      }
      if (next.tabId === tabId && observed && next.controlEpoch === observed.controlEpoch && !observed.stopped && !observed.transitioning) setCursor(next);
    });
    stream.addEventListener("dialog", (event) => {
      const next = JSON.parse(event.data);
      setDialog(next);
      setPrompt(next?.defaultPrompt ?? "");
    });
    stream.addEventListener("navigation", (event) => {
      if (!active) return;
      const value = JSON.parse(event.data);
      if ((value.observedAt ?? 0) < navigationObservedAt) return;
      navigationObservedAt = value.observedAt ?? 0;
      setCursor(null);
      if (current.current?.loaderId && value.loaderId !== current.current.loaderId) {
        current.current.id = void 0;
        setConnection("connecting");
        callbacks.current.onFrame?.(null);
      }
      callbacks.current.onNavigation(value);
    });
    stream.addEventListener("warning", (event) => {
      callbacks.current.onError(JSON.parse(event.data).message);
    });
    stream.addEventListener("failure", (event) => {
      callbacks.current.onError(JSON.parse(event.data).message);
      setConnection("error");
      stream.close();
      stopLocalInput();
      callbacks.current.onFrame?.(null);
    });
    stream.addEventListener("closed", (event) => {
      const data = JSON.parse(event.data);
      if (!["target-changed", "tab-closed"].includes(data.reason)) callbacks.current.onError(data.message);
      setConnection("closed");
      stream.close();
      stopLocalInput();
      current.current = null;
      callbacks.current.onFrame?.(null);
    });
    stream.onerror = () => {
      if (active) {
        setConnection("connecting");
        stopLocalInput();
        current.current = null;
        callbacks.current.onFrame?.(null);
      }
    };
    return () => {
      active = false;
      stream.close();
      if (activeStream.current === stream) activeStream.current = null;
      stopLocalInput();
      current.current = null;
      callbacks.current.onFrame?.(null);
    };
  }, [sessionId, tabId, visible, state?.enabled, reconnect]);
  const drain = async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length) {
        const item = queue.current.shift();
        try {
          const next = await api2("input", sessionId, item);
          if (current.current?.actor === item.actor && current.current.controlEpoch === item.controlEpoch) {
            current.current.stopped = next.status === "stopped";
            callbacks.current.onState(next);
          }
        } catch (error) {
          queue.current = queue.current.filter((q) => q.actor !== item.actor || q.controlEpoch !== item.controlEpoch || releases.has(q.type));
          if (current.current?.actor === item.actor && current.current.controlEpoch === item.controlEpoch) {
            pressed.current.clear();
            keys.current.clear();
            callbacks.current.onError(error.message);
            if (!releases.has(item.type)) queue.current.push({ ...item, type: "release" });
          }
        }
      }
    } finally {
      draining.current = false;
    }
  };
  const send = (value) => {
    if (layoutResizing.current && value.type !== "dialog" && !releases.has(value.type)) return;
    if (enabled.current === false && value.type !== "dialog" && !releases.has(value.type)) return;
    const observed = current.current;
    if (observed?.transitioning && value.type !== "dialog") return;
    if (!observed?.actor || !observed.id && !["release", "dialog"].includes(value.type)) return;
    const item = { ...value, actor: observed.actor, tabId, frameId: observed.id, controlEpoch: observed.controlEpoch };
    if (!releases.has(value.type)) setCursor(null);
    const last = queue.current.at(-1);
    if (item.type === "pointermove" && last?.type === item.type && last.actor === item.actor && last.controlEpoch === item.controlEpoch) queue.current[queue.current.length - 1] = item;
    else queue.current.push(item);
    void drain();
  };
  const release = () => {
    if (pressed.current.size || keys.current.size) send({ type: "release" });
    pressed.current.clear();
    keys.current.clear();
  };
  const position = (event) => {
    const rect = surface.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const modifiers = (event) => {
    for (const [key, flag] of [["Meta", "metaKey"], ["Control", "ctrlKey"], ["Alt", "altKey"], ["Shift", "shiftKey"]]) {
      if (event[flag] && !keys.current.has(key)) {
        keys.current.add(key);
        send({ type: "keydown", key });
      }
      if (!event[flag] && keys.current.delete(key)) send({ type: "keyup", key });
    }
  };
  const keyDown = (event) => {
    event.stopPropagation();
    if (event.isComposing || composing.current || event.key === "Process" || event.key === "Dead") return;
    const shortcut = event.metaKey || event.ctrlKey ? { l: "focus", f: "find", j: "downloads", h: "history", y: event.metaKey ? "history" : void 0, t: "new", w: "close", r: "reload", "[": "back", "]": "forward" }[event.key.toLowerCase()] : event.altKey ? { ArrowLeft: "back", ArrowRight: "forward" }[event.key] : null;
    if (shortcut) {
      event.preventDefault();
      release();
      callbacks.current.onBrowserShortcut(shortcut);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") return;
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) return;
    event.preventDefault();
    modifiers(event);
    if (!["Meta", "Control", "Alt", "Shift"].includes(event.key)) {
      keys.current.add(event.key);
      send({ type: "keydown", key: event.key });
    }
  };
  const keyUp = (event) => {
    event.stopPropagation();
    if (keys.current.delete(event.key)) {
      event.preventDefault();
      send({ type: "keyup", key: event.key });
    }
    modifiers(event);
  };
  const insert = (text) => {
    if (text) send({ type: "text", text });
    if (input.current) input.current.value = "";
  };
  const blank = pageUrl === "about:blank" && state?.enabled !== false && !["closed", "error"].includes(connection);
  const placeholder = state?.enabled === false ? "Computer Use \u5DF2\u505C\u7528" : connection === "closed" ? "\u9875\u9762\u5DF2\u65AD\u5F00" : connection === "error" ? "\u65E0\u6CD5\u83B7\u53D6\u9875\u9762\u753B\u9762" : "\u6B63\u5728\u83B7\u53D6\u9875\u9762\u2026";
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tx-cu-live" + (isDevice ? " is-device" : "") + (blank ? " is-blank" : ""), "data-connection": connection, style: isDevice ? { "--cu-device-width": frameWidth * scale + "px", "--cu-preview-height": space.height ? space.height + "px" : void 0 } : void 0, "aria-label": "\u6D4F\u89C8\u5668\u5B9E\u65F6\u753B\u9762" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tx-cu-live-meta", ref: meta }, /* @__PURE__ */ import_react4.default.createElement("span", { className: connection === "live" ? "tx-cu-live-dot" : "" }, connection === "live" ? state?.resuming ? "\u6B63\u5728\u6062\u590D" : state?.status === "running" ? "\u52A9\u624B\u6B63\u5728\u64CD\u4F5C" : state?.status === "stopped" ? "\u4F60\u6B63\u5728\u63A7\u5236" : "\u5C31\u7EEA" : connection === "connecting" ? "\u6B63\u5728\u8FDE\u63A5\u753B\u9762\u2026" : "\u753B\u9762\u5DF2\u65AD\u5F00"), /* @__PURE__ */ import_react4.default.createElement("span", null, state?.status === "stopped" ? "\u53EF\u5728\u5DE5\u5177\u680F\u6062\u590D\u52A9\u624B" : "\u70B9\u51FB\u753B\u9762\u63A5\u7BA1")), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tx-cu-preview-stage", ref: stage }, /* @__PURE__ */ import_react4.default.createElement(DeviceFrame, { enabled: isDevice, interactive: visible && state?.enabled !== false && !state?.transitioning && !state?.resuming && connection === "live" && !dialog && !!onViewportResize, width: frameWidth, height: frameHeight, scale, onResize: onViewportResize, onError }, /* @__PURE__ */ import_react4.default.createElement(
    "div",
    {
      className: "tx-cu-live-surface",
      ref: surface,
      "aria-hidden": blank || void 0,
      onContextMenu: (e) => e.preventDefault(),
      onPointerDown: (e) => {
        if (connection !== "live" || dialog || layoutResizing.current) return;
        e.preventDefault();
        e.stopPropagation();
        input.current?.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        modifiers(e);
        pressed.current.add(e.button);
        lastPointer.current = position(e);
        send({ type: "pointerdown", ...lastPointer.current, button: e.button, clickCount: Math.min(3, Math.max(1, e.detail)) });
      },
      onPointerMove: (e) => {
        if (!dialog && (pressed.current.size || current.current?.stopped)) {
          lastPointer.current = position(e);
          send({ type: "pointermove", ...lastPointer.current });
        }
      },
      onPointerUp: (e) => {
        if (!pressed.current.has(e.button)) return;
        e.preventDefault();
        const next = position(e);
        if (!dialog && (next.x !== lastPointer.current?.x || next.y !== lastPointer.current?.y)) send({ type: "pointermove", ...next });
        send({ type: "pointerup", button: e.button });
        pressed.current.delete(e.button);
        if (!pressed.current.size && e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      },
      onLostPointerCapture: release,
      onPointerCancel: release
    },
    frame ? /* @__PURE__ */ import_react4.default.createElement("img", { src: "data:" + frame.mediaType + ";base64," + frame.data, alt: "\u5F53\u524D\u6D4F\u89C8\u5668\u9875\u9762\uFF1B\u70B9\u51FB\u53EF\u63A5\u7BA1\u64CD\u4F5C", draggable: false, onError: () => {
      activeStream.current?.close();
      setConnection("error");
      stopLocalInput();
      current.current = null;
      callbacks.current.onFrame?.(null);
      callbacks.current.onError("\u753B\u9762\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8FDE");
    }, onLoad: () => {
      displayedData.current = frame.data;
      if (current.current?.actor === frame.actor) {
        current.current = { ...frame, controlEpoch: current.current.controlEpoch, stopped: current.current.stopped, transitioning: current.current.transitioning };
        callbacks.current.onFrame?.(frame);
      }
    } }) : /* @__PURE__ */ import_react4.default.createElement("div", { className: "tx-cu-live-placeholder", role: "status" }, placeholder),
    visible && enabled.current && connection === "live" && !dialog && !frame?.browserCursor && /* @__PURE__ */ import_react4.default.createElement(AssistantCursor, { cursor, frame }),
    /* @__PURE__ */ import_react4.default.createElement(
      "textarea",
      {
        ref: input,
        className: "tx-cu-keyboard",
        "aria-label": "\u6D4F\u89C8\u5668\u952E\u76D8\u8F93\u5165",
        autoCapitalize: "off",
        autoCorrect: "off",
        spellCheck: false,
        onBlur: release,
        onKeyDown: keyDown,
        onKeyUp: keyUp,
        onCompositionStart: () => {
          composing.current = true;
        },
        onCompositionEnd: (e) => {
          composing.current = false;
          insert(e.currentTarget.value);
        },
        onInput: (e) => {
          if (!composing.current) insert(e.currentTarget.value);
        },
        onPaste: (e) => {
          e.preventDefault();
          e.stopPropagation();
          insert(e.clipboardData.getData("text/plain"));
        }
      }
    ),
    connection !== "live" && frame && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tx-cu-live-overlay" }, connection === "connecting" ? "\u8FDE\u63A5\u4E2D\uFF0C\u7A0D\u540E\u53EF\u7EE7\u7EED\u64CD\u4F5C" : "\u753B\u9762\u5DF2\u65AD\u5F00")
  )), blank && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tx-cu-browser-blank" }, /* @__PURE__ */ import_react4.default.createElement(ComputerIcon, { name: "globe", size: 28 }), /* @__PURE__ */ import_react4.default.createElement("h3", null, "\u5F00\u59CB\u6D4F\u89C8"), /* @__PURE__ */ import_react4.default.createElement("p", null, "\u8F93\u5165 URL \u4EE5\u6253\u5F00\u9875\u9762"))), ["closed", "error"].includes(connection) && /* @__PURE__ */ import_react4.default.createElement("button", { className: "tx-cu-reconnect", onClick: () => {
    callbacks.current.onError("");
    setReconnect((n) => n + 1);
  } }, "\u91CD\u8FDE\u753B\u9762"), dialog && /* @__PURE__ */ import_react4.default.createElement("form", { className: "tx-cu-dialog", onSubmit: (e) => {
    e.preventDefault();
    send({ type: "dialog", dialogId: dialog.id, accept: true, text: prompt });
  } }, /* @__PURE__ */ import_react4.default.createElement("strong", null, dialog.type === "prompt" ? "\u7F51\u9875\u8BF7\u6C42\u8F93\u5165" : "\u7F51\u9875\u63D0\u793A"), /* @__PURE__ */ import_react4.default.createElement("p", null, dialog.message), dialog.type === "prompt" && /* @__PURE__ */ import_react4.default.createElement("input", { "aria-label": "\u7F51\u9875\u63D0\u793A\u8F93\u5165", value: prompt, onChange: (e) => setPrompt(e.target.value) }), /* @__PURE__ */ import_react4.default.createElement("div", null, dialog.type !== "alert" && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: () => send({ type: "dialog", dialogId: dialog.id, accept: false }) }, "\u53D6\u6D88"), /* @__PURE__ */ import_react4.default.createElement("button", { className: "tx-cu-primary" }, "\u786E\u5B9A"))));
}

// src/client/native-preview.jsx
var import_react5 = __toESM(require("react"), 1);
function NativePreview({ sessionId, targetId, targetKind = "app", stacked = false, visible, state, url: url2, onError, onFrameSize, onConnection }) {
  const [frame, setFrame] = (0, import_react5.useState)(null), [connection, setConnection] = (0, import_react5.useState)("connecting"), [reconnect, setReconnect] = (0, import_react5.useState)(0);
  const [cursor, setCursor] = (0, import_react5.useState)(null);
  const [displayed, setDisplayed] = (0, import_react5.useState)(null);
  const error = (0, import_react5.useRef)(onError);
  error.current = onError;
  const connectionCallback = (0, import_react5.useRef)(onConnection);
  connectionCallback.current = onConnection;
  (0, import_react5.useEffect)(() => {
    connectionCallback.current?.(connection);
  }, [connection]);
  (0, import_react5.useEffect)(() => {
    setFrame(null);
    setDisplayed(null);
    setCursor(null);
    if (!visible || state?.enabled === false) {
      setConnection("disabled");
      return;
    }
    let active = true, control = {};
    const stream = new EventSource(url2("stream", sessionId) + "&" + (targetKind === "tab" ? "tab" : "app") + "=" + encodeURIComponent(targetId) + (stacked ? "&stack=1" : ""));
    setConnection("connecting");
    stream.addEventListener("frame", (event) => {
      if (active) {
        const next = JSON.parse(event.data);
        control = next;
        if (next.stopped || next.transitioning) setCursor(null);
        setFrame(next);
        setConnection("live");
      }
    });
    stream.addEventListener("cursor", (event) => {
      if (active) {
        const next = JSON.parse(event.data);
        if (!next || targetKind !== "tab" || next.tabId === targetId && next.controlEpoch === control.controlEpoch && !control.stopped && !control.transitioning) setCursor(next);
      }
    });
    stream.addEventListener("control", (event) => {
      if (active) {
        const value = JSON.parse(event.data);
        if (value.controlEpoch !== control.controlEpoch) setCursor(null);
        Object.assign(control, value);
        if (value.stopped || value.transitioning) setCursor(null);
      }
    });
    stream.addEventListener("navigation", (event) => {
      if (active) {
        setCursor(null);
        const next = JSON.parse(event.data);
        if (control.loaderId && next.loaderId !== control.loaderId) {
          control = {};
          setConnection("connecting");
        }
      }
    });
    stream.addEventListener("capture", (event) => {
      if (active) {
        const { status } = JSON.parse(event.data);
        if (status !== "live") setConnection(status === "paused" ? "paused" : "connecting");
      }
    });
    stream.addEventListener("failure", (event) => {
      if (active) {
        error.current(JSON.parse(event.data).message);
        setConnection("error");
        stream.close();
      }
    });
    stream.addEventListener("closed", (event) => {
      if (active) {
        const value = JSON.parse(event.data);
        if (value.reason !== "target-changed") error.current(value.message);
        setConnection("closed");
        stream.close();
      }
    });
    stream.onerror = () => {
      if (active) {
        setCursor(null);
        control = {};
        setConnection("connecting");
      }
    };
    return () => {
      active = false;
      stream.close();
    };
  }, [sessionId, targetId, targetKind, stacked, visible, reconnect, state?.enabled]);
  (0, import_react5.useEffect)(() => {
    if (["stopped", "stopping"].includes(state?.status)) setCursor(null);
  }, [state?.status]);
  (0, import_react5.useEffect)(() => {
    if (frame?.data === displayed?.data && frame !== displayed) setDisplayed(frame);
  }, [frame, displayed]);
  const label = connection === "live" ? "\u5B9E\u65F6\u753B\u9762" : connection === "connecting" ? "\u6B63\u5728\u8FDE\u63A5\u753B\u9762\u2026" : connection === "paused" ? "\u5E94\u7528\u753B\u9762\u5DF2\u6682\u505C" : connection === "disabled" ? "Computer Use \u5DF2\u5173\u95ED" : "\u753B\u9762\u5DF2\u65AD\u5F00";
  return /* @__PURE__ */ import_react5.default.createElement("div", { className: "tx-cu-live tx-cu-native-preview", "data-connection": connection, "aria-label": targetKind === "tab" ? "\u7F51\u9875\u60AC\u6D6E\u5B9E\u65F6\u753B\u9762" : "\u5E94\u7528\u5B9E\u65F6\u753B\u9762" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "tx-cu-live-meta" }, /* @__PURE__ */ import_react5.default.createElement("span", { className: connection === "live" ? "tx-cu-live-dot" : "" }, label), /* @__PURE__ */ import_react5.default.createElement("span", null, state?.status === "running" ? "\u52A9\u624B\u6B63\u5728\u64CD\u4F5C" : "\u53EA\u8BFB\u9884\u89C8")), /* @__PURE__ */ import_react5.default.createElement("div", { className: "tx-cu-live-surface" }, /* @__PURE__ */ import_react5.default.createElement("div", { className: "tx-cu-observed-image" }, frame ? /* @__PURE__ */ import_react5.default.createElement("img", { src: "data:" + frame.mediaType + ";base64," + frame.data, alt: targetKind === "app" ? "\u5F53\u524D\u5E94\u7528\u7A97\u53E3\u7684\u5B9E\u65F6\u753B\u9762" : "\u5F53\u524D\u7F51\u9875\u7684\u5B9E\u65F6\u753B\u9762", draggable: false, onError: () => {
    setConnection("error");
    error.current("\u753B\u9762\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8FDE");
  }, onLoad: (event) => {
    if (event.currentTarget.src === "data:" + frame.mediaType + ";base64," + frame.data) {
      setDisplayed(frame);
      onFrameSize?.({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
    }
  } }) : /* @__PURE__ */ import_react5.default.createElement("div", { className: "tx-cu-live-placeholder", role: "status" }, ["disabled", "closed", "error", "paused"].includes(connection) ? label : targetKind === "tab" ? "\u6B63\u5728\u83B7\u53D6\u7F51\u9875\u753B\u9762\u2026" : "\u6B63\u5728\u83B7\u53D6\u5E94\u7528\u7A97\u53E3\u2026"), visible && state?.enabled && connection === "live" && !["stopped", "stopping"].includes(state?.status) && /* @__PURE__ */ import_react5.default.createElement(AssistantCursor, { cursor, frame: displayed })), connection !== "live" && frame && /* @__PURE__ */ import_react5.default.createElement("div", { className: "tx-cu-live-overlay" }, label)), ["closed", "error"].includes(connection) && /* @__PURE__ */ import_react5.default.createElement("button", { className: "tx-cu-reconnect", onClick: () => {
    error.current("");
    setReconnect((value) => value + 1);
  } }, "\u91CD\u8FDE\u753B\u9762"));
}

// src/client/browser-controls.jsx
var import_react10 = __toESM(require("react"), 1);

// src/client/browser-tools.jsx
var import_react7 = __toESM(require("react"), 1);

// src/client/tool-image.jsx
var import_react6 = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");
function ImageDialog({ src, onClose }) {
  const dialog = (0, import_react6.useRef)(null), canvas = (0, import_react6.useRef)(null), drag = (0, import_react6.useRef)(null), moved = (0, import_react6.useRef)(false), [original, setOriginal] = (0, import_react6.useState)(false), [size, setSize] = (0, import_react6.useState)(null), [zoom, setZoom] = (0, import_react6.useState)(1), [space, setSpace] = (0, import_react6.useState)({ width: 0, height: 0 }), [failed, setFailed] = (0, import_react6.useState)(false), [retry, setRetry] = (0, import_react6.useState)(0), [panning, setPanning] = (0, import_react6.useState)(false);
  const fit = size && space.width ? Math.min(1, Math.max(1, space.width - 32) / size.width, Math.max(1, space.height - 32) / size.height) : 1;
  const scale = original ? zoom : fit;
  const zoomBy = (direction) => {
    const steps = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4], next = direction > 0 ? steps.find((value) => value > scale + 1e-3) : steps.slice().reverse().find((value) => value < scale - 1e-3);
    if (next) {
      setOriginal(true);
      setZoom(next);
    }
  };
  const toggle = () => {
    setOriginal((value) => !value);
    setZoom(1);
  };
  (0, import_react6.useLayoutEffect)(() => {
    const opener = document.activeElement, element = dialog.current;
    element.showModal();
    const observe = () => setSpace({ width: canvas.current.clientWidth, height: canvas.current.clientHeight }), observer = new ResizeObserver(observe);
    observer.observe(canvas.current);
    observe();
    return () => {
      observer.disconnect();
      element.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  (0, import_react6.useLayoutEffect)(() => {
    if (!original && canvas.current) {
      canvas.current.scrollLeft = 0;
      canvas.current.scrollTop = 0;
    }
  }, [original]);
  const release = (event) => {
    if (drag.current) {
      drag.current = null;
      setPanning(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  return (0, import_react_dom.createPortal)(/* @__PURE__ */ import_react6.default.createElement("dialog", { ref: dialog, className: "tx-cu-image-dialog", "aria-label": "\u622A\u56FE\u9884\u89C8", onCancel: (event) => {
    event.preventDefault();
    onClose();
  }, onKeyDown: (event) => {
    event.stopPropagation();
    if (["+", "=", "-", "0"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "0") {
        setOriginal(false);
        setZoom(1);
      } else zoomBy(event.key === "-" ? -1 : 1);
    }
  } }, /* @__PURE__ */ import_react6.default.createElement("header", null, /* @__PURE__ */ import_react6.default.createElement("span", null, "\u622A\u56FE", size && /* @__PURE__ */ import_react6.default.createElement("small", null, size.width, " \xD7 ", size.height)), /* @__PURE__ */ import_react6.default.createElement("div", null, /* @__PURE__ */ import_react6.default.createElement("button", { type: "button", "aria-label": "\u7F29\u5C0F\u622A\u56FE", title: "\u7F29\u5C0F\uFF08\u2212\uFF09", disabled: !size || scale <= 0.1, onClick: () => zoomBy(-1) }, /* @__PURE__ */ import_react6.default.createElement(ComputerIcon, { name: "minus", size: 15 })), /* @__PURE__ */ import_react6.default.createElement("output", { "aria-label": "\u622A\u56FE\u7F29\u653E\u6BD4\u4F8B" }, Math.round(scale * 100), "%"), /* @__PURE__ */ import_react6.default.createElement("button", { type: "button", "aria-label": "\u653E\u5927\u622A\u56FE", title: "\u653E\u5927\uFF08+\uFF09", disabled: !size || scale >= 4, onClick: () => zoomBy(1) }, /* @__PURE__ */ import_react6.default.createElement(ComputerIcon, { name: "plus", size: 15 })), /* @__PURE__ */ import_react6.default.createElement("button", { type: "button", className: "tx-cu-image-fit", onClick: toggle }, original ? "\u9002\u5E94\u7A97\u53E3" : "\u5B9E\u9645\u5927\u5C0F"), /* @__PURE__ */ import_react6.default.createElement("a", { href: src, download: "computer-use-screenshot.png", title: "\u4E0B\u8F7D\u622A\u56FE" }, /* @__PURE__ */ import_react6.default.createElement(ComputerIcon, { name: "download", size: 15 }), /* @__PURE__ */ import_react6.default.createElement("span", null, "\u4E0B\u8F7D")), /* @__PURE__ */ import_react6.default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u622A\u56FE\u9884\u89C8", title: "\u5173\u95ED\uFF08Esc\uFF09", autoFocus: true, onClick: onClose }, /* @__PURE__ */ import_react6.default.createElement(ComputerIcon, { name: "close" })))), /* @__PURE__ */ import_react6.default.createElement("div", { ref: canvas, tabIndex: 0, "aria-label": "\u622A\u56FE\u753B\u5E03", className: "tx-cu-image-canvas" + (original ? " is-original" : "") + (panning ? " is-panning" : ""), onDoubleClick: (event) => {
    if (!event.target.closest("button,a") && !failed) toggle();
  }, onClick: (event) => {
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (!original && (event.target === event.currentTarget || event.target.classList.contains("tx-cu-image-stage"))) onClose();
  }, onPointerDown: (event) => {
    moved.current = false;
    if (event.button !== 0 || !original) return;
    if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth && event.currentTarget.scrollHeight <= event.currentTarget.clientHeight) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanning(true);
  }, onPointerMove: (event) => {
    const start = drag.current;
    if (start) {
      moved.current ||= Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3;
      event.currentTarget.scrollLeft = start.left + start.x - event.clientX;
      event.currentTarget.scrollTop = start.top + start.y - event.clientY;
    }
  }, onPointerUp: release, onPointerCancel: release, onLostPointerCapture: () => {
    drag.current = null;
    setPanning(false);
  } }, failed ? /* @__PURE__ */ import_react6.default.createElement("div", { className: "tx-cu-image-failure", role: "alert" }, "\u622A\u56FE\u52A0\u8F7D\u5931\u8D25", /* @__PURE__ */ import_react6.default.createElement("button", { type: "button", onClick: () => {
    setFailed(false);
    setRetry((value) => value + 1);
  } }, "\u91CD\u8BD5")) : /* @__PURE__ */ import_react6.default.createElement("div", { className: "tx-cu-image-stage" }, /* @__PURE__ */ import_react6.default.createElement("img", { key: retry, src, alt: "Computer Use \u622A\u56FE\u5927\u56FE", draggable: false, style: size ? { width: size.width * scale, height: size.height * scale } : void 0, onError: () => setFailed(true), onLoad: (event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }) }))), /* @__PURE__ */ import_react6.default.createElement("footer", null, "\u53CC\u51FB\u5207\u6362\u5B9E\u9645\u5927\u5C0F \xB7 \u653E\u5927\u540E\u62D6\u52A8\u67E5\u770B \xB7 Esc \u5173\u95ED")), document.body);
}
function SavedImage({ attachment, loadImage }) {
  const [src, setSrc] = (0, import_react6.useState)(""), [error, setError] = (0, import_react6.useState)(""), [retry, setRetry] = (0, import_react6.useState)(0), [open, setOpen] = (0, import_react6.useState)(false);
  (0, import_react6.useEffect)(() => {
    let active = true;
    setSrc("");
    setError("");
    setOpen(false);
    if (loadImage) void loadImage(attachment).then((value) => {
      if (active) setSrc(value);
    }).catch((error2) => {
      if (active) setError(error2.message || "\u622A\u56FE\u52A0\u8F7D\u5931\u8D25");
    });
    return () => {
      active = false;
    };
  }, [attachment, loadImage, retry]);
  if (error) return /* @__PURE__ */ import_react6.default.createElement("button", { type: "button", className: "tx-cu-image-retry", onClick: () => setRetry((value) => value + 1), title: error }, "\u622A\u56FE\u52A0\u8F7D\u5931\u8D25 \xB7 \u91CD\u8BD5");
  return src ? /* @__PURE__ */ import_react6.default.createElement(import_react6.default.Fragment, null, /* @__PURE__ */ import_react6.default.createElement("button", { type: "button", className: "tx-cu-image-button", "aria-label": "\u67E5\u770B\u622A\u56FE\u5927\u56FE", onClick: () => setOpen(true) }, /* @__PURE__ */ import_react6.default.createElement("img", { className: "tx-cu-card-image", src, alt: "Computer Use \u622A\u56FE", onError: () => setError("\u622A\u56FE\u65E0\u6CD5\u663E\u793A\uFF0C\u8BF7\u91CD\u8BD5") })), open && /* @__PURE__ */ import_react6.default.createElement(ImageDialog, { src, onClose: () => setOpen(false) })) : /* @__PURE__ */ import_react6.default.createElement("span", { className: "tx-cu-image-loading", role: "status" }, "\u6B63\u5728\u52A0\u8F7D\u622A\u56FE\u2026");
}

// src/client/browser-tools.jsx
var presets = { phone: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 800 } };
var BrowserTools = (0, import_react7.forwardRef)(function BrowserTools2({ sessionId, target, frame, state, api: api2, onState, onError, previewScale = "1", onPreviewScale, onDeviceModeChange, popupOpen, onMenuOpen, onOpenHistory, onOpenDownloads }, ref) {
  const [menu, setMenu] = (0, import_react7.useState)(false), [devices, setDevices] = (0, import_react7.useState)(false), [width, setWidth] = (0, import_react7.useState)(""), [height, setHeight] = (0, import_react7.useState)(""), [busy, setBusy] = (0, import_react7.useState)(false), [image, setImage] = (0, import_react7.useState)(null);
  const anchor = (0, import_react7.useRef)(null), trigger = (0, import_react7.useRef)(null), request = (0, import_react7.useRef)(null), generation = (0, import_react7.useRef)(0), latest = (0, import_react7.useRef)(null);
  const [finding, setFinding] = (0, import_react7.useState)(false), [query, setQuery] = (0, import_react7.useState)(""), [findResult, setFindResult] = (0, import_react7.useState)(null), [composing, setComposing] = (0, import_react7.useState)(false);
  const findInput = (0, import_react7.useRef)(null), attempted = (0, import_react7.useRef)(null), pendingFind = (0, import_react7.useRef)(null);
  const findDocument = (0, import_react7.useRef)(null);
  (0, import_react7.useEffect)(() => {
    if (popupOpen) setMenu(false);
  }, [popupOpen]);
  (0, import_react7.useEffect)(() => {
    if (!frame?.loaderId) return;
    if (findDocument.current && findDocument.current !== frame.loaderId) {
      setFindResult(null);
      attempted.current = query;
      pendingFind.current = null;
    }
    findDocument.current = frame.loaderId;
  }, [frame?.loaderId]);
  (0, import_react7.useEffect)(() => {
    onDeviceModeChange?.(devices);
  }, [devices, onDeviceModeChange]);
  latest.current = { frame, state, target, onState, onError };
  (0, import_react7.useEffect)(() => {
    setMenu(false);
    setDevices(false);
    setImage(null);
    setBusy(false);
    return () => {
      generation.current++;
      request.current?.abort();
    };
  }, [sessionId, target?.id]);
  (0, import_react7.useEffect)(() => {
    setFinding(false);
    setQuery("");
    setFindResult(null);
    attempted.current = null;
    pendingFind.current = null;
  }, [sessionId, target?.id]);
  (0, import_react7.useEffect)(() => {
    if (finding) {
      findInput.current?.focus();
      findInput.current?.select();
    }
  }, [finding]);
  const openFind = () => {
    setFinding(true);
    findInput.current?.focus();
    findInput.current?.select();
  };
  const closeFind = () => {
    if (request.current?.operation === "view-find") request.current.abort();
    setFinding(false);
    attempted.current = query;
    pendingFind.current = null;
    trigger.current?.focus();
  };
  (0, import_react7.useImperativeHandle)(ref, () => ({ openFind, focus: () => trigger.current?.focus(), resizeViewport: (size) => action("view-viewport", { size }) }));
  (0, import_react7.useEffect)(() => {
    if (frame?.width && frame?.height) {
      setWidth(String(Math.round(frame.width)));
      setHeight(String(Math.round(frame.height)));
    }
  }, [frame?.width, frame?.height]);
  (0, import_react7.useEffect)(() => {
    if (state?.viewViewport?.overridden) setDevices(true);
  }, [target?.id, state?.viewViewport?.overridden]);
  (0, import_react7.useEffect)(() => {
    if (!menu) return;
    anchor.current?.querySelector("[role=menuitem]:not(:disabled)")?.focus();
    const outside = (event) => {
      if (!anchor.current?.contains(event.target)) setMenu(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menu]);
  const closeMenu = () => {
    setMenu(false);
    trigger.current?.focus();
  };
  const action = async (op, value = {}) => {
    if (request.current) return false;
    const current = latest.current, observed = current.frame, version = generation.current;
    if (!observed?.actor || observed.tabId !== current.target?.id) {
      current.onError("\u7B49\u5F85\u5F53\u524D\u7F51\u9875\u753B\u9762\u5C31\u7EEA\u540E\u91CD\u8BD5");
      return false;
    }
    const controller = new AbortController();
    controller.operation = op;
    request.current = controller;
    setBusy(true);
    try {
      const result = await api2(op, sessionId, { ...value, actor: observed.actor, tabId: observed.tabId, controlEpoch: current.state.controlEpoch }, controller.signal);
      if (version !== generation.current || latest.current.target?.id !== observed.tabId) return false;
      if (op === "view-screenshot") setImage("data:" + result.mediaType + ";base64," + result.data);
      else latest.current.onState(result);
      if (op === "view-find") setFindResult(result.find);
      latest.current.onError("");
      return true;
    } catch (error) {
      if (!controller.signal.aborted && version === generation.current) latest.current.onError(error.message);
      return false;
    } finally {
      if (request.current === controller) request.current = null;
      if (version === generation.current) setBusy(false);
    }
  };
  const ready = !!frame?.actor && frame.tabId === target?.id && target?.url !== "about:blank" && state?.enabled !== false && !state?.transitioning && !busy;
  const find = (backward = false) => {
    if (query && !composing) {
      if (request.current) {
        pendingFind.current = { query, backward };
        return;
      }
      attempted.current = query;
      void action("view-find", { query, backward });
    }
  };
  (0, import_react7.useEffect)(() => {
    if (!finding || !query || composing || !ready) return;
    const queued = pendingFind.current?.query === query ? pendingFind.current : null;
    if (attempted.current === query && !queued) return;
    const timer = setTimeout(() => {
      pendingFind.current = null;
      attempted.current = query;
      void action("view-find", queued ?? { query });
    }, queued ? 0 : 200);
    return () => clearTimeout(timer);
  }, [finding, query, composing, ready]);
  const resize = (size) => action("view-viewport", { size });
  const hideDevices = () => {
    const close = () => {
      setDevices(false);
      trigger.current?.focus();
    };
    if (state?.viewViewport?.overridden) void resize(null).then((ok) => {
      if (ok) close();
    });
    else close();
  };
  const menuKey = (event) => {
    if (!menu) {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        onMenuOpen?.();
        setMenu(true);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...anchor.current.querySelectorAll("[role=menuitem]:not(:disabled)")], at = items.indexOf(document.activeElement);
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  };
  return /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("div", { ref: anchor, className: "tx-cu-browser-tools", onKeyDown: menuKey }, /* @__PURE__ */ import_react7.default.createElement("button", { ref: trigger, type: "button", className: "tx-cu-browser-options", "aria-label": "\u6D4F\u89C8\u5668\u9009\u9879", title: "\u6D4F\u89C8\u5668\u9009\u9879", "aria-haspopup": "menu", "aria-expanded": menu, onClick: () => {
    if (!menu) onMenuOpen?.();
    setMenu((value) => !value);
  } }, "\u22EE"), menu && /* @__PURE__ */ import_react7.default.createElement("div", { className: "tx-cu-browser-menu", role: "menu", "aria-label": "\u6D4F\u89C8\u5668\u9009\u9879" }, /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "menuitem", disabled: !ready, onClick: () => {
    closeMenu();
    openFind();
  } }, /* @__PURE__ */ import_react7.default.createElement("span", null, "\u5728\u9875\u9762\u4E2D\u67E5\u627E"), /* @__PURE__ */ import_react7.default.createElement("kbd", { "aria-hidden": "true" }, "\u2318/Ctrl F")), /* @__PURE__ */ import_react7.default.createElement("hr", null), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "menuitem", disabled: !ready, onClick: () => {
    closeMenu();
    if (devices) hideDevices();
    else setDevices(true);
  } }, devices ? "\u9690\u85CF\u8BBE\u5907\u5DE5\u5177\u680F" : "\u663E\u793A\u8BBE\u5907\u5DE5\u5177\u680F"), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "menuitem", disabled: !ready, onClick: () => {
    closeMenu();
    void action("view-screenshot");
  } }, "\u622A\u53D6\u5C4F\u5E55\u622A\u56FE"), /* @__PURE__ */ import_react7.default.createElement("hr", null), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "menuitem", disabled: !onOpenDownloads, onClick: () => {
    closeMenu();
    onOpenDownloads?.();
  } }, /* @__PURE__ */ import_react7.default.createElement("span", null, "\u4E0B\u8F7D"), /* @__PURE__ */ import_react7.default.createElement("kbd", { "aria-hidden": "true" }, "\u2318/Ctrl J")), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", role: "menuitem", disabled: !onOpenHistory, onClick: () => {
    closeMenu();
    onOpenHistory?.();
  } }, /* @__PURE__ */ import_react7.default.createElement("span", null, "\u5386\u53F2\u8BB0\u5F55")))), finding && /* @__PURE__ */ import_react7.default.createElement("form", { role: "search", "aria-label": "\u9875\u9762\u5185\u67E5\u627E", className: "tx-cu-find", onSubmit: (event) => {
    event.preventDefault();
    find();
  }, onKeyDown: (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeFind();
    } else if (event.key === "Enter" && event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      find(true);
    }
  } }, /* @__PURE__ */ import_react7.default.createElement("input", { ref: findInput, "aria-label": "\u67E5\u627E\u6587\u5B57", type: "search", placeholder: "\u5728\u9875\u9762\u4E2D\u67E5\u627E", value: query, onChange: (event) => setQuery(event.target.value), onCompositionStart: () => setComposing(true), onCompositionEnd: () => setComposing(false) }), /* @__PURE__ */ import_react7.default.createElement("span", { role: "status", className: findResult?.query === query && !findResult.found ? "is-missing" : "" }, request.current?.operation === "view-find" ? "\u6B63\u5728\u67E5\u627E\u2026" : findResult?.query === query ? findResult.found ? findResult.wrapped ? "\u5DF2\u56DE\u5230\u8D77\u70B9" : "\u5DF2\u627E\u5230" : "\u672A\u627E\u5230" : query ? "\u6309 Enter \u67E5\u627E" : ""), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", "aria-label": "\u4E0A\u4E00\u5904", title: "\u4E0A\u4E00\u5904\uFF08Shift+Enter\uFF09", disabled: !ready || !query || composing, onClick: () => find(true) }, "\u2191"), /* @__PURE__ */ import_react7.default.createElement("button", { type: "submit", "aria-label": "\u4E0B\u4E00\u5904", title: "\u4E0B\u4E00\u5904\uFF08Enter\uFF09", disabled: !ready || !query || composing }, "\u2193"), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u9875\u9762\u67E5\u627E", title: "\u5173\u95ED\uFF08Esc\uFF09", onClick: closeFind }, /* @__PURE__ */ import_react7.default.createElement(ComputerIcon, { name: "close", size: 12 }))), devices && /* @__PURE__ */ import_react7.default.createElement("form", { className: "tx-cu-device-toolbar", "aria-label": "\u8BBE\u5907\u5DE5\u5177\u680F", title: "\u4EC5\u8C03\u6574\u7F51\u9875\u89C6\u53E3\u5C3A\u5BF8\uFF0C\u4E0D\u6A21\u62DF\u8BBE\u5907\u578B\u53F7\u3001\u89E6\u6478\u6216\u6D4F\u89C8\u5668\u7C7B\u578B", onSubmit: (event) => {
    event.preventDefault();
    void resize({ width: Number(width), height: Number(height) });
  } }, /* @__PURE__ */ import_react7.default.createElement("span", null, "\u5C3A\u5BF8\uFF1A"), /* @__PURE__ */ import_react7.default.createElement("select", { className: "tx-cu-device-preset", "aria-label": "\u89C6\u53E3\u5C3A\u5BF8\u9884\u8BBE", disabled: !ready, value: Object.keys(presets).find((key) => presets[key].width === Number(width) && presets[key].height === Number(height)) ?? "custom", onChange: (event) => {
    const value = presets[event.target.value];
    if (value) void resize(value);
  } }, /* @__PURE__ */ import_react7.default.createElement("option", { value: "custom" }, "\u54CD\u5E94\u5F0F"), /* @__PURE__ */ import_react7.default.createElement("option", { value: "phone" }, "\u624B\u673A\u5C3A\u5BF8"), /* @__PURE__ */ import_react7.default.createElement("option", { value: "tablet" }, "\u5E73\u677F\u5C3A\u5BF8"), /* @__PURE__ */ import_react7.default.createElement("option", { value: "desktop" }, "\u684C\u9762\u5C3A\u5BF8")), /* @__PURE__ */ import_react7.default.createElement("div", { className: "tx-cu-device-dimensions" }, /* @__PURE__ */ import_react7.default.createElement("input", { "aria-label": "\u89C6\u53E3\u5BBD\u5EA6", type: "number", min: "1", max: "10000000", required: true, value: width, disabled: !ready, onChange: (event) => setWidth(event.target.value) }), /* @__PURE__ */ import_react7.default.createElement("span", null, "\xD7"), /* @__PURE__ */ import_react7.default.createElement("input", { "aria-label": "\u89C6\u53E3\u9AD8\u5EA6", type: "number", min: "1", max: "10000000", required: true, value: height, disabled: !ready, onChange: (event) => setHeight(event.target.value) })), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", "aria-label": "\u65CB\u8F6C\u89C6\u53E3", title: "\u4EA4\u6362\u5BBD\u9AD8", disabled: !ready, onClick: () => void resize({ width: Number(height), height: Number(width) }) }, /* @__PURE__ */ import_react7.default.createElement(ComputerIcon, { name: "rotate", size: 15 })), /* @__PURE__ */ import_react7.default.createElement("button", { type: "submit", className: "tx-cu-device-apply", title: "\u5E94\u7528\u5C3A\u5BF8\uFF08Enter\uFF09", "aria-label": "\u5E94\u7528\u89C6\u53E3\u5C3A\u5BF8", disabled: !ready, hidden: Number(width) === Math.round(frame?.width) && Number(height) === Math.round(frame?.height) }, "\u21B5"), /* @__PURE__ */ import_react7.default.createElement("select", { "aria-label": "\u8BBE\u5907\u9884\u89C8\u7F29\u653E", title: "\u4EC5\u7F29\u653E\u9884\u89C8\u663E\u793A\uFF0C\u4E0D\u6539\u53D8\u7F51\u9875\u5C3A\u5BF8\u6216\u63A5\u7BA1\u63A7\u5236", value: previewScale, onChange: (event) => onPreviewScale?.(event.target.value) }, /* @__PURE__ */ import_react7.default.createElement("option", { value: "fit" }, "\u9002\u5E94\u7A97\u53E3"), [0.25, 0.5, 0.75, 1, 1.25, 1.5].map((scale) => /* @__PURE__ */ import_react7.default.createElement("option", { key: scale, value: String(scale) }, scale * 100, "%"))), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", "aria-label": "\u91CD\u7F6E", title: "\u91CD\u7F6E\u5C3A\u5BF8", disabled: !ready, onClick: () => void resize(null) }, /* @__PURE__ */ import_react7.default.createElement(ComputerIcon, { name: "reset", size: 13 })), /* @__PURE__ */ import_react7.default.createElement("button", { type: "button", className: "tx-cu-device-close", "aria-label": "\u5173\u95ED\u8BBE\u5907\u5DE5\u5177\u680F", title: "\u5173\u95ED\u8BBE\u5907\u5DE5\u5177\u680F", disabled: !ready, onClick: hideDevices }, /* @__PURE__ */ import_react7.default.createElement(ComputerIcon, { name: "close", size: 12 }))), busy && /* @__PURE__ */ import_react7.default.createElement("span", { className: "tx-cu-browser-tool-progress", role: "status" }, "\u6B63\u5728\u5904\u7406\u2026"), image && /* @__PURE__ */ import_react7.default.createElement(ImageDialog, { src: image, onClose: () => setImage(null) }));
});

// src/client/browser-downloads.jsx
var import_react8 = __toESM(require("react"), 1);
var bytes = (value) => value >= 1048576 ? (value / 1048576).toFixed(1) + " MB" : value >= 1024 ? (value / 1024).toFixed(1) + " KB" : Math.max(0, value || 0) + " B";
function BrowserDownloads({ sessionId, visible, api: api2, active, onActiveChange }) {
  const [localOpen, setLocalOpen] = (0, import_react8.useState)(false), [items, setItems] = (0, import_react8.useState)(null), [error, setError] = (0, import_react8.useState)("");
  const [query, setQuery] = (0, import_react8.useState)(""), [filter, setFilter] = (0, import_react8.useState)("all"), [reload, setReload] = (0, import_react8.useState)(0), [clearing, setClearing] = (0, import_react8.useState)(false), [mutationError, setMutationError] = (0, import_react8.useState)("");
  const open = active ?? localOpen, setOpen = onActiveChange ?? setLocalOpen;
  const root = (0, import_react8.useRef)(null), trigger = (0, import_react8.useRef)(null), revision = (0, import_react8.useRef)(0), mutating = (0, import_react8.useRef)(false), alive = (0, import_react8.useRef)(true);
  (0, import_react8.useEffect)(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      revision.current++;
    };
  }, [sessionId]);
  (0, import_react8.useEffect)(() => {
    setOpen(false);
    setItems(null);
    setError("");
  }, [sessionId]);
  (0, import_react8.useEffect)(() => {
    if (!open || !visible) return;
    let active2 = true, timer;
    const controller = new AbortController();
    const refresh = async () => {
      const generation = revision.current;
      try {
        if (mutating.current) return;
        const result = await api2("downloads", sessionId, void 0, controller.signal);
        if (active2 && generation === revision.current) {
          setItems(result.downloads);
          setError("");
        }
      } catch (error2) {
        if (active2) setError(error2.message);
      } finally {
        if (active2) timer = setTimeout(refresh, 1e3);
      }
    };
    void refresh();
    return () => {
      active2 = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, visible, sessionId, api2, reload]);
  (0, import_react8.useEffect)(() => {
    if (!open) return;
    root.current?.querySelector('[aria-label="\u5173\u95ED\u4E0B\u8F7D\u8BB0\u5F55"]')?.focus();
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const clear = async () => {
    revision.current++;
    mutating.current = true;
    setClearing(true);
    setMutationError("");
    try {
      const result = await api2("downloads-clear", sessionId, {});
      if (alive.current) setItems(result.downloads);
    } catch (error2) {
      if (alive.current) setMutationError(error2.message);
    } finally {
      mutating.current = false;
      if (alive.current) setClearing(false);
    }
  };
  const filtered = (items ?? []).filter((item) => (filter === "all" || filter === "active" && ["inProgress", "unobserved"].includes(item.state) || filter === item.state) && item.filename.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return /* @__PURE__ */ import_react8.default.createElement("div", { className: "tx-cu-downloads", ref: root, onKeyDown: (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  } }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", ref: trigger, disabled: !visible, "aria-label": "\u4E0B\u8F7D\u8BB0\u5F55", title: "\u4E0B\u8F7D\u8BB0\u5F55", "aria-haspopup": "dialog", "aria-expanded": open, onClick: () => setOpen(!open) }, /* @__PURE__ */ import_react8.default.createElement(ComputerIcon, { name: "download" })), open && visible && /* @__PURE__ */ import_react8.default.createElement("section", { className: "tx-cu-download-panel", role: "dialog", "aria-label": "\u5F53\u524D\u4F1A\u8BDD\u4E0B\u8F7D\u8BB0\u5F55" }, /* @__PURE__ */ import_react8.default.createElement("header", null, /* @__PURE__ */ import_react8.default.createElement("strong", null, "\u4E0B\u8F7D\u8BB0\u5F55"), /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u4E0B\u8F7D\u8BB0\u5F55", onClick: close }, /* @__PURE__ */ import_react8.default.createElement(ComputerIcon, { name: "close", size: 14 }))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "tx-cu-download-filters" }, /* @__PURE__ */ import_react8.default.createElement("input", { type: "search", "aria-label": "\u641C\u7D22\u4E0B\u8F7D\u6587\u4EF6", placeholder: "\u641C\u7D22\u6587\u4EF6\u540D", value: query, onChange: (event) => setQuery(event.target.value) }), /* @__PURE__ */ import_react8.default.createElement("select", { "aria-label": "\u7B5B\u9009\u4E0B\u8F7D\u8BB0\u5F55", value: filter, onChange: (event) => setFilter(event.target.value) }, /* @__PURE__ */ import_react8.default.createElement("option", { value: "all" }, "\u5168\u90E8"), /* @__PURE__ */ import_react8.default.createElement("option", { value: "active" }, "\u8FDB\u884C\u4E2D"), /* @__PURE__ */ import_react8.default.createElement("option", { value: "completed" }, "\u5DF2\u5B8C\u6210"), /* @__PURE__ */ import_react8.default.createElement("option", { value: "canceled" }, "\u5DF2\u53D6\u6D88"))), (error || mutationError) && /* @__PURE__ */ import_react8.default.createElement("p", { role: "alert", className: "tx-cu-error" }, mutationError || error), !items && !error && /* @__PURE__ */ import_react8.default.createElement("p", { role: "status" }, "\u6B63\u5728\u8BFB\u53D6\u2026"), items?.length === 0 && /* @__PURE__ */ import_react8.default.createElement("p", null, "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u4E0B\u8F7D\u8BB0\u5F55"), !!items?.length && filtered.length === 0 && /* @__PURE__ */ import_react8.default.createElement("p", null, "\u6CA1\u6709\u5339\u914D\u7684\u4E0B\u8F7D\u8BB0\u5F55"), !!filtered.length && /* @__PURE__ */ import_react8.default.createElement("ul", null, filtered.map((item) => /* @__PURE__ */ import_react8.default.createElement("li", { key: item.id }, /* @__PURE__ */ import_react8.default.createElement(ComputerIcon, { name: "download" }), /* @__PURE__ */ import_react8.default.createElement("div", null, /* @__PURE__ */ import_react8.default.createElement("strong", { title: item.filename }, item.filename), /* @__PURE__ */ import_react8.default.createElement("small", null, item.state === "completed" ? "\u5DF2\u5B8C\u6210" : item.state === "canceled" ? "\u5DF2\u53D6\u6D88\u6216\u4E2D\u65AD" : item.state === "unobserved" ? "\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u72B6\u6001\u5F85\u786E\u8BA4" : "\u4E0B\u8F7D\u4E2D", " \xB7 ", bytes(item.receivedBytes), item.totalBytes > 0 && item.state === "inProgress" ? " / " + bytes(item.totalBytes) : ""), item.state === "inProgress" && /* @__PURE__ */ import_react8.default.createElement("progress", { "aria-label": item.filename + " \u4E0B\u8F7D\u8FDB\u5EA6", value: item.totalBytes > 0 ? item.receivedBytes : void 0, max: item.totalBytes || 1 }), item.source && /* @__PURE__ */ import_react8.default.createElement("small", null, item.source), item.canDownload ? /* @__PURE__ */ import_react8.default.createElement("a", { href: "/trisoul-x/computer-use/download-file?session=" + encodeURIComponent(sessionId) + "&id=" + encodeURIComponent(item.id), download: item.filename }, "\u4FDD\u5B58\u6587\u4EF6") : item.state === "completed" && /* @__PURE__ */ import_react8.default.createElement("small", null, item.browserId === "browser" ? "\u6587\u4EF6\u6682\u4E0D\u53EF\u8BFB\u53D6" : "\u6587\u4EF6\u4FDD\u5B58\u5728\u539F\u6D4F\u89C8\u5668\u7684\u4E0B\u8F7D\u4F4D\u7F6E"))))), /* @__PURE__ */ import_react8.default.createElement("footer", null, /* @__PURE__ */ import_react8.default.createElement("span", null, "\u4EC5\u663E\u793A\u5F53\u524D\u4F1A\u8BDD\u63A5\u5165\u540E\u6355\u83B7\u7684\u4E0B\u8F7D"), /* @__PURE__ */ import_react8.default.createElement("div", null, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", onClick: () => setReload((value) => value + 1) }, "\u5237\u65B0"), /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", title: "\u79FB\u9664\u5DF2\u5B8C\u6210\u6216\u53D6\u6D88\u7684\u8BB0\u5F55\uFF0C\u4E0D\u5220\u9664\u6587\u4EF6", disabled: clearing || !items?.some((item) => ["completed", "canceled"].includes(item.state)), onClick: () => void clear() }, clearing ? "\u6B63\u5728\u6E05\u9664\u2026" : "\u6E05\u9664\u5DF2\u7ED3\u675F\u8BB0\u5F55")))));
}

// src/client/browser-history.jsx
var import_react9 = __toESM(require("react"), 1);
function BrowserHistoryPanel({ sessionId, api: api2, onOpen, onClose }) {
  const [entries, setEntries] = (0, import_react9.useState)(null), [query, setQuery] = (0, import_react9.useState)(""), [error, setError] = (0, import_react9.useState)(""), [busy, setBusy] = (0, import_react9.useState)(false), [limit, setLimit] = (0, import_react9.useState)(100);
  const root = (0, import_react9.useRef)(null), search = (0, import_react9.useRef)(null), active = (0, import_react9.useRef)(true), request = (0, import_react9.useRef)(null);
  const load = async (clear = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const result = await api2(clear ? "browser-history-clear" : "browser-history", sessionId, clear ? {} : void 0, controller.signal);
      if (active.current && !controller.signal.aborted) {
        setEntries(result.entries);
        setError(result.warning ?? "");
      }
    } catch (error2) {
      if (active.current && !controller.signal.aborted) setError(error2.message);
    } finally {
      if (active.current && request.current === controller) setBusy(false);
    }
  };
  (0, import_react9.useEffect)(() => {
    active.current = true;
    search.current?.focus();
    void load();
    const outside = (event) => {
      if (!root.current?.contains(event.target) && !event.target.closest(".tx-cu-browser-options")) onClose(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      active.current = false;
      request.current?.abort();
      document.removeEventListener("pointerdown", outside);
    };
  }, [sessionId]);
  const filtered = (entries ?? []).filter((entry) => (entry.title + " " + entry.url).toLocaleLowerCase().includes(query.toLocaleLowerCase())), shown = filtered.slice(0, limit);
  const open = async (entry) => {
    setBusy(true);
    try {
      if (await onOpen(entry) !== false) onClose(false);
      else if (active.current) setError("\u9875\u9762\u672A\u80FD\u6253\u5F00\uFF0C\u8BF7\u68C0\u67E5\u6D4F\u89C8\u5668\u8FDE\u63A5\u540E\u91CD\u8BD5");
    } catch (error2) {
      if (active.current) setError(error2.message);
    } finally {
      if (active.current) setBusy(false);
    }
  };
  let day;
  return /* @__PURE__ */ import_react9.default.createElement("section", { ref: root, className: "tx-cu-history-panel tx-cu-browser-popover", role: "dialog", "aria-label": "\u6D4F\u89C8\u5386\u53F2", onKeyDown: (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    }
  } }, /* @__PURE__ */ import_react9.default.createElement("header", null, /* @__PURE__ */ import_react9.default.createElement("strong", null, "\u6D4F\u89C8\u5386\u53F2"), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u6D4F\u89C8\u5386\u53F2", onClick: () => onClose(true) }, /* @__PURE__ */ import_react9.default.createElement(ComputerIcon, { name: "close", size: 14 }))), /* @__PURE__ */ import_react9.default.createElement("input", { ref: search, type: "search", "aria-label": "\u641C\u7D22\u6D4F\u89C8\u5386\u53F2", placeholder: "\u641C\u7D22\u6807\u9898\u6216\u7F51\u5740", value: query, onChange: (event) => {
    setQuery(event.target.value);
    setLimit(100);
  } }), error && /* @__PURE__ */ import_react9.default.createElement("p", { role: "alert", className: "tx-cu-error" }, error), !entries && !error && /* @__PURE__ */ import_react9.default.createElement("p", { role: "status" }, "\u6B63\u5728\u8BFB\u53D6\u2026"), entries && shown.length === 0 && /* @__PURE__ */ import_react9.default.createElement("p", null, query ? "\u6CA1\u6709\u5339\u914D\u7684\u8BB0\u5F55" : "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u6D4F\u89C8\u8BB0\u5F55"), /* @__PURE__ */ import_react9.default.createElement("div", { className: "tx-cu-history-entries" }, shown.map((entry) => {
    const date = new Date(entry.visitedAt), label = date.toLocaleDateString(), heading = day !== label;
    day = label;
    let host = entry.url;
    try {
      host = new URL(entry.url).host || entry.url;
    } catch {
    }
    return /* @__PURE__ */ import_react9.default.createElement(import_react9.default.Fragment, { key: entry.id }, heading && /* @__PURE__ */ import_react9.default.createElement("h4", null, label), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", className: "tx-cu-history-link", title: entry.url, disabled: busy, onClick: () => void open(entry) }, /* @__PURE__ */ import_react9.default.createElement(ComputerIcon, { name: "browser" }), /* @__PURE__ */ import_react9.default.createElement("span", null, /* @__PURE__ */ import_react9.default.createElement("strong", null, entry.title || host), /* @__PURE__ */ import_react9.default.createElement("small", null, host)), /* @__PURE__ */ import_react9.default.createElement("time", null, date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))));
  })), filtered.length > limit && /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", className: "tx-cu-history-more", onClick: () => setLimit((value) => value + 100) }, "\u663E\u793A\u66F4\u591A\uFF08", filtered.length - limit, "\uFF09"), /* @__PURE__ */ import_react9.default.createElement("footer", null, /* @__PURE__ */ import_react9.default.createElement("span", null, "\u4EC5\u672C\u4F1A\u8BDD\u63A5\u5165\u540E\u7684\u8BB0\u5F55\uFF1B\u70B9\u51FB\u5728\u539F\u6D4F\u89C8\u5668\u65B0\u5EFA\u6807\u7B7E\u9875"), /* @__PURE__ */ import_react9.default.createElement("div", null, /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", disabled: busy, onClick: () => void load() }, "\u5237\u65B0"), /* @__PURE__ */ import_react9.default.createElement("button", { type: "button", disabled: busy || !entries?.length, title: "\u53EA\u6E05\u9664\u6B64\u5904\u8BB0\u5F55\uFF0C\u4E0D\u6E05\u7406\u6D4F\u89C8\u5668\u6570\u636E", onClick: () => void load(true) }, "\u6E05\u9664\u672C\u4F1A\u8BDD\u8BB0\u5F55"))));
}

// src/client/browser-controls.jsx
var Icon = ({ kind }) => /* @__PURE__ */ import_react10.default.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", "aria-hidden": "true" }, kind === "back" ? /* @__PURE__ */ import_react10.default.createElement("path", { d: "m14 6-6 6 6 6" }) : kind === "forward" ? /* @__PURE__ */ import_react10.default.createElement("path", { d: "m10 6 6 6-6 6" }) : kind === "new" ? /* @__PURE__ */ import_react10.default.createElement("path", { d: "M12 5v14M5 12h14" }) : kind === "close" ? /* @__PURE__ */ import_react10.default.createElement("path", { d: "m6 6 12 12M6 18 18 6" }) : /* @__PURE__ */ import_react10.default.createElement(import_react10.default.Fragment, null, /* @__PURE__ */ import_react10.default.createElement("path", { d: "M20 11a8 8 0 1 0-2 6M20 4v7h-7" })));
var tabLabel = (tab) => tab.url === "about:blank" ? "\u65B0\u6807\u7B7E\u9875" : tab.title || tab.url;
var BrowserControls = (0, import_react10.forwardRef)(function BrowserControls2({ sessionId, state, visible, navigation, frame, api: api2, onState, onError, previewScale, onPreviewScale, onDeviceModeChange, actions }, ref) {
  const [tabSnapshot, setTabSnapshot] = (0, import_react10.useState)({ sessionId: null, tabs: [] }), [address, setAddress] = (0, import_react10.useState)(""), [busy, setBusy] = (0, import_react10.useState)(false);
  const editing = (0, import_react10.useRef)(false), addressInput = (0, import_react10.useRef)(null), pending = (0, import_react10.useRef)(null), keyboardTarget = (0, import_react10.useRef)(null);
  const navigationClient = (0, import_react10.useRef)(crypto.randomUUID()), sequence = (0, import_react10.useRef)(0);
  const addressObservation = (0, import_react10.useRef)(0);
  const [panel, setPanel] = (0, import_react10.useState)(null);
  (0, import_react10.useEffect)(() => {
    setPanel(null);
  }, [sessionId]);
  (0, import_react10.useEffect)(() => {
    if (!visible || state?.enabled === false) setPanel(null);
  }, [visible, state?.enabled]);
  const viewed = state?.viewTarget ?? state?.target, target = viewed?.kind === "tab" ? viewed : null;
  const tabs = tabSnapshot.sessionId === sessionId ? tabSnapshot.tabs : [];
  const tabList = (0, import_react10.useRef)(null), tools = (0, import_react10.useRef)(null);
  (0, import_react10.useEffect)(() => {
    tabList.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [target?.id, tabs.length]);
  const latest = (0, import_react10.useRef)({ state, target, onState, onError });
  latest.current = { state, target, onState, onError };
  (0, import_react10.useEffect)(() => {
    addressObservation.current = 0;
    editing.current = false;
    setAddress(target?.url === "about:blank" ? "" : target?.url ?? "");
    if (keyboardTarget.current === target?.id) {
      tabList.current?.querySelector('[aria-selected="true"]')?.focus();
      keyboardTarget.current = null;
    } else if (target?.url === "about:blank") addressInput.current?.focus();
  }, [target?.id]);
  (0, import_react10.useEffect)(() => {
    if (!editing.current && !pending.current && navigation && target && navigation.tabId === target.id && (navigation.observedAt ?? 0) >= addressObservation.current) {
      addressObservation.current = navigation.observedAt ?? 0;
      setAddress(navigation.url === "about:blank" ? "" : navigation.url);
    }
  }, [navigation, target?.id, busy]);
  (0, import_react10.useEffect)(() => {
    if (!visible || !sessionId || state?.enabled === false) return;
    let active = true, timer;
    const refresh = async () => {
      try {
        const result = await api2("tabs", sessionId);
        if (active) setTabSnapshot({ sessionId, tabs: result.tabs });
      } catch (error) {
        if (active) latest.current.onError(error.message);
      }
      if (active) timer = setTimeout(refresh, 1500);
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sessionId, visible, target?.id, state?.enabled]);
  const act = async (op, value) => {
    const replacing = op === "navigate" && pending.current?.op === "navigate" && pending.current.tabId === value.tabId;
    if ((pending.current || latest.current.state?.transitioning) && !replacing) {
      latest.current.onError("\u6D4F\u89C8\u5668\u6B63\u5728\u5207\u6362\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      return false;
    }
    const request = { op, tabId: value.tabId, sequence: ++sequence.current };
    pending.current = request;
    setBusy(true);
    try {
      const next = await api2(op, sessionId, { ...value, controlEpoch: latest.current.state?.controlEpoch ?? 0, ...op === "navigate" ? { navigationClient: navigationClient.current, navigationSequence: request.sequence, navigationRevision: latest.current.state?.navigationRevision ?? 0 } : {} });
      if (pending.current !== request) return false;
      if (op === "navigate" && next.target?.id === request.tabId && (next.viewTarget ?? next.target)?.id === request.tabId) {
        addressObservation.current = Math.max(addressObservation.current, next.observedAt ?? 0);
        if (!editing.current) setAddress(next.target.url === "about:blank" ? "" : next.target.url);
      }
      const nextView = next.viewTarget ?? next.target;
      latest.current.state = next;
      latest.current.target = nextView?.kind === "tab" ? nextView : null;
      latest.current.onState(next);
      latest.current.onError("");
      return true;
    } catch (error) {
      if (pending.current === request && !["NAVIGATION_SUPERSEDED", "COMPUTER_USE_STOPPED"].includes(error.code)) latest.current.onError(error.message);
      return false;
    } finally {
      if (pending.current === request) {
        pending.current = null;
        setBusy(false);
      }
    }
  };
  const shortcut = (action) => {
    if (action === "focus") {
      addressInput.current?.focus();
      addressInput.current?.select();
    } else if (action === "find") tools.current?.openFind();
    else if (action === "history" || action === "downloads") setPanel(action);
    else if (action === "new") void act("tabs", { action: "new", browserId: latest.current.target?.browserId });
    else if (latest.current.target) void act(action === "close" ? "tabs" : "navigate", { action, tabId: latest.current.target.id });
  };
  const stopNavigation = async () => {
    pending.current = null;
    setBusy(false);
    try {
      latest.current.onState(await api2("stop", sessionId, {}));
      latest.current.onError("");
    } catch (error) {
      latest.current.onError(error.message);
    }
  };
  const paneKey = (event) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const key = event.key.toLowerCase(), modified = event.metaKey || event.ctrlKey;
    const action = modified ? { l: "focus", f: "find", j: "downloads", h: "history", y: event.metaKey ? "history" : void 0, r: "reload", t: "new", w: "close" }[key] : event.altKey ? { arrowleft: "back", arrowright: "forward" }[key] : null;
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      shortcut(action);
    }
  };
  (0, import_react10.useImperativeHandle)(ref, () => ({ shortcut, resizeViewport: (size) => tools.current?.resizeViewport(size) }));
  const disabled = !sessionId || !state || busy || state?.transitioning || state?.enabled === false;
  const canNavigate = !!sessionId && !!state && state.enabled !== false && !state.resuming && (!(busy || state.transitioning) || pending.current?.op === "navigate");
  if (!target) return /* @__PURE__ */ import_react10.default.createElement("div", { className: "tx-cu-browser-open" }, /* @__PURE__ */ import_react10.default.createElement("button", { disabled, onClick: () => shortcut("new") }, /* @__PURE__ */ import_react10.default.createElement(Icon, { kind: "new" }), "\u6253\u5F00\u6D4F\u89C8\u5668"), !!tabs.length && /* @__PURE__ */ import_react10.default.createElement("select", { "aria-label": "\u9009\u62E9\u5DF2\u6709\u6807\u7B7E\u9875", value: "", disabled, onChange: (event) => {
    const tab = tabs.find((tab2) => tab2.id === event.target.value);
    if (tab) void act("view-tab", { tabId: tab.id, browserId: tab.browserId });
  } }, /* @__PURE__ */ import_react10.default.createElement("option", { value: "", disabled: true }, "\u9009\u62E9\u5DF2\u6709\u6807\u7B7E\u9875\u2026"), tabs.map((tab) => /* @__PURE__ */ import_react10.default.createElement("option", { key: tab.id, value: tab.id, disabled: !tab.available }, tabLabel(tab), tab.available ? "" : " \xB7 \u5176\u4ED6\u5BF9\u8BDD\u6B63\u5728\u4F7F\u7528"))));
  const selected = tabs.find((t) => t.id === target.id);
  const current = navigation?.tabId === target.id ? { ...target, ...navigation } : target;
  const displayedTabs = selected ? tabs : [...tabs, { ...current, available: true }];
  let location = "";
  try {
    location = current.url === "about:blank" ? "" : new URL(current.url).host || current.url;
  } catch {
    location = current.url ?? "";
  }
  const canOpenExternal = /^https?:\/\//i.test(current.url ?? "");
  const selectTab = (tab) => void act("view-tab", { tabId: tab.id, browserId: tab.browserId });
  const moveTab = (event, tab) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const available = displayedTabs.filter((item) => item.available), index = available.findIndex((item) => item.id === tab.id);
    const next = available[event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length];
    if (next) {
      keyboardTarget.current = next.id;
      tabList.current?.querySelectorAll('[role="tab"]')[displayedTabs.indexOf(next)]?.focus();
      selectTab(next);
    }
  };
  return /* @__PURE__ */ import_react10.default.createElement("div", { className: "tx-cu-browser-controls", "aria-label": "\u6D4F\u89C8\u5668\u5BFC\u822A", onKeyDown: paneKey }, /* @__PURE__ */ import_react10.default.createElement("div", { className: "tx-cu-tabs" }, /* @__PURE__ */ import_react10.default.createElement("div", { ref: tabList, role: "tablist", "aria-label": "\u6D4F\u89C8\u5668\u6807\u7B7E\u9875", className: "tx-cu-tablist" }, displayedTabs.map((tab) => {
    const active = tab.id === target.id, label = tabLabel(active ? current : tab);
    return /* @__PURE__ */ import_react10.default.createElement("div", { key: tab.id, className: "tx-cu-browser-tab" + (active ? " is-active" : ""), role: "presentation" }, /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", role: "tab", "aria-selected": active, "data-tab-id": tab.id, tabIndex: active ? 0 : -1, title: label + (tab.available ? "" : " \xB7 \u5176\u4ED6\u5BF9\u8BDD\u6B63\u5728\u4F7F\u7528"), disabled: disabled || !tab.available, onKeyDown: (event) => moveTab(event, tab), onClick: () => selectTab(tab) }, /* @__PURE__ */ import_react10.default.createElement(ComputerIcon, { name: "globe", size: 14, className: active && navigation?.loading ? "tx-cu-tab-loading" : void 0 }), /* @__PURE__ */ import_react10.default.createElement("span", null, label)), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "tx-cu-tab-close", "aria-label": active ? "\u5173\u95ED\u5F53\u524D\u6807\u7B7E\u9875" : "\u5173\u95ED\u6807\u7B7E\u9875\uFF1A" + label, title: "\u5173\u95ED\u6807\u7B7E\u9875", tabIndex: active ? 0 : -1, disabled: disabled || !tab.available, onClick: () => void act("tabs", { action: "close", tabId: tab.id, browserId: tab.browserId }) }, /* @__PURE__ */ import_react10.default.createElement(Icon, { kind: "close" })));
  })), /* @__PURE__ */ import_react10.default.createElement("button", { "aria-label": "\u65B0\u5EFA\u6807\u7B7E\u9875", title: "\u65B0\u5EFA\u6807\u7B7E\u9875", disabled, onClick: () => shortcut("new") }, /* @__PURE__ */ import_react10.default.createElement(Icon, { kind: "new" }))), /* @__PURE__ */ import_react10.default.createElement("div", { className: "tx-cu-browser-navigation" }, /* @__PURE__ */ import_react10.default.createElement("form", { className: "tx-cu-address", onSubmit: (e) => {
    e.preventDefault();
    editing.current = false;
    void act("navigate", { action: "goto", tabId: target.id, url: address });
  } }, /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", "aria-label": "\u540E\u9000", title: "\u540E\u9000", disabled: disabled || !navigation?.canGoBack, onClick: () => shortcut("back") }, /* @__PURE__ */ import_react10.default.createElement(Icon, { kind: "back" })), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", "aria-label": "\u524D\u8FDB", title: "\u524D\u8FDB", disabled: disabled || !navigation?.canGoForward, onClick: () => shortcut("forward") }, /* @__PURE__ */ import_react10.default.createElement(Icon, { kind: "forward" })), navigation?.loading || pending.current?.op === "navigate" ? /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", "aria-label": "\u505C\u6B62\u52A0\u8F7D\u9875\u9762", title: "\u505C\u6B62\u52A0\u8F7D\u9875\u9762", disabled: state?.enabled === false, onClick: () => void stopNavigation() }, /* @__PURE__ */ import_react10.default.createElement(ComputerIcon, { name: "close" })) : /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", "aria-label": "\u91CD\u65B0\u52A0\u8F7D\u9875\u9762", title: "\u91CD\u65B0\u52A0\u8F7D\u9875\u9762", disabled, onClick: () => shortcut("reload") }, /* @__PURE__ */ import_react10.default.createElement(Icon, { kind: "reload" })), /* @__PURE__ */ import_react10.default.createElement("div", { className: "tx-cu-location" }, /* @__PURE__ */ import_react10.default.createElement("input", { ref: addressInput, disabled: !canNavigate, value: address, onChange: (e) => {
    editing.current = true;
    setAddress(e.target.value);
  }, onFocus: (event) => {
    editing.current = true;
    event.currentTarget.select();
  }, onBlur: () => {
    editing.current = false;
  }, onKeyDown: (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setAddress(current.url === "about:blank" ? "" : current.url ?? "");
      editing.current = false;
      event.currentTarget.blur();
    }
  }, placeholder: "\u641C\u7D22\u6216\u8F93\u5165\u7F51\u5740", "aria-label": "\u6D4F\u89C8\u5668\u5730\u5740" }), /* @__PURE__ */ import_react10.default.createElement("span", { "aria-hidden": "true" }, location), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "tx-cu-open-external", "aria-label": "\u5728\u5916\u90E8\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00", title: canOpenExternal ? "\u5728\u5916\u90E8\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\uFF08DSH \u6240\u5728\u7535\u8111\uFF09" : "\u5F53\u524D\u5730\u5740\u4E0D\u80FD\u5728\u5916\u90E8\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00", disabled: disabled || !canOpenExternal, onClick: () => void act("open-external", { tabId: target.id, expectedUrl: current.url }) }, /* @__PURE__ */ import_react10.default.createElement(ComputerIcon, { name: "popout", size: 14 }))), /* @__PURE__ */ import_react10.default.createElement("button", { disabled: !canNavigate || !address, type: "submit" }, "\u524D\u5F80")), /* @__PURE__ */ import_react10.default.createElement("div", { className: "tx-cu-browser-actions" }, actions), /* @__PURE__ */ import_react10.default.createElement(BrowserDownloads, { key: sessionId, sessionId, visible: visible && state?.enabled !== false, api: api2, active: panel === "downloads", onActiveChange: (value) => setPanel(value ? "downloads" : null) }), /* @__PURE__ */ import_react10.default.createElement(BrowserTools, { ref: tools, sessionId, target, frame, state, api: api2, onState, onError, previewScale, onPreviewScale, onDeviceModeChange, popupOpen: !!panel, onMenuOpen: () => setPanel(null), onOpenHistory: () => setPanel("history"), onOpenDownloads: () => setPanel("downloads") })), panel === "history" && visible && /* @__PURE__ */ import_react10.default.createElement(BrowserHistoryPanel, { key: sessionId, sessionId, api: api2, onClose: (focus) => {
    setPanel(null);
    if (focus) tools.current?.focus();
  }, onOpen: (entry) => act("tabs", { action: "new", browserId: entry.browserId, url: entry.url }) }), (navigation?.loading || state?.transitioning) && /* @__PURE__ */ import_react10.default.createElement("div", { className: "tx-cu-loading", role: "status", "aria-label": state?.resuming ? "\u6B63\u5728\u6062\u590D\u52A9\u624B\u63A7\u5236\u2026" : "\u6B63\u5728\u8F7D\u5165\u9875\u9762\u2026" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "tx-cu-visually-hidden" }, state?.resuming ? "\u6B63\u5728\u6062\u590D\u52A9\u624B\u63A7\u5236\u2026" : "\u6B63\u5728\u8F7D\u5165\u9875\u9762\u2026")));
});

// src/client/computer-reference.jsx
var import_react11 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
function segments(text) {
  const result = [];
  let end = 0;
  for (const match of text.matchAll(/<computer-use-target>([^]*?)<\/computer-use-target>/g)) {
    let value;
    try {
      if (match[1].length <= 16384) value = JSON.parse(match[1]);
    } catch {
    }
    if (!value || !["browser", "tab", "app"].includes(value.kind) || typeof value.id !== "string") continue;
    if (["label", "title", "url"].some((key) => value[key] !== void 0 && typeof value[key] !== "string")) continue;
    if (match.index > end) result.push({ text: text.slice(end, match.index) });
    result.push({ reference: value });
    end = match.index + match[0].length;
  }
  if (end < text.length) result.push({ text: text.slice(end) });
  return result;
}
function ReferenceMessage({ parts, node, renderMessageImages, t }) {
  const [copied, setCopied] = (0, import_react11.useState)(false), [error, setError] = (0, import_react11.useState)("");
  const data = node.data, content = data.content ?? [];
  const original = content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const attachments = content.filter((b) => (b.type === "image" || b.type === "file") && b.attachment);
  const extra = content.filter((b) => b.type !== "text" && !attachments.includes(b));
  return /* @__PURE__ */ import_react11.default.createElement("div", { className: "tx-cu-user-message" }, !!attachments.length && /* @__PURE__ */ import_react11.default.createElement("div", { className: "tx-cu-user-attachments" }, attachments.map((block, index) => block.type === "image" ? /* @__PURE__ */ import_react11.default.createElement(import_react11.default.Fragment, { key: index }, renderMessageImages({ images: [{ attachment: block.attachment }], align: "end", compact: attachments.length > 1 })) : /* @__PURE__ */ import_react11.default.createElement("span", { className: "tx-cu-user-file", key: index }, /* @__PURE__ */ import_react11.default.createElement(import_dsh_client_ui_primitives.FileTypeIcon, { path: block.attachment.name }), block.attachment.name))), /* @__PURE__ */ import_react11.default.createElement("div", { className: "tx-cu-user-bubble" }, parts.map((part, index) => part.reference ? /* @__PURE__ */ import_react11.default.createElement("span", { className: "tx-cu-reference", key: index, title: part.reference.url ?? part.reference.id, "data-computer-use-reference": part.reference.kind }, /* @__PURE__ */ import_react11.default.createElement(ComputerIcon, { size: 14, name: part.reference.kind === "app" ? "screen" : "browser" }), /* @__PURE__ */ import_react11.default.createElement("span", null, part.reference.label ?? part.reference.title ?? (part.reference.kind === "browser" ? "Browser" : part.reference.id))) : /* @__PURE__ */ import_react11.default.createElement(import_react11.default.Fragment, { key: index }, (0, import_dsh_client_ui_primitives.projectUserText)(part.text, data.referenceLabels ?? [], data.skillNames ?? []))), extra.map((block, index) => /* @__PURE__ */ import_react11.default.createElement(import_dsh_client_ui_primitives.JsonBlock, { key: index, label: t("message.extraBlock"), payload: block, truncatedLabel: (total) => t("json.truncated", { total }) }))), /* @__PURE__ */ import_react11.default.createElement("div", { className: "tx-cu-user-actions" }, /* @__PURE__ */ import_react11.default.createElement("button", { "aria-label": "\u590D\u5236\u539F\u6D88\u606F", onClick: async () => {
    try {
      await navigator.clipboard.writeText(original);
      setCopied(true);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  } }, copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236"), data.time && /* @__PURE__ */ import_react11.default.createElement("time", { dateTime: new Date(data.time).toISOString() }, new Date(data.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))), error && /* @__PURE__ */ import_react11.default.createElement("span", { className: "tx-cu-error", role: "alert" }, error));
}
function installComputerReferenceMessages(ctx) {
  ctx.slots.inject("conversation.chat.node", () => {
    const installed = /* @__PURE__ */ new Set(), disposers = [];
    const install = () => {
      for (const key of ["user", "steering"]) {
        let WithComputerReferences = function(props) {
          const text = (props.node.data.content ?? []).filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
          const parts = segments(text);
          return parts.some((p) => p.reference) ? /* @__PURE__ */ import_react11.default.createElement(ReferenceMessage, { ...props, parts }) : /* @__PURE__ */ import_react11.default.createElement(Original, { ...props });
        };
        if (installed.has(key)) continue;
        const original = ctx.slots.entriesOfSlot("conversation.chat.node").find((entry) => entry.options.key === key);
        if (!original) continue;
        installed.add(key);
        const Original = original.component;
        disposers.push(ctx.slots.register({ name: "conversation.chat.node", key, locale: "chat", priority: (original.options.priority ?? 0) - 1 }, WithComputerReferences));
      }
    };
    const unsubscribe = ctx.slots.subscribe("conversation.chat.node", install);
    install();
    return () => {
      unsubscribe();
      for (const dispose of disposers.reverse()) dispose();
    };
  });
}

// src/client/computer-groups.jsx
var import_react12 = __toESM(require("react"), 1);

// src/client/computer-groups.mjs
var stepKey = (node) => node.location?.kind === "step" ? `${node.location.turn.turn}:${node.location.step.step}` : node.kind === "assistant-step" ? `${node.data.turn}:${node.data.step}` : null;
function finalAnswerPresentation(node, process) {
  if (!process?.foldable || !process.spec.inlineReasoning || process.spec.answerStep !== node.data.step) return node;
  const blocks = node.data.blocks ?? [], firstAnswer = blocks.findIndex((block) => block.kind !== "reasoning");
  if (firstAnswer < 0 || !blocks.slice(firstAnswer + 1).some((block) => block.kind === "reasoning")) return node;
  return { ...node, data: { ...node.data, blocks: [...blocks.filter((block) => block.kind === "reasoning"), ...blocks.filter((block) => block.kind !== "reasoning")] } };
}
function operationKind(name = "") {
  const key = name.split(/[./]/).at(-1);
  if (key === "read_image") return "image";
  if (["read", "read_file", "file_read", "cat", "cordis_package_inspect", "cordis_runtime_inspect"].includes(key)) return "read";
  if (["bash", "pwsh", "exec", "exec_command", "terminal", "shell", "run_code"].includes(key)) return "command";
  if (["grep", "glob", "search", "web_search", "search_web"].includes(key)) return "search";
  if (key === "web_fetch") return "web";
  if (/^computer_use(?:_|$)/.test(key)) return "computer";
  if (["write", "write_file", "edit", "edit_file", "apply_patch"].includes(key)) return "edit";
  return "tool";
}
var summaryLabels = { image: "\u67E5\u770B\u56FE\u50CF", read: "\u8BFB\u53D6\u6587\u4EF6", command: "\u8FD0\u884C\u547D\u4EE4", search: "\u641C\u7D22", web: "\u8BFB\u53D6\u7F51\u9875", computer: "\u64CD\u4F5C\u7535\u8111", edit: "\u7F16\u8F91\u6587\u4EF6", tool: "\u8C03\u7528\u5DE5\u5177" };
var operationIcon = (names2) => ({ image: "image", read: "book", command: "terminal", search: "search", web: "browser", computer: "screen", edit: "annotate", tool: "stack" })[operationKind(names2[0])];
function operationSummary(names2, running = false) {
  const labels = [...new Set(names2.map((name) => summaryLabels[operationKind(name)]))];
  return (running ? "\u6B63\u5728" : "\u5DF2") + (labels.join("\u3001") || "\u6267\u884C\u64CD\u4F5C");
}
function operationState(block) {
  if (block.kind !== "tool-result") return "running";
  const name = block.call?.name ?? block.name ?? "";
  if (["ABORTED", "ABORTED_BEFORE_DISPATCH", "interrupted", "COMPUTER_USE_STOPPED"].includes(block.error?.code) || operationKind(name) === "computer" && block.isError && /tool call aborted|Computer Use (?:was |is )?stopped/i.test((block.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n"))) return "stopped";
  return block.isError || block.meta?.computerUseError ? "error" : "done";
}
var rowTitles = { bash: ["bash", "\u8FD0\u884C"], pwsh: ["pwsh", "\u8FD0\u884C PowerShell"], read: ["read", "\u8BFB\u53D6"], read_image: ["readImage", "\u67E5\u770B\u56FE\u50CF"], write: ["write", "\u5199\u5165"], edit: ["edit", "\u7F16\u8F91"], grep: ["grep", "\u641C\u7D22"], glob: ["glob", "\u67E5\u627E\u6587\u4EF6"], web_search: ["webSearch", "\u641C\u7D22\u7F51\u9875"], web_fetch: ["webFetch", "\u8BFB\u53D6\u7F51\u9875"], run_code: ["code", "\u8FD0\u884C\u4EE3\u7801"] };
function operationRowLocale(t, name, block) {
  const row = rowTitles[name];
  if (!row || !t || !/[\u3400-\u9fff]/.test(t("row.failed"))) return t;
  const state = operationState(block), title = state === "running" ? "\u6B63\u5728" + row[1] : state === "stopped" ? "\u5DF2\u505C\u6B62" : state === "error" ? row[1] + "\u5931\u8D25" : "\u5DF2" + row[1];
  return (key, ...args) => key === "tool.title." + row[0] ? title : t(key, ...args);
}
var processContextKinds = /* @__PURE__ */ new Set(["context", "system-prompt", "compaction"]);
function computerGroups(nodes) {
  const steps = /* @__PURE__ */ new Map(), result = /* @__PURE__ */ new Map();
  for (const node of nodes) if (node.kind === "tool-call") {
    const key = stepKey(node);
    if (!key) continue;
    steps.set(key, true);
  }
  let group;
  for (const node of nodes) {
    if (node.kind === "turn-process") continue;
    const step = steps.get(stepKey(node));
    const tool = node.kind === "tool-call";
    const blocks = node.data.blocks ?? [], assistant = node.kind === "assistant-step" && (step || blocks.some((block) => block.kind === "reasoning")) && !blocks.some((block) => !["reasoning", "tool-call"].includes(block.kind) && (block.kind !== "text" || block.text?.trim()));
    const turn = node.location?.turn?.turn ?? node.data.turn;
    const context = processContextKinds.has(node.kind) && turn != null;
    if (!tool && !assistant && !context || turn == null) {
      group = void 0;
      continue;
    }
    if (!group || group.turn !== turn) group = { id: node.key, turn, keys: [], calls: [], names: [], contexts: 0, running: false, failures: 0, stopped: 0, title: "" };
    group.keys.push(node.key);
    result.set(node.key, group);
    if (context) group.contexts++;
    if (tool) {
      const root = node.data.root;
      if (group.keys.length === 1) group.headerCallId = root.callId;
      result.set(`call:${root.callId}`, group);
      group.calls.push(root.callId);
      group.names.push(root.call?.name ?? root.name ?? "");
      const state = operationState(root);
      group.running ||= state === "running";
      if (state === "stopped") group.stopped++;
      else if (state === "error") group.failures++;
      try {
        group.title = JSON.parse(root.call?.argsRaw ?? root.argsRaw ?? "{}").title || group.title;
      } catch {
      }
    }
  }
  return result;
}

// src/client/computer-groups.jsx
function computerGroupPresentation(ctx) {
  const cache = /* @__PURE__ */ new WeakMap(), processCache = /* @__PURE__ */ new WeakMap(), open = /* @__PURE__ */ new Set(), listeners = /* @__PURE__ */ new Set();
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const groups = (snapshot) => {
    if (!cache.has(snapshot)) cache.set(snapshot, computerGroups(snapshot.order.map((key) => snapshot.nodes.get(key)).filter(Boolean)));
    return cache.get(snapshot);
  };
  const process = (snapshot, turn) => {
    if (!processCache.has(snapshot)) processCache.set(snapshot, /* @__PURE__ */ new Map());
    const turns = processCache.get(snapshot);
    if (!turns.has(turn)) {
      const calls = snapshot.order.map((key) => snapshot.nodes.get(key)).filter((node) => node?.kind === "tool-call" && node.location?.turn?.turn === turn).map((node) => node.data.root), names2 = calls.map((call) => call.call?.name ?? call.name ?? "");
      turns.set(turn, { label: operationSummary(names2), icon: operationIcon(names2), failures: calls.filter((call) => operationState(call) === "error").length, stopped: calls.filter((call) => operationState(call) === "stopped").length });
    }
    return turns.get(turn);
  };
  function Group({ sessionId, useChat, nodeKey, callId, turnProcess, completedContext = false, children }) {
    const group = useChat((snapshot) => groups(snapshot).get(nodeKey ?? `call:${callId}`));
    const identity = `${sessionId}:${group?.id}`;
    const expanded = (0, import_react12.useSyncExternalStore)(subscribe, () => open.has(identity));
    const seat = (0, import_react12.useRef)(null), wasFoldable = (0, import_react12.useRef)(false), [hostGrouped, setHostGrouped] = (0, import_react12.useState)(false), [visited, setVisited] = (0, import_react12.useState)(false);
    const first = !!group && (nodeKey ? nodeKey === group.id : group.headerCallId === callId), foldable = !!turnProcess?.foldable || completedContext;
    const standalone = hostGrouped || foldable || !group;
    (0, import_react12.useLayoutEffect)(() => {
      if (expanded || standalone) setVisited(true);
    }, [expanded, standalone]);
    (0, import_react12.useLayoutEffect)(() => {
      if (foldable && !wasFoldable.current && first && expanded) turnProcess?.setOpen(true);
      wasFoldable.current = foldable;
    }, [foldable, first, expanded, turnProcess?.setOpen]);
    (0, import_react12.useLayoutEffect)(() => {
      const flow = seat.current?.closest("[data-chat-flow-kind]");
      if (!flow) return;
      const sync = () => setHostGrouped(flow.hasAttribute("data-turn-process-member"));
      sync();
      const observer = new MutationObserver(sync);
      observer.observe(flow, { attributes: true, attributeFilter: ["data-turn-process-member"] });
      return () => observer.disconnect();
    }, []);
    const toggle = () => {
      if (expanded) open.delete(identity);
      else open.add(identity);
      for (const notify of listeners) notify();
    };
    const hidden = completedContext ? !turnProcess.open : !standalone && !first && !expanded;
    return /* @__PURE__ */ import_react12.default.createElement("div", { ref: seat, className: standalone ? void 0 : "tx-cu-group", style: standalone ? { display: "contents" } : void 0, "data-cu-group": !standalone && first ? group.id : void 0, "data-cu-group-hidden": hidden || void 0, "data-cu-process-context": completedContext || void 0 }, !standalone && first && /* @__PURE__ */ import_react12.default.createElement("button", { key: "summary", type: "button", className: "tx-cu-group-toggle", "aria-expanded": expanded, title: group.title || void 0, onClick: toggle }, /* @__PURE__ */ import_react12.default.createElement(ComputerIcon, { name: group.calls.length ? operationIcon(group.names) : "book", size: 16 }), /* @__PURE__ */ import_react12.default.createElement("strong", null, group.calls.length ? operationSummary(group.names, group.running) : group.contexts ? "\u4E0A\u4E0B\u6587\u8BB0\u5F55" : "\u601D\u8003\u8FC7\u7A0B"), group.calls.length > 0 && /* @__PURE__ */ import_react12.default.createElement("span", null, group.calls.length, " \u6B21\u64CD\u4F5C"), group.failures > 0 && /* @__PURE__ */ import_react12.default.createElement("span", { className: "tx-cu-error" }, group.failures, " \u6B21\u5931\u8D25"), group.stopped > 0 && /* @__PURE__ */ import_react12.default.createElement("span", null, "\u5DF2\u505C\u6B62"), /* @__PURE__ */ import_react12.default.createElement(ComputerIcon, { className: "tx-cu-disclosure", name: "chevron", size: 12 })), /* @__PURE__ */ import_react12.default.createElement("div", { key: "content", style: { display: standalone || expanded ? "contents" : "none" } }, (standalone || expanded || visited) && children));
  }
  ctx.slots.inject("conversation.chat.node", () => {
    const disposers = [], installed = /* @__PURE__ */ new Set();
    const install = () => {
      for (const key of ["assistant-step", "turn-process", ...processContextKinds]) {
        let GroupedAssistant = function(props) {
          const node = (0, import_react12.useMemo)(() => finalAnswerPresentation(props.node, props.turnProcess), [props.node, props.turnProcess?.foldable, props.turnProcess?.spec.answerStep, props.turnProcess?.spec.inlineReasoning]);
          const inline = props.turnProcess?.foldable && props.turnProcess.spec.inlineReasoning && props.turnProcess.spec.answerStep === node.data.step;
          return /* @__PURE__ */ import_react12.default.createElement(Group, { ...props, nodeKey: props.node.key }, /* @__PURE__ */ import_react12.default.createElement("div", { className: inline ? "tx-cu-process-answer" : void 0, "data-process-open": inline && props.turnProcess.open || void 0, style: { display: "contents" } }, /* @__PURE__ */ import_react12.default.createElement(Original, { ...props, node })));
        }, GroupedProcess = function(props) {
          const { label, icon, failures, stopped } = props.useChat((snapshot) => process(snapshot, props.node.data.turn));
          if (!props.turnProcess?.foldable || !props.node.data.toolCallCount) return /* @__PURE__ */ import_react12.default.createElement(Original, { ...props });
          return /* @__PURE__ */ import_react12.default.createElement("button", { type: "button", className: "tx-cu-group-toggle", "data-turn-process": props.node.data.turn, "data-turn-process-tool-calls": props.node.data.toolCallCount, "aria-expanded": props.turnProcess.open, title: props.node.data.toolCallCount + " \u6B21\u5DE5\u5177\u8C03\u7528", onClick: () => props.turnProcess.setOpen(!props.turnProcess.open) }, /* @__PURE__ */ import_react12.default.createElement(ComputerIcon, { name: icon, size: 16 }), /* @__PURE__ */ import_react12.default.createElement("strong", null, label), failures > 0 && /* @__PURE__ */ import_react12.default.createElement("span", { className: "tx-cu-error" }, failures, " \u9879\u5931\u8D25"), stopped > 0 && /* @__PURE__ */ import_react12.default.createElement("span", null, stopped, " \u9879\u5DF2\u505C\u6B62"), /* @__PURE__ */ import_react12.default.createElement(ComputerIcon, { className: "tx-cu-disclosure", name: "chevron", size: 12 }));
        }, GroupedContext = function(props) {
          const spec = props.turnProcess?.spec, node = props.node;
          const completedContext = key === "system-prompt" && node.location?.turn?.status === "closed" && spec?.answerAnchorSeq != null && node.anchorSeq >= spec.processStartSeq && node.anchorSeq < spec.answerAnchorSeq;
          return /* @__PURE__ */ import_react12.default.createElement(Group, { ...props, nodeKey: node.key, completedContext }, /* @__PURE__ */ import_react12.default.createElement(Original, { ...props }));
        };
        if (installed.has(key)) continue;
        const original = ctx.slots.entriesOfSlot("conversation.chat.node").find((entry) => entry.options.key === key);
        if (!original) continue;
        installed.add(key);
        const Original = original.component;
        const GroupedNode = key === "turn-process" ? GroupedProcess : key === "assistant-step" ? GroupedAssistant : GroupedContext;
        disposers.push(ctx.slots.register({ name: "conversation.chat.node", key, locale: "chat", priority: (original.options.priority ?? 0) - 1 }, GroupedNode));
      }
    };
    const unsubscribe = ctx.slots.subscribe("conversation.chat.node", install);
    install();
    return () => {
      unsubscribe();
      for (const dispose of disposers.reverse()) dispose();
      open.clear();
      listeners.clear();
    };
  });
  ctx.slots.inject("tool.call.toolview", () => {
    const installed = /* @__PURE__ */ new Set(), disposers = [];
    const install = () => {
      for (const original of ctx.slots.entriesOfSlot("tool.call.toolview")) {
        let GroupedTool = function(props) {
          const images = (name, owner) => {
            if (name !== "tool.call.images") throw new Error("Unsupported tool image slot: " + name);
            return /* @__PURE__ */ import_react12.default.createElement("div", { className: "tx-cu-result-images" }, owner.images.map((image, index) => image.attachment ? /* @__PURE__ */ import_react12.default.createElement(SavedImage, { key: index, attachment: image.attachment, loadImage: owner.loadImage }) : null));
          };
          return /* @__PURE__ */ import_react12.default.createElement(Group, { ...props }, /* @__PURE__ */ import_react12.default.createElement(Original, { ...props, ...props.t ? { t: operationRowLocale(props.t, props.toolName, props.block) } : {}, ...original.children?.["tool.call.images"] ? { renderSlot: images } : {} }));
        };
        const key = original.options.key;
        if (installed.has(key)) continue;
        installed.add(key);
        const Original = original.component;
        const { children, ...options } = original.options;
        disposers.push(ctx.slots.register({ ...options, name: "tool.call.toolview", locale: original.locale, inject: original.inject, children: void 0, priority: (options.priority ?? 0) - 1 }, GroupedTool));
      }
    };
    const unsubscribe = ctx.slots.subscribe("tool.call.toolview", install);
    install();
    return () => {
      unsubscribe();
      for (const dispose of disposers.reverse()) dispose();
    };
  });
  return Group;
}

// src/client/computer-setup.jsx
var import_react13 = __toESM(require("react"), 1);
function Permission({ title, detail, value }) {
  return /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, title), /* @__PURE__ */ import_react13.default.createElement("p", null, detail)), /* @__PURE__ */ import_react13.default.createElement("span", { className: value === true ? "is-ready" : "is-needed" }, value === true ? "\u5DF2\u5F00\u542F" : value === false ? "\u5F85\u5F00\u542F" : "\u672A\u68C0\u6D4B"));
}
function ChromeSetup({ extension, busy, act, onError }) {
  const [copied, setCopied] = (0, import_react13.useState)("");
  const installation = extension?.installation, connected = !!extension?.browsers?.length;
  const copy = async (text, kind) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch (error) {
      onError(error.message);
    }
  };
  return /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "Chrome \u6269\u5C55"), /* @__PURE__ */ import_react13.default.createElement("p", null, connected ? extension.browsers.map((browser) => browser.name).join("\u3001") + " \xB7 \u4F7F\u7528\u5DF2\u6709\u7F51\u9875\u548C\u767B\u5F55\u72B6\u6001" : "\u8FDE\u63A5\u65E5\u5E38\u4F7F\u7528\u7684\u6D4F\u89C8\u5668")), /* @__PURE__ */ import_react13.default.createElement("span", { className: connected && !installation?.reloadRequired ? "is-ready" : "is-needed" }, installation?.reloadRequired ? "\u5F85\u91CD\u65B0\u52A0\u8F7D" : connected ? "\u5DF2\u8FDE\u63A5" : installation?.prepared ? "\u8FDE\u63A5\u7A0B\u5E8F\u5DF2\u5C31\u7EEA" : "\u672A\u8FDE\u63A5")), extension?.error && /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-error", role: "alert" }, extension.error), installation?.supported ? /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, (!installation.prepared || installation.updateAvailable) && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-install" }, /* @__PURE__ */ import_react13.default.createElement("p", null, "\u5148\u51C6\u5907\u672C\u673A\u8FDE\u63A5\u7A0B\u5E8F\uFF0C\u518D\u5728 Chrome \u4E2D\u52A0\u8F7D\u6269\u5C55\u3002\u5F00\u53D1\u7248\u65E0\u9700\u5546\u5E97\u8D26\u53F7\uFF0C\u9996\u6B21\u52A0\u8F7D\u9700\u8981\u5F00\u542F Chrome \u7684\u5F00\u53D1\u8005\u6A21\u5F0F\u3002", installation.platform === "win32" && "Windows \u9996\u6B21\u51C6\u5907\u9700\u8981 .NET 10 SDK\uFF0C\u7528\u4E8E\u7F16\u8BD1\u672C\u673A\u8FDE\u63A5\u7A0B\u5E8F\u3002"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || installation.preparing, onClick: () => act("install-extension") }, busy === "install-extension" || installation.preparing ? "\u6B63\u5728\u51C6\u5907\u2026" : installation.updateAvailable ? "\u66F4\u65B0 Chrome \u8FDE\u63A5" : "\u51C6\u5907 Chrome \u8FDE\u63A5")), installation.prepared && (!connected || installation.reloadRequired) && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-extension-steps" }, /* @__PURE__ */ import_react13.default.createElement("p", null, installation.reloadRequired ? "\u6269\u5C55\u6587\u4EF6\u5DF2\u66F4\u65B0\uFF0C\u8BF7\u5728 Chrome \u6269\u5C55\u7BA1\u7406\u9875\u91CD\u65B0\u52A0\u8F7D Oh My DSH Computer Use\u3002" : "\u5728 Chrome \u5730\u5740\u680F\u6253\u5F00 chrome://extensions\uFF0C\u5F00\u542F\u300C\u5F00\u53D1\u8005\u6A21\u5F0F\u300D\uFF0C\u70B9\u51FB\u300C\u52A0\u8F7D\u5DF2\u89E3\u538B\u7684\u6269\u5C55\u7A0B\u5E8F\u300D\uFF0C\u9009\u62E9\u4E0B\u9762\u7684\u76EE\u5F55\u3002"), /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-actions" }, /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", onClick: () => copy("chrome://extensions", "page") }, copied === "page" ? "\u5DF2\u590D\u5236\u5730\u5740" : "\u590D\u5236\u6269\u5C55\u9875\u5730\u5740"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", onClick: () => copy(installation.extensionPath, "folder") }, copied === "folder" ? "\u5DF2\u590D\u5236\u76EE\u5F55" : "\u590D\u5236\u6269\u5C55\u76EE\u5F55")), /* @__PURE__ */ import_react13.default.createElement("code", null, installation.extensionPath), /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-muted" }, "\u52A0\u8F7D\u6210\u529F\u540E\u4F1A\u81EA\u52A8\u663E\u793A\u300C\u5DF2\u8FDE\u63A5\u300D\u3002")), /* @__PURE__ */ import_react13.default.createElement("details", { className: "tx-cu-setup-advanced" }, /* @__PURE__ */ import_react13.default.createElement("summary", null, "Chrome \u8FDE\u63A5\u8BE6\u60C5"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u6269\u5C55\u7248\u672C ", installation.version, " \xB7 \u672C\u673A\u8FDE\u63A5\u7A0B\u5E8F", installation.prepared ? "\u5DF2\u5C31\u7EEA" : "\u5C1A\u672A\u51C6\u5907"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u6D4F\u89C8\u5668\u914D\u7F6E\u76EE\u5F55"), /* @__PURE__ */ import_react13.default.createElement("code", null, installation.browserProfile), installation.prepared && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-actions" }, /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy, onClick: () => act("install-extension") }, busy === "install-extension" ? "\u6B63\u5728\u68C0\u67E5\u2026" : "\u68C0\u67E5\u5E76\u4FEE\u590D\u8FDE\u63A5\u7A0B\u5E8F"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy, onClick: () => act("remove-extension") }, busy === "remove-extension" ? "\u6B63\u5728\u79FB\u9664\u2026" : "\u79FB\u9664 Chrome \u8FDE\u63A5")), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u79FB\u9664\u8FDE\u63A5\u4F1A\u505C\u6B62\u52A9\u624B\u5BF9 Chrome \u7684\u64CD\u63A7\u3002\u7F51\u9875\u548C\u6269\u5C55\u76EE\u5F55\u4FDD\u7559\uFF0C\u518D\u6B21\u4F7F\u7528\u65F6\u91CD\u65B0\u51C6\u5907\u8FDE\u63A5\u3002"))) : !connected && /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-muted" }, "\u6B64\u5E73\u53F0\u7684\u6269\u5C55\u5B89\u88C5\u7A0B\u5E8F\u5C1A\u672A\u5B8C\u6210\uFF0C\u5185\u7F6E\u6D4F\u89C8\u5668\u53EF\u5355\u72EC\u4F7F\u7528\u3002"));
}
function ComputerSetup({ sessionId, visible, api: api2 }) {
  const panelId = (0, import_react13.useId)();
  const [open, setOpen] = (0, import_react13.useState)(false), [setup, setSetup] = (0, import_react13.useState)(null), [error, setError] = (0, import_react13.useState)(""), [loadError, setLoadError] = (0, import_react13.useState)(""), [busy, setBusy] = (0, import_react13.useState)("");
  (0, import_react13.useEffect)(() => {
    if (!open || !visible || !sessionId) return;
    let live = true, timer;
    const refresh = async () => {
      try {
        const next = await api2("setup", sessionId);
        if (live) {
          setSetup(next);
          setLoadError("");
        }
      } catch (e) {
        if (live) setLoadError(e.message);
      }
      if (live) timer = setTimeout(refresh, 2500);
    };
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, visible, sessionId]);
  const act = async (action) => {
    setBusy(action);
    setError("");
    try {
      setSetup(await api2("setup", sessionId, { action }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const native = setup?.native;
  return /* @__PURE__ */ import_react13.default.createElement("section", { className: "tx-cu-setup" }, /* @__PURE__ */ import_react13.default.createElement("button", { className: "tx-cu-setup-toggle", type: "button", "aria-expanded": open, "aria-controls": panelId, onClick: () => setOpen((value) => !value) }, /* @__PURE__ */ import_react13.default.createElement("span", null, /* @__PURE__ */ import_react13.default.createElement(ComputerIcon, { name: "settings", size: 14 }), "\u8FD0\u884C\u73AF\u5883\u4E0E\u6743\u9650"), /* @__PURE__ */ import_react13.default.createElement(ComputerIcon, { className: "tx-cu-disclosure", name: "chevron", size: 12 })), open && /* @__PURE__ */ import_react13.default.createElement("div", { id: panelId }, (error || loadError) && /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-error", role: "alert" }, error || loadError), !setup ? /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-muted", role: "status" }, "\u6B63\u5728\u68C0\u67E5\u8FD0\u884C\u73AF\u5883\u2026") : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "\u5185\u7F6E\u6D4F\u89C8\u5668"), /* @__PURE__ */ import_react13.default.createElement("p", null, setup.browser.name, " \xB7 \u72EC\u7ACB\u5DE5\u4F5C\u914D\u7F6E")), /* @__PURE__ */ import_react13.default.createElement("span", { className: setup.browser.installed ? "is-ready" : "is-needed" }, setup.browser.installed ? "\u5DF2\u5B89\u88C5" : "\u5F85\u5B89\u88C5")), !setup.browser.installed && /* @__PURE__ */ import_react13.default.createElement("p", null, "\u8BF7\u5B89\u88C5 Chrome\uFF0C\u6216\u5728\u63D2\u4EF6\u76EE\u5F55\u8FD0\u884C ", /* @__PURE__ */ import_react13.default.createElement("code", null, "pnpm exec playwright install chromium"), "\uFF0C\u7136\u540E\u91CD\u65B0\u6253\u5F00\u6D4F\u89C8\u5668\u3002"), /* @__PURE__ */ import_react13.default.createElement("details", { className: "tx-cu-setup-advanced" }, /* @__PURE__ */ import_react13.default.createElement("summary", null, "\u6D4F\u89C8\u5668\u8BE6\u60C5"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u7F51\u9875\u767B\u5F55\u4FDD\u5B58\u5728\u72EC\u7ACB\u914D\u7F6E\u4E2D\u3002", setup.extension?.installation?.platform === "darwin" && "\u9996\u6B21\u4F7F\u7528\u53EF\u80FD\u9700\u8981\u5728 macOS \u7CFB\u7EDF\u63D0\u793A\u4E2D\u5141\u8BB8\u6D4F\u89C8\u5668\u8BBF\u95EE\u94A5\u5319\u4E32\u3002"), /* @__PURE__ */ import_react13.default.createElement("code", null, setup.browser.path)), /* @__PURE__ */ import_react13.default.createElement(ChromeSetup, { extension: setup.extension, busy, act, onError: setError }), !native.supported ? /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-muted" }, "\u6B64\u7CFB\u7EDF\u7248\u672C\u5C1A\u4E0D\u652F\u6301\u539F\u751F\u5E94\u7528\u63A7\u5236\u3002\u6D4F\u89C8\u5668\u529F\u80FD\u53EF\u5355\u72EC\u4F7F\u7528\u3002") : !native.installed ? /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-install" }, /* @__PURE__ */ import_react13.default.createElement("strong", null, "\u5B89\u88C5\u684C\u9762\u63A7\u5236"), /* @__PURE__ */ import_react13.default.createElement("p", null, native.platform === "win32" ? "Windows \u5F00\u53D1\u7248\u91C7\u7528\u524D\u53F0\u64CD\u63A7\uFF0C\u5B89\u88C5\u65F6\u4F1A\u5728\u672C\u673A\u7F16\u8BD1\uFF0C\u9700\u8981 .NET 10 SDK\u3002\u8BF7\u4FDD\u6301\u684C\u9762\u89E3\u9501\uFF1B\u9F20\u6807\u6216\u952E\u76D8\u4ECB\u5165\u4F1A\u505C\u6B62\u52A9\u624B\u3002" : "\u5B89\u88C5 Oh My DSH Computer Use \u540E\uFF0C\u53EF\u9009\u62E9\u5E76\u64CD\u4F5C Mac \u5E94\u7528\u3002\u5F53\u524D\u5F00\u53D1\u7248\u4F1A\u5728\u672C\u673A\u7F16\u8BD1\uFF0C\u9700\u8981 Apple Command Line Tools\uFF1B\u53D1\u884C\u7248\u5B89\u88C5\u5305\u5C1A\u672A\u63D0\u4F9B\u3002"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || native.installing, onClick: () => act("install-native") }, busy === "install-native" || native.installing ? "\u6B63\u5728\u7F16\u8BD1\u5E76\u5B89\u88C5\u2026" : "\u5B89\u88C5\u684C\u9762\u63A7\u5236")) : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, (native.updateAvailable || native.restartRequired || native.repairRequired) && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-install" }, /* @__PURE__ */ import_react13.default.createElement("strong", null, native.repairRequired ? "\u684C\u9762\u63A7\u5236\u9700\u8981\u4FEE\u590D" : native.updateAvailable ? "\u684C\u9762\u63A7\u5236\u6709\u66F4\u65B0" : "\u684C\u9762\u63A7\u5236\u9700\u8981\u91CD\u542F"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u4F1A\u6682\u505C\u5F53\u524D\u684C\u9762\u64CD\u4F5C\uFF0C\u5B8C\u6210\u540E\u8BF7\u91CD\u65B0\u9009\u62E9\u5E94\u7528\u3002"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || native.installing, onClick: () => act("install-native") }, busy === "install-native" || native.installing ? "\u6B63\u5728\u66F4\u65B0\u684C\u9762\u63A7\u5236\u2026" : native.repairRequired ? "\u4FEE\u590D\u684C\u9762\u63A7\u5236" : native.updateAvailable ? "\u66F4\u65B0\u684C\u9762\u63A7\u5236" : "\u91CD\u542F\u684C\u9762\u63A7\u5236")), native.platform === "win32" ? /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "Windows \u684C\u9762"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u524D\u53F0\u64CD\u63A7\uFF1B\u4FDD\u6301\u684C\u9762\u89E3\u9501\uFF0C\u9F20\u6807\u6216\u952E\u76D8\u4ECB\u5165\u4F1A\u505C\u6B62\u52A9\u624B\u3002")), /* @__PURE__ */ import_react13.default.createElement("span", { className: native.interactive ? "is-ready" : "is-needed" }, native.interactive ? "\u53EF\u7528" : "\u5F53\u524D\u4E0D\u53EF\u7528")), /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "\u7A97\u53E3\u6355\u83B7"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u5411\u52A9\u624B\u63D0\u4F9B\u6240\u9009\u5E94\u7528\u7684\u753B\u9762")), /* @__PURE__ */ import_react13.default.createElement("span", { className: native.captureSupported ? "is-ready" : "is-needed" }, native.captureSupported ? "\u53EF\u7528" : "\u5F53\u524D\u4E0D\u53EF\u7528"))) : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement(Permission, { title: "\u8F85\u52A9\u529F\u80FD", detail: "\u8BFB\u53D6\u5E94\u7528\u63A7\u4EF6\u5E76\u64CD\u4F5C\u6240\u9009\u7A97\u53E3", value: native.accessibility }), /* @__PURE__ */ import_react13.default.createElement(Permission, { title: "\u5C4F\u5E55\u5F55\u5236", detail: "\u5411\u52A9\u624B\u63D0\u4F9B\u6240\u9009\u5E94\u7528\u7684\u753B\u9762", value: native.screenRecording })), native.error && /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-error", role: "alert" }, native.error), native.platform !== "win32" && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-actions" }, /* @__PURE__ */ import_react13.default.createElement("span", { className: "tx-cu-muted" }, "\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u7684\u5E94\u7528\u540D\u79F0\uFF1A", native.displayName ?? "Oh My DSH Computer Use"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy, onClick: () => act("permissions") }, busy === "permissions" ? "\u6B63\u5728\u6253\u5F00\u2026" : "\u6253\u5F00\u6743\u9650\u8BBE\u7F6E")), /* @__PURE__ */ import_react13.default.createElement("details", { className: "tx-cu-setup-advanced" }, /* @__PURE__ */ import_react13.default.createElement("summary", null, "\u684C\u9762\u63A7\u5236\u7248\u672C"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u5DF2\u5B89\u88C5 ", native.version ?? "\u672A\u77E5", native.runningVersion && native.runningVersion !== native.version ? ` \xB7 \u6B63\u5728\u8FD0\u884C ${native.runningVersion}` : ""), native.removable && /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-actions" }, /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || native.installing || native.removing, onClick: () => act("remove-native") }, busy === "remove-native" || native.removing ? "\u6B63\u5728\u79FB\u9664\u684C\u9762\u63A7\u5236\u2026" : "\u79FB\u9664\u684C\u9762\u63A7\u5236")), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u79FB\u9664\u4F1A\u505C\u6B62\u684C\u9762\u64CD\u63A7\u4E0E\u9884\u89C8\uFF0C\u5E94\u7528\u7A97\u53E3\u548C\u7528\u6237\u6587\u4EF6\u4FDD\u7559\u3002\u9700\u8981\u65F6\u53EF\u91CD\u65B0\u5B89\u88C5\u3002")))))));
}

// src/client/window-share.jsx
var import_react14 = __toESM(require("react"), 1);
function WindowShare({ sessionId, inputActions, conversation }) {
  const [open, setOpen] = (0, import_react14.useState)(false), [windows, setWindows] = (0, import_react14.useState)([]), [busy, setBusy] = (0, import_react14.useState)(false), [error, setError] = (0, import_react14.useState)("");
  const [query, setQuery] = (0, import_react14.useState)(""), [sharing, setSharing] = (0, import_react14.useState)(null);
  const dialog = (0, import_react14.useRef)(null), request = (0, import_react14.useRef)(null), search = (0, import_react14.useRef)(null), opener = (0, import_react14.useRef)(null), activeSession = (0, import_react14.useRef)(sessionId);
  activeSession.current = sessionId;
  (0, import_react14.useEffect)(() => {
    setOpen(false);
    setBusy(false);
    setWindows([]);
    setError("");
    return () => request.current?.abort();
  }, [sessionId]);
  (0, import_react14.useEffect)(() => {
    if (open) {
      dialog.current?.showModal();
      search.current?.focus();
    } else dialog.current?.close();
  }, [open]);
  const post = async (op, value, signal) => {
    const r = await fetch("/trisoul-x/computer-use/" + op + "?session=" + encodeURIComponent(sessionId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value), signal });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "\u7A97\u53E3\u5206\u4EAB\u5931\u8D25");
    return result;
  };
  const list = async (refresh = false) => {
    if (!open) {
      opener.current = document.activeElement;
      setQuery("");
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setOpen(true);
    setBusy(true);
    setSharing(null);
    setError("");
    if (!refresh) setWindows([]);
    try {
      const result = await post("share-windows", {}, controller.signal);
      if (!controller.signal.aborted) setWindows(result.windows);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const share = async (window2) => {
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setSharing(window2.pid + ":" + window2.window_id);
    setError("");
    try {
      const value = await post("share-window", window2, controller.signal);
      if (controller.signal.aborted || activeSession.current !== sessionId) return;
      const name = (value.name || "\u7A97\u53E3").replace(/[\\/:*?"<>|]/g, "_");
      const bytes2 = Uint8Array.from(atob(value.screenshot), (c) => c.charCodeAt(0));
      const drafts = conversation.createDrafts(sessionId, [new File([bytes2], name + ".png", { type: value.mediaType }), new File([value.text], name + "-\u7A97\u53E3\u6587\u5B57.txt", { type: "text/plain" })]);
      if (!inputActions.addAttachments(drafts.map((draft) => draft.id))) {
        conversation.releaseDraftAttachments(drafts);
        throw new Error("\u8F93\u5165\u533A\u6B63\u5728\u53D1\u9001\uFF0C\u8BF7\u7A0D\u540E\u518D\u52A0\u5165\u7A97\u53E3\u5FEB\u7167");
      }
      close();
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const close = () => {
    request.current?.abort();
    dialog.current?.close();
    setOpen(false);
    setBusy(false);
    setSharing(null);
    opener.current?.focus({ preventScroll: true });
  };
  const filtered = windows.filter((window2) => (window2.app_name + " " + (window2.title ?? "")).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return /* @__PURE__ */ import_react14.default.createElement("div", { className: "tx-cu-share" }, /* @__PURE__ */ import_react14.default.createElement("button", { type: "button", className: "tx-cu-share-entry", onClick: () => void list(), disabled: !sessionId || !inputActions || !conversation, title: "\u628A\u6240\u9009\u7A97\u53E3\u7684\u622A\u56FE\u548C\u6587\u5B57\u52A0\u5165\u5F53\u524D\u8349\u7A3F", "aria-label": "\u5206\u4EAB\u7A97\u53E3" }, /* @__PURE__ */ import_react14.default.createElement(ComputerIcon, { name: "share", size: 14 })), /* @__PURE__ */ import_react14.default.createElement("dialog", { ref: dialog, "aria-label": "\u5206\u4EAB\u7A97\u53E3", onCancel: (event) => {
    event.preventDefault();
    close();
  }, onKeyDown: (event) => event.stopPropagation(), className: "tx-cu-share-dialog tx-cu-window-picker" }, /* @__PURE__ */ import_react14.default.createElement("header", null, /* @__PURE__ */ import_react14.default.createElement("strong", null, "\u5206\u4EAB\u7A97\u53E3"), /* @__PURE__ */ import_react14.default.createElement("button", { type: "button", onClick: close, "aria-label": "\u5173\u95ED\u7A97\u53E3\u5206\u4EAB" }, /* @__PURE__ */ import_react14.default.createElement(ComputerIcon, { name: "close" }))), /* @__PURE__ */ import_react14.default.createElement("p", null, "\u9009\u62E9\u8981\u5206\u4EAB\u7684\u7A97\u53E3\uFF0C\u622A\u56FE\u548C\u6587\u5B57\u4F1A\u52A0\u5165\u8349\u7A3F\u3002"), /* @__PURE__ */ import_react14.default.createElement("div", { className: "tx-cu-window-search" }, /* @__PURE__ */ import_react14.default.createElement(ComputerIcon, { name: "search", size: 15 }), /* @__PURE__ */ import_react14.default.createElement("input", { ref: search, type: "search", "aria-label": "\u641C\u7D22\u5E94\u7528\u6216\u7A97\u53E3", placeholder: "\u641C\u7D22\u5E94\u7528\u6216\u7A97\u53E3", value: query, onChange: (event) => setQuery(event.target.value) }), /* @__PURE__ */ import_react14.default.createElement("button", { type: "button", "aria-label": "\u5237\u65B0\u7A97\u53E3\u5217\u8868", title: "\u5237\u65B0\u7A97\u53E3\u5217\u8868", disabled: busy, onClick: () => void list(true) }, /* @__PURE__ */ import_react14.default.createElement(ComputerIcon, { name: "reset", size: 15 }))), error && /* @__PURE__ */ import_react14.default.createElement("p", { className: "tx-cu-error", role: "alert" }, error), busy && /* @__PURE__ */ import_react14.default.createElement("p", { role: "status" }, sharing ? "\u6B63\u5728\u52A0\u5165\u7A97\u53E3\u5FEB\u7167\u2026" : windows.length ? "\u6B63\u5728\u5237\u65B0\u7A97\u53E3\u2026" : "\u6B63\u5728\u8BFB\u53D6\u7A97\u53E3\u2026"), !busy && !error && !windows.length && /* @__PURE__ */ import_react14.default.createElement("p", null, "\u5F53\u524D\u6CA1\u6709\u53EF\u5206\u4EAB\u7684\u5E94\u7528\u7A97\u53E3\u3002"), !busy && windows.length > 0 && !filtered.length && /* @__PURE__ */ import_react14.default.createElement("p", null, "\u6CA1\u6709\u5339\u914D\u7684\u7A97\u53E3\uFF0C\u8BD5\u8BD5\u5E94\u7528\u540D\u79F0\u3002"), /* @__PURE__ */ import_react14.default.createElement("div", { className: "tx-cu-share-list" }, filtered.map((window2) => /* @__PURE__ */ import_react14.default.createElement("button", { key: window2.pid + ":" + window2.window_id, type: "button", disabled: busy, className: sharing === window2.pid + ":" + window2.window_id ? "is-selected" : void 0, onClick: () => share(window2) }, /* @__PURE__ */ import_react14.default.createElement("span", { className: "tx-cu-share-window-icon" }, /* @__PURE__ */ import_react14.default.createElement(ComputerIcon, null)), /* @__PURE__ */ import_react14.default.createElement("span", { className: "tx-cu-share-window-info" }, /* @__PURE__ */ import_react14.default.createElement("strong", null, window2.app_name), /* @__PURE__ */ import_react14.default.createElement("span", null, window2.title || "\u672A\u547D\u540D\u7A97\u53E3")), window2.active && /* @__PURE__ */ import_react14.default.createElement("small", null, "\u5F53\u524D\u524D\u53F0"), /* @__PURE__ */ import_react14.default.createElement(ComputerIcon, { name: "chevron", size: 12 })))), /* @__PURE__ */ import_react14.default.createElement("footer", null, /* @__PURE__ */ import_react14.default.createElement("small", null, windows.length, " \u4E2A\u7A97\u53E3 \xB7 \u9009\u62E9\u540E\u4E0D\u4F1A\u81EA\u52A8\u53D1\u9001"), /* @__PURE__ */ import_react14.default.createElement("button", { type: "button", onClick: close }, "\u53D6\u6D88"))));
}

// src/client/floating-preview.jsx
var import_react15 = __toESM(require("react"), 1);
var import_react_dom2 = require("react-dom");
function FloatingPreview({ sessionId, state, url: url2, api: api2, onState, onError, anchor, onOpen }) {
  const [popup, setPopup] = (0, import_react15.useState)(null), [opening, setOpening] = (0, import_react15.useState)(false), [stopping, setStopping] = (0, import_react15.useState)(false), [expanded, setExpanded] = (0, import_react15.useState)(false), [zoomed, setZoomed] = (0, import_react15.useState)(null), [localError, setLocalError] = (0, import_react15.useState)("");
  const [shown, setShown] = (0, import_react15.useState)(true), [position, setPosition] = (0, import_react15.useState)({ right: 20, bottom: 120 });
  const [dragging, setDragging] = (0, import_react15.useState)(false);
  const [frameSizes, setFrameSizes] = (0, import_react15.useState)({});
  const [front, setFront] = (0, import_react15.useState)(null), [entering, setEntering] = (0, import_react15.useState)(false);
  const [query, setQuery] = (0, import_react15.useState)(""), [resuming, setResuming] = (0, import_react15.useState)(false), [connections, setConnections] = (0, import_react15.useState)({}), [targetErrors, setTargetErrors] = (0, import_react15.useState)({});
  const keyboardTarget = (0, import_react15.useRef)(null);
  const owned = (0, import_react15.useRef)(null), generation = (0, import_react15.useRef)(0), floating = (0, import_react15.useRef)(null), manual = (0, import_react15.useRef)(null), drag = (0, import_react15.useRef)(null), layout = (0, import_react15.useRef)(null);
  const target = state?.target, key = target?.viewId ?? target?.id;
  const orderedTargets = (state?.previewTargets ?? (target ? [target] : [])).slice().reverse();
  const targets = orderedTargets.slice().sort((a, b) => Number((b.viewId ?? b.id) === (front ?? key)) - Number((a.viewId ?? a.id) === (front ?? key)));
  (0, import_react15.useEffect)(() => () => {
    generation.current++;
    owned.current?.close();
    owned.current = null;
    setPopup(null);
  }, [sessionId, state?.enabled]);
  (0, import_react15.useEffect)(() => {
    setShown(true);
    setLocalError("");
    setFront(null);
  }, [sessionId, key]);
  (0, import_react15.useEffect)(() => {
    manual.current = null;
    setZoomed(null);
    setExpanded(false);
    layout.current?.();
  }, [sessionId]);
  const targetIds = targets.map((item) => item.viewId ?? item.id).join("|");
  const leading = targets.find((item) => (item.viewId ?? item.id) === zoomed) ?? targets[0];
  const leadingId = leading?.viewId ?? leading?.id;
  const matches = (item) => (item.name || item.title || item.url || "").toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const visibleError = localError || targetErrors[leadingId];
  (0, import_react15.useEffect)(() => {
    if (!expanded) setQuery("");
  }, [expanded]);
  (0, import_react15.useEffect)(() => {
    setConnections({});
    setTargetErrors({});
    setQuery("");
    setResuming(false);
    setStopping(false);
  }, [sessionId]);
  (0, import_react15.useLayoutEffect)(() => {
    if (!keyboardTarget.current) return;
    const root = popup?.document ?? document;
    [...root.querySelectorAll(".tx-cu-preview-card")].find((element) => element.dataset.target === keyboardTarget.current)?.querySelector(".tx-cu-preview-open")?.focus({ preventScroll: true });
    keyboardTarget.current = null;
  }, [front, zoomed, popup]);
  const depth = zoomed || expanded ? 0 : Math.max(0, Math.min(4, targets.length - 1));
  const sizeKey = targets.map((item) => {
    const size = frameSizes[item.viewId ?? item.id];
    return size ? `${size.width}:${size.height}` : "16:9";
  }).join("|");
  (0, import_react15.useEffect)(() => {
    if (zoomed && !targets.some((item) => (item.viewId ?? item.id) === zoomed)) setZoomed(null);
  }, [targetIds, zoomed]);
  const finishDrag = () => {
    const active = drag.current;
    drag.current = null;
    setDragging(false);
    if (active?.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id);
  };
  (0, import_react15.useEffect)(() => {
    finishDrag();
    return () => {
      const active = drag.current;
      drag.current = null;
      if (active?.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id);
    };
  }, [sessionId, popup, shown]);
  (0, import_react15.useLayoutEffect)(() => {
    let observedInput;
    const update = () => {
      let container = anchor?.current?.parentElement;
      while (container && !container.querySelector('[contenteditable="true"]')) container = container.parentElement;
      const input = container?.querySelector('[contenteditable="true"]');
      if (input !== observedInput) {
        if (observedInput) observer.unobserve(observedInput);
        if (input) observer.observe(input);
        observedInput = input;
      }
      const rect = (input ?? anchor?.current)?.getBoundingClientRect();
      if (!rect) return;
      const viewport = popup ?? window;
      const availableWidth = popup ? viewport.innerWidth - 12 : Math.min(zoomed ? 640 : Math.max(240, rect.width + 24), viewport.innerWidth - 24);
      const availableHeight = popup ? viewport.innerHeight - 12 : Math.min(viewport.innerHeight - 24, manual.current ? viewport.innerHeight : Math.max(180, rect.top - 40));
      const maxWidth = Math.max(1, Math.min(zoomed ? 640 : 400, availableWidth - depth * 28));
      const maxHeight = Math.max(1, Math.min(zoomed ? 560 : 400, availableHeight - 64 - depth * 22));
      const visibleTargets = zoomed ? targets.filter((item) => (item.viewId ?? item.id) === zoomed) : targets.slice(0, 5);
      const sizes = visibleTargets.map((item, index) => {
        const size = frameSizes[item.viewId ?? item.id] ?? { width: 16, height: 9 };
        const scale = Math.min(maxWidth / size.width, maxHeight / size.height);
        return { width: size.width * scale + depth * 28, height: size.height * scale + index * 22 };
      });
      const width = Math.min(availableWidth, Math.max(240, ...sizes.map((size) => size.width)));
      const height = expanded ? Math.min(440, availableHeight) : Math.max(1, ...sizes.map((size) => size.height)) + 64;
      const clamp = (value, max) => Math.max(12, Math.min(value, Math.max(12, max)));
      const place = manual.current ? { left: clamp(manual.current.left, window.innerWidth - width - 12), top: clamp(manual.current.top, window.innerHeight - height - 12) } : { right: clamp(window.innerWidth - rect.right, window.innerWidth - width - 12), bottom: clamp(window.innerHeight - rect.top + 28, window.innerHeight - height - 12) };
      setPosition({ ...place, width, height, "--cu-card-max-width": maxWidth + "px", "--cu-card-max-height": maxHeight + "px" });
    };
    const observer = new ResizeObserver(update);
    layout.current = update;
    update();
    if (anchor?.current) observer.observe(anchor.current);
    window.addEventListener("resize", update);
    popup?.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      layout.current = null;
      observer.disconnect();
      window.removeEventListener("resize", update);
      popup?.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, sessionId, shown, zoomed, popup, expanded, depth, targetIds, sizeKey]);
  const frameSize = (id, size) => setFrameSizes((previous) => previous[id]?.width === size.width && previous[id]?.height === size.height ? previous : { ...previous, [id]: size });
  const startDrag = (event) => {
    if (popup || event.button !== 0 || event.isPrimary === false || event.target.closest("button")) return;
    const box = floating.current?.getBoundingClientRect();
    if (!box) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, element: event.currentTarget, x: event.clientX, y: event.clientY, left: box.left, top: box.top };
  };
  const moveDrag = (event) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) < 3 && !manual.current) return;
    manual.current = { left: active.left + event.clientX - active.x, top: active.top + event.clientY - active.y };
    setDragging(true);
    layout.current?.();
  };
  (0, import_react15.useEffect)(() => {
    if (!popup) return;
    const sync = () => {
      const source = getComputedStyle(anchor?.current ?? document.documentElement);
      for (const key2 of ["--dsw-alias-bg-base", "--dsw-alias-label-primary", "--dsw-alias-label-tertiary", "--dsw-alias-state-error-primary"]) popup.document.documentElement.style.setProperty(key2, source.getPropertyValue(key2));
      popup.document.documentElement.className = document.documentElement.className;
      popup.document.documentElement.dataset.theme = document.documentElement.dataset.theme ?? "";
      popup.document.documentElement.style.colorScheme = getComputedStyle(document.documentElement).colorScheme;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true });
    observer.observe(document.body, { attributes: true });
    const theme = window.matchMedia("(prefers-color-scheme: dark)");
    theme.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      theme.removeEventListener("change", sync);
    };
  }, [popup]);
  const open = async () => {
    if (owned.current && !owned.current.closed) {
      owned.current.close();
      return;
    }
    if (!window.documentPictureInPicture) {
      onError("\u5F53\u524D\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u7F6E\u9876\u60AC\u6D6E\u9884\u89C8\uFF0C\u8BF7\u7528\u65B0\u7248 Chrome \u6253\u5F00 Oh My DSH\u3002");
      return;
    }
    const revision = generation.current;
    setOpening(true);
    try {
      const next = await window.documentPictureInPicture.requestWindow({ width: zoomed ? 640 : 400, height: zoomed ? 520 : 320 });
      if (revision !== generation.current) {
        next.close();
        return;
      }
      next.document.title = "Oh My DSH \xB7 \u64CD\u63A7\u9884\u89C8";
      const style = next.document.createElement("style");
      style.textContent = computer_use_default;
      next.document.head.append(style);
      owned.current = next;
      next.addEventListener("pagehide", () => {
        if (owned.current === next) {
          owned.current = null;
          setPopup(null);
        }
      }, { once: true });
      setPopup(next);
    } catch (error) {
      onError("\u65E0\u6CD5\u6253\u5F00\u60AC\u6D6E\u9884\u89C8\uFF1A" + error.message);
    } finally {
      setOpening(false);
    }
  };
  const stop = async () => {
    const revision = generation.current;
    setStopping(true);
    try {
      const next = await api2("stop", sessionId, {});
      if (revision === generation.current) onState(next);
    } catch (error) {
      if (revision === generation.current) setLocalError(error.message);
    } finally {
      if (revision === generation.current) setStopping(false);
    }
  };
  const resume = async () => {
    const revision = generation.current;
    setResuming(true);
    setLocalError("");
    try {
      const next = await api2("resume", sessionId, {});
      if (revision === generation.current) onState(next);
    } catch (error) {
      if (revision === generation.current) setLocalError(error.message);
    } finally {
      if (revision === generation.current) setResuming(false);
    }
  };
  const close = () => {
    setShown(false);
    owned.current?.close();
  };
  const resetPosition = () => {
    manual.current = null;
    layout.current?.();
  };
  const previewKey = (event) => {
    if (event.target.closest("input,textarea,select") || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (zoomed) setZoomed(null);
      else if (expanded) setExpanded(false);
      else close();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || targets.length < 2) return;
    event.preventDefault();
    event.stopPropagation();
    const index = Math.max(0, orderedTargets.findIndex((item) => (item.viewId ?? item.id) === (zoomed ?? front ?? key)));
    const next = orderedTargets[event.key === "Home" ? 0 : event.key === "End" ? orderedTargets.length - 1 : (index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) + orderedTargets.length) % orderedTargets.length], id = next.viewId ?? next.id;
    keyboardTarget.current = id;
    setFront(id);
    if (zoomed) setZoomed(id);
  };
  const selectPreview = async (item, index) => {
    const id = item.viewId ?? item.id;
    if (index > 0 && !zoomed) {
      setFront(id);
      setExpanded(false);
      return;
    }
    if (item.kind !== "tab") {
      setZoomed(id);
      return;
    }
    const revision = generation.current;
    setEntering(true);
    setLocalError("");
    try {
      const next = await api2("view-tab", sessionId, { tabId: item.id, browserId: item.browserId });
      if (revision !== generation.current) return;
      onState(next);
      if (revision !== generation.current) return;
      await onOpen?.();
      close();
    } catch (error) {
      if (revision === generation.current) setLocalError(error.message);
    } finally {
      if (revision === generation.current) setEntering(false);
    }
  };
  return /* @__PURE__ */ import_react15.default.createElement(import_react15.default.Fragment, null, !!targets.length && /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", disabled: state?.enabled === false, onClick: () => setShown(true), "aria-label": "\u60AC\u6D6E\u9884\u89C8", "aria-expanded": shown, title: "\u5728\u5BF9\u8BDD\u4E2D\u663E\u793A\u64CD\u63A7\u753B\u9762" }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "preview", size: 14 })), shown && state?.enabled !== false && targets.length > 0 && (0, import_react_dom2.createPortal)(/* @__PURE__ */ import_react15.default.createElement("div", { ref: popup ? null : floating, className: "tx-cu-floating" + (popup ? "" : " tx-cu-floating-inline") + (zoomed ? " is-zoomed" : "") + (dragging ? " is-dragging" : "") + (expanded && !zoomed ? " is-list" : ""), style: popup ? { "--cu-card-max-width": position["--cu-card-max-width"], "--cu-card-max-height": position["--cu-card-max-height"] } : position, "aria-label": "\u60AC\u6D6E\u64CD\u63A7\u9884\u89C8", onKeyDown: previewKey }, /* @__PURE__ */ import_react15.default.createElement("header", { onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: finishDrag, onPointerCancel: finishDrag, onLostPointerCapture: finishDrag, onDoubleClick: (event) => {
    if (!popup && !event.target.closest("button")) resetPosition();
  }, title: popup ? void 0 : "\u62D6\u52A8\u79FB\u52A8\u9884\u89C8\uFF0C\u53CC\u51FB\u6062\u590D\u9ED8\u8BA4\u4F4D\u7F6E" }, /* @__PURE__ */ import_react15.default.createElement("div", null, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: leading?.kind === "app" ? "screen" : "browser", size: 14 }), /* @__PURE__ */ import_react15.default.createElement("strong", { title: leading?.name || leading?.title }, leading?.name || leading?.title || "\u64CD\u63A7\u9884\u89C8"), targets.length > 1 && /* @__PURE__ */ import_react15.default.createElement("span", { className: "tx-cu-floating-count" }, targets.length)), /* @__PURE__ */ import_react15.default.createElement("div", null, !popup && manual.current && /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", "aria-label": "\u91CD\u7F6E\u9884\u89C8\u4F4D\u7F6E", title: "\u91CD\u7F6E\u4F4D\u7F6E", onClick: resetPosition }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "reset", size: 13 })), zoomed && /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", "aria-label": "\u7F29\u5C0F\u9884\u89C8", title: "\u7F29\u5C0F\u9884\u89C8", onClick: () => setZoomed(null) }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "shrink", size: 13 })), popup ? /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", "aria-label": "\u8FD4\u56DE\u5BF9\u8BDD", title: "\u8FD4\u56DE\u5BF9\u8BDD", onClick: () => {
    window.focus();
    popup.close();
  } }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "return", size: 13 })) : /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", "aria-label": "\u5F39\u51FA\u9884\u89C8", title: "\u5F39\u51FA\u4E3A\u72EC\u7ACB\u7A97\u53E3", disabled: opening, onClick: open }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "popout", size: 13 })), /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u64CD\u63A7\u9884\u89C8", title: "\u5173\u95ED\u9884\u89C8", onClick: close }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "close", size: 14 })))), expanded && !zoomed && /* @__PURE__ */ import_react15.default.createElement("div", { className: "tx-cu-preview-search" }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "search", size: 13 }), /* @__PURE__ */ import_react15.default.createElement("input", { type: "search", "aria-label": "\u7B5B\u9009\u9884\u89C8\u76EE\u6807", placeholder: "\u641C\u7D22\u7A97\u53E3\u6216\u7F51\u9875", value: query, onChange: (event) => setQuery(event.target.value), onKeyDown: (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query) setQuery("");
      else setExpanded(false);
    }
  } })), /* @__PURE__ */ import_react15.default.createElement("div", { className: "tx-cu-preview-stack" + (zoomed ? " is-focused" : expanded ? " is-expanded" : ""), style: { "--preview-count": zoomed ? 1 : Math.max(1, targets.length) }, "aria-label": "\u7A97\u53E3\u9884\u89C8\u5806\u53E0" }, targets.map((item, index) => {
    const id = item.viewId ?? item.id, size = frameSizes[id] ?? { width: 16, height: 9 };
    return /* @__PURE__ */ import_react15.default.createElement("div", { key: id, className: "tx-cu-preview-card", style: { "--preview-depth": index, "--preview-ratio": size.width / size.height, zIndex: targets.length - index, display: expanded && !zoomed && !matches(item) ? "none" : void 0 }, "data-target": id, "data-focused": id === zoomed ? true : void 0, "data-connection": connections[id] }, /* @__PURE__ */ import_react15.default.createElement(NativePreview, { sessionId, targetId: id, targetKind: item.kind, stacked: true, visible: true, state, url: url2, onError: (message) => setTargetErrors((previous) => previous[id] === message ? previous : { ...previous, [id]: message }), onConnection: (connection) => {
      setConnections((previous) => previous[id] === connection ? previous : { ...previous, [id]: connection });
      if (connection === "live") setTargetErrors((previous) => previous[id] ? { ...previous, [id]: null } : previous);
    }, onFrameSize: (size2) => frameSize(id, size2) }), /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", className: "tx-cu-preview-open", disabled: entering, "aria-label": (index > 0 && !zoomed ? "\u7F6E\u4E8E\u6700\u524D\uFF1A" : item.kind === "tab" ? "\u6253\u5F00\u7F51\u9875\uFF1A" : "\u653E\u5927\u9884\u89C8\uFF1A") + (item.name || item.title || "\u7F51\u9875"), onClick: () => selectPreview(item, index) }, /* @__PURE__ */ import_react15.default.createElement("span", null, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: item.kind === "app" ? "screen" : "browser", size: 12 }), /* @__PURE__ */ import_react15.default.createElement("span", { className: "tx-cu-preview-name" }, item.name || item.title || "\u7F51\u9875")), /* @__PURE__ */ import_react15.default.createElement("span", null, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: item.kind === "tab" ? "popout" : "expand", size: 12 }))));
  }), expanded && !zoomed && !targets.some(matches) && /* @__PURE__ */ import_react15.default.createElement("p", { className: "tx-cu-preview-empty" }, "\u6CA1\u6709\u5339\u914D\u7684\u7A97\u53E3\u6216\u7F51\u9875")), visibleError && /* @__PURE__ */ import_react15.default.createElement("p", { className: "tx-cu-error", role: "alert" }, visibleError), /* @__PURE__ */ import_react15.default.createElement("footer", null, /* @__PURE__ */ import_react15.default.createElement("span", null, entering ? "\u6B63\u5728\u6253\u5F00\u2026" : resuming || state?.resuming ? "\u6B63\u5728\u6062\u590D\u2026" : stopping || state?.status === "stopping" ? "\u6B63\u5728\u505C\u6B62\u2026" : state?.status === "stopped" ? "\u5DF2\u505C\u6B62 \xB7 \u53EF\u624B\u52A8\u64CD\u4F5C" : connections[leadingId] === "error" || connections[leadingId] === "closed" ? "\u753B\u9762\u5DF2\u65AD\u5F00" : state?.status === "running" ? "\u52A9\u624B\u6B63\u5728\u64CD\u4F5C" : "\u53EA\u8BFB\u9884\u89C8"), !zoomed && /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", "aria-label": "\u653E\u5927\u9884\u89C8", title: "\u4EC5\u653E\u5927\u67E5\u770B", onClick: () => setZoomed(leading.viewId ?? leading.id) }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "expand", size: 12 })), targets.length > 1 && /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", "aria-expanded": expanded && !zoomed, onClick: () => {
    if (zoomed) {
      setZoomed(null);
      setExpanded(true);
    } else setExpanded((value) => !value);
  } }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "stack", size: 12 }), zoomed ? "\u67E5\u770B\u5168\u90E8" : expanded ? "\u5806\u53E0" : "\u5C55\u5F00", " ", targets.length), state?.status === "stopped" ? /* @__PURE__ */ import_react15.default.createElement("button", { className: "tx-cu-resume", type: "button", "aria-label": "\u4ECE\u9884\u89C8\u6062\u590D\u52A9\u624B", title: "\u6062\u590D\u52A9\u624B\u63A7\u5236", disabled: resuming || state?.resuming || state?.transitioning, onClick: resume }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "play", size: 14 })) : /* @__PURE__ */ import_react15.default.createElement("button", { className: "tx-cu-stop", type: "button", "aria-label": "\u505C\u6B62\u64CD\u4F5C", title: "\u505C\u6B62\u64CD\u4F5C", disabled: stopping || state?.status === "stopping", onClick: stop }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "stop", size: 14 })))), popup?.document.body ?? document.body));
}

// src/client/page-annotation.jsx
var import_react16 = __toESM(require("react"), 1);

// src/computer-use/annotation-geometry.mjs
function pointInPolygon(point, polygon) {
  if (!polygon?.length) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function compareAnnotationPaint(a, b) {
  const x = a.paintPath ?? [a.paintOrder], y = b.paintPath ?? [b.paintOrder];
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return y[i] - x[i];
  return y.length - x.length || b.ancestry.length - a.ancestry.length || a.region.width * a.region.height - b.region.width * b.region.height;
}

// src/client/page-annotation.jsx
var styleFields = [["width", "\u5BBD\u5EA6"], ["height", "\u9AD8\u5EA6"], ["font-size", "\u5B57\u53F7"], ["color", "\u6587\u5B57\u989C\u8272"], ["background-color", "\u80CC\u666F\u989C\u8272"], ["padding-top", "\u4E0A\u5185\u8DDD"], ["padding-left", "\u5DE6\u5185\u8DDD"], ["margin-top", "\u4E0A\u5916\u8DDD"]];
function PageAnnotation({ sessionId, frame, target, inputActions, conversation, api: api2, compact = false }) {
  const [snapshot, setSnapshot] = (0, import_react16.useState)(null), [region, setRegion] = (0, import_react16.useState)(null), [comment, setComment] = (0, import_react16.useState)(""), [error, setError] = (0, import_react16.useState)(""), [busy, setBusy] = (0, import_react16.useState)(false);
  const [mode, setMode] = (0, import_react16.useState)("region"), [element, setElement] = (0, import_react16.useState)(null), [loading, setLoading] = (0, import_react16.useState)(false);
  const [hovered, setHovered] = (0, import_react16.useState)(null), [busyAction, setBusyAction] = (0, import_react16.useState)("");
  const [styleDraft, setStyleDraft] = (0, import_react16.useState)({}), [stylePreview, setStylePreview] = (0, import_react16.useState)(null);
  const controlEpoch = (0, import_react16.useRef)(0);
  const dialog = (0, import_react16.useRef)(null), image = (0, import_react16.useRef)(null), drag = (0, import_react16.useRef)(null), opener = (0, import_react16.useRef)(null), epoch = (0, import_react16.useRef)(0), request = (0, import_react16.useRef)(null), activeSession = (0, import_react16.useRef)(sessionId);
  activeSession.current = sessionId;
  (0, import_react16.useEffect)(() => {
    setSnapshot(null);
    setBusy(false);
    setBusyAction("");
    setLoading(false);
    setError("");
    setRegion(null);
    drag.current = null;
    return () => {
      epoch.current++;
      request.current?.abort();
    };
  }, [sessionId]);
  (0, import_react16.useEffect)(() => {
    if (snapshot) dialog.current?.showModal();
    else dialog.current?.close();
  }, [snapshot]);
  const close = () => {
    epoch.current++;
    request.current?.abort();
    dialog.current?.close();
    setSnapshot(null);
    setBusy(false);
    setBusyAction("");
    setLoading(false);
    setHovered(null);
    drag.current = null;
    opener.current?.focus({ preventScroll: true });
  };
  const open = async () => {
    if (!frame || frame.tabId !== target?.id) return;
    opener.current = document.activeElement;
    const revision = ++epoch.current;
    setRegion(null);
    setElement(null);
    setHovered(null);
    setStyleDraft({});
    setStylePreview(null);
    controlEpoch.current = 0;
    setMode("region");
    setComment("");
    setError("");
    setSnapshot({ sessionId, frame: { ...frame }, browserId: target.browserId });
    if (api2) {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        const result = await api2("annotation", sessionId, { actor: frame.actor, tabId: frame.tabId, controlEpoch: frame.controlEpoch }, controller.signal);
        if (revision === epoch.current && !controller.signal.aborted) setSnapshot({ sessionId, ...result, browserId: target.browserId });
      } catch (e) {
        if (revision === epoch.current && !controller.signal.aborted) setError(e.message);
      } finally {
        if (revision === epoch.current) setLoading(false);
      }
    }
  };
  const point = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
  };
  const select = (event) => {
    if (!drag.current) return;
    const end = point(event), start = drag.current;
    setRegion({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) });
  };
  const selectedPolygon = stylePreview?.element.polygon ?? element?.polygon;
  const pick = (start) => (snapshot?.elements ?? []).filter((e) => e.polygon ? pointInPolygon(start, e.polygon) : start.x >= e.region.x && start.x <= e.region.x + e.region.width && start.y >= e.region.y && start.y <= e.region.y + e.region.height).sort(compareAnnotationPaint)[0] ?? null;
  const clearSelection = () => {
    drag.current = null;
    setRegion(null);
    setElement(null);
    setHovered(null);
    setStyleDraft({});
    setStylePreview(null);
  };
  const showOriginal = () => {
    setStylePreview(null);
    setRegion(element?.region ?? null);
  };
  const previewStyles = async () => {
    if (!api2 || !element || !frame || frame.tabId !== snapshot?.frame.tabId) return;
    const revision = epoch.current, controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setBusyAction("preview");
    setError("");
    setHovered(null);
    try {
      const result = await api2("annotation-style", sessionId, { actor: frame.actor, tabId: frame.tabId, controlEpoch: Math.max(controlEpoch.current, frame.controlEpoch), sourceFrameId: snapshot.frame.id, elementKey: element.key, changes: Object.fromEntries(Object.entries(styleDraft).filter(([, value]) => value.trim())) }, controller.signal);
      if (revision !== epoch.current || controller.signal.aborted) return;
      controlEpoch.current = result.controlEpoch;
      setStylePreview(result);
      setRegion(result.element.region);
    } catch (e) {
      if (revision === epoch.current && !controller.signal.aborted) setError(e.message);
    } finally {
      if (revision === epoch.current) {
        setBusy(false);
        setBusyAction("");
      }
    }
  };
  const attach = async () => {
    if (!snapshot || !region || !image.current?.naturalWidth) return;
    const revision = epoch.current;
    setBusy(true);
    setBusyAction("attach");
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.current.naturalWidth;
      canvas.height = image.current.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image.current, 0, 0);
      context.strokeStyle = "#3877e8";
      context.lineWidth = Math.max(2, canvas.width / 400);
      const pixels = { x: Math.round(region.x * canvas.width), y: Math.round(region.y * canvas.height), width: Math.round(region.width * canvas.width), height: Math.round(region.height * canvas.height) };
      if (selectedPolygon?.length) {
        context.beginPath();
        selectedPolygon.forEach((p, i) => context[i ? "lineTo" : "moveTo"](p.x * canvas.width, p.y * canvas.height));
        context.closePath();
        context.stroke();
      } else context.strokeRect(pixels.x, pixels.y, pixels.width, pixels.height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("\u65E0\u6CD5\u751F\u6210\u6279\u6CE8\u56FE\u7247")), "image/png"));
      if (revision !== epoch.current || activeSession.current !== snapshot.sessionId) return;
      const capturedFrame = stylePreview?.frame ?? snapshot.frame;
      const metadata = { kind: "tab", id: capturedFrame.tabId, browser: snapshot.browserId, url: capturedFrame.url, capturedAt: new Date(capturedFrame.at).toISOString(), image: { width: canvas.width, height: canvas.height }, region: pixels, ...selectedPolygon ? { polygon: selectedPolygon.map((p) => ({ x: Math.round(p.x * canvas.width), y: Math.round(p.y * canvas.height) })) } : {}, comment, ...stylePreview ? { stylePreview: { changes: stylePreview.changes, computedStyles: stylePreview.element.styles, restored: stylePreview.restored, notice: "\u56FE\u7247\u5C55\u793A\u4E34\u65F6\u6837\u5F0F\u9884\u89C8\u3002\u4E34\u65F6\u4FEE\u6539\u5DF2\u6062\u590D\uFF1B\u82E5\u8981\u5B9E\u73B0\u6B64\u6548\u679C\uFF0C\u9700\u6309\u7528\u6237\u8981\u6C42\u4FEE\u6539\u5B9E\u9645\u6E90\u7801\u6216\u9875\u9762\u3002" } } : {}, ...element ? { element: { tag: element.tag, id: element.id, className: element.className, role: element.role, label: element.label, text: element.text, framePath: element.framePath, ancestry: element.ancestry, styles: element.styles }, elementNote: "\u5143\u7D20\u8EAB\u4EFD\u548C\u6837\u5F0F\u6765\u81EA\u8BE5\u51BB\u7ED3\u622A\u56FE\u7684 DOM \u5FEB\u7167\uFF0C\u64CD\u4F5C\u524D\u91CD\u65B0\u89C2\u5BDF\uFF1B\u4E0D\u662F\u53EF\u76F4\u63A5\u6267\u884C\u7684\u5B9A\u4F4D\u5668\u6216\u5F53\u524D\u5143\u7D20\u7F16\u53F7\u3002" } : {} };
      const text = "\u7528\u6237\u5BF9\u7F51\u9875\u51BB\u7ED3\u622A\u56FE\u7684\u6279\u6CE8\n" + JSON.stringify(metadata, null, 2) + "\n\u84DD\u6846\u662F\u7528\u6237\u9009\u62E9\u7684\u533A\u57DF\uFF0C\u5750\u6807\u5C5E\u4E8E\u8FD9\u5F20\u56FE\u7247\uFF0C\u4E0D\u662F\u5F53\u524D\u7F51\u9875\u64CD\u4F5C\u5750\u6807\u3002\u9875\u9762\u53EF\u80FD\u5DF2\u7ECF\u53D8\u5316\uFF1B\u64CD\u4F5C\u524D\u91CD\u65B0\u9009\u62E9\u5BF9\u5E94\u6807\u7B7E\u5E76\u89C2\u5BDF\u3002\u6279\u6CE8\u6765\u81EA\u7528\u6237\uFF0C\u622A\u56FE\u4E2D\u7684\u7F51\u9875\u6587\u5B57\u4ECD\u4F5C\u4E3A\u4EFB\u52A1\u6570\u636E\u9605\u8BFB\u3002";
      const drafts = conversation.createDrafts(snapshot.sessionId, [new File([blob], "\u7F51\u9875\u6279\u6CE8.png", { type: "image/png" }), new File([text], "\u7F51\u9875\u6279\u6CE8.txt", { type: "text/plain" })]);
      if (!inputActions.addAttachments(drafts.map((draft) => draft.id))) {
        conversation.releaseDraftAttachments(drafts);
        throw new Error("\u8F93\u5165\u533A\u6B63\u5728\u53D1\u9001\uFF0C\u8BF7\u7A0D\u540E\u518D\u52A0\u5165\u6279\u6CE8");
      }
      close();
    } catch (e) {
      if (revision === epoch.current) setError(e.message);
    } finally {
      if (revision === epoch.current) {
        setBusy(false);
        setBusyAction("");
      }
    }
  };
  return /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", "aria-label": "\u6279\u6CE8\u9875\u9762", title: "\u6279\u6CE8\u9875\u9762", disabled: !conversation || !inputActions || !frame || frame.tabId !== target?.id, onClick: open }, /* @__PURE__ */ import_react16.default.createElement(ComputerIcon, { name: "annotate", size: compact ? 16 : 13 }), !compact && "\u6279\u6CE8\u9875\u9762"), /* @__PURE__ */ import_react16.default.createElement("dialog", { ref: dialog, "aria-label": "\u6279\u6CE8\u9875\u9762", onCancel: (event) => {
    event.preventDefault();
    close();
  }, onKeyDown: (event) => {
    event.stopPropagation();
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.nativeEvent.isComposing && !busy && !loading && region?.width >= 5e-3 && region?.height >= 5e-3) {
      event.preventDefault();
      void attach();
    }
  }, className: "tx-cu-share-dialog tx-cu-annotation-dialog" }, /* @__PURE__ */ import_react16.default.createElement("header", null, /* @__PURE__ */ import_react16.default.createElement("div", null, /* @__PURE__ */ import_react16.default.createElement("strong", null, "\u6279\u6CE8\u9875\u9762"), /* @__PURE__ */ import_react16.default.createElement("small", null, "\u51BB\u7ED3\u753B\u9762 \xB7 \u4E0D\u4F1A\u70B9\u51FB\u771F\u5B9E\u7F51\u9875")), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", onClick: close, "aria-label": "\u5173\u95ED\u9875\u9762\u6279\u6CE8" }, /* @__PURE__ */ import_react16.default.createElement(ComputerIcon, { name: "close" }))), /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-modes", role: "toolbar", "aria-label": "\u6279\u6CE8\u5DE5\u5177" }, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", disabled: busy, "aria-pressed": mode === "region", onClick: () => {
    setMode("region");
    clearSelection();
  } }, /* @__PURE__ */ import_react16.default.createElement(ComputerIcon, { name: "region", size: 14 }), "\u5708\u9009\u533A\u57DF"), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", disabled: busy || loading || !snapshot?.elements, "aria-pressed": mode === "element", onClick: () => {
    setMode("element");
    clearSelection();
  } }, /* @__PURE__ */ import_react16.default.createElement(ComputerIcon, { name: "pointer", size: 14 }), "\u9009\u62E9\u5143\u7D20"), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", disabled: busy || !region, "aria-label": "\u6E05\u9664\u9009\u62E9", title: "\u6E05\u9664\u9009\u62E9", onClick: clearSelection }, /* @__PURE__ */ import_react16.default.createElement(ComputerIcon, { name: "reset", size: 14 })), loading && /* @__PURE__ */ import_react16.default.createElement("span", { role: "status" }, "\u6B63\u5728\u8BFB\u53D6\u9875\u9762\u5143\u7D20\u2026")), /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-workspace" }, /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-viewport" }, snapshot && /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-surface", onPointerDown: (event) => {
    if (stylePreview || loading || busy || event.button !== 0 || !image.current?.complete) return;
    event.preventDefault();
    const start = point(event);
    setHovered(null);
    if (mode === "element") {
      const selected = pick(start);
      setElement(selected);
      setStyleDraft({});
      setRegion(selected?.region ?? null);
      return;
    }
    drag.current = start;
    setRegion(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, onPointerMove: (event) => {
    if (mode === "element" && !busy && !loading && !stylePreview) {
      const next = pick(point(event));
      setHovered((previous) => previous?.key === next?.key ? previous : next);
    } else select(event);
  }, onPointerLeave: () => setHovered(null), onPointerUp: (event) => {
    select(event);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, onPointerCancel: () => {
    drag.current = null;
  } }, /* @__PURE__ */ import_react16.default.createElement("img", { ref: image, draggable: false, src: "data:" + (stylePreview?.frame ?? snapshot.frame).mediaType + ";base64," + (stylePreview?.frame ?? snapshot.frame).data, alt: "\u5F85\u6279\u6CE8\u7684\u51BB\u7ED3\u9875\u9762" }), selectedPolygon ? /* @__PURE__ */ import_react16.default.createElement("svg", { className: "tx-cu-annotation-outline", viewBox: "0 0 1 1", preserveAspectRatio: "none" }, /* @__PURE__ */ import_react16.default.createElement("polygon", { points: selectedPolygon.map((p) => p.x + "," + p.y).join(" "), vectorEffect: "non-scaling-stroke" })) : region && /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-region", style: { left: region.x * 100 + "%", top: region.y * 100 + "%", width: region.width * 100 + "%", height: region.height * 100 + "%" } }), hovered && hovered.key !== element?.key && /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, hovered.polygon ? /* @__PURE__ */ import_react16.default.createElement("svg", { className: "tx-cu-annotation-outline is-hover", viewBox: "0 0 1 1", preserveAspectRatio: "none" }, /* @__PURE__ */ import_react16.default.createElement("polygon", { points: hovered.polygon.map((p) => p.x + "," + p.y).join(" "), vectorEffect: "non-scaling-stroke" })) : /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-region is-hover", style: { left: hovered.region.x * 100 + "%", top: hovered.region.y * 100 + "%", width: hovered.region.width * 100 + "%", height: hovered.region.height * 100 + "%" } }), /* @__PURE__ */ import_react16.default.createElement("span", { className: "tx-cu-annotation-hover-label" }, hovered.tag, hovered.id ? "#" + hovered.id : ""))), /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-hint" }, stylePreview ? "\u6B63\u5728\u67E5\u770B\u6837\u5F0F\u9884\u89C8" : mode === "region" ? "\u62D6\u52A8\u5708\u9009\u8981\u8BA8\u8BBA\u7684\u533A\u57DF" : "\u79FB\u5165\u9884\u89C8\u5143\u7D20\uFF0C\u70B9\u51FB\u9009\u4E2D")), /* @__PURE__ */ import_react16.default.createElement("aside", { className: "tx-cu-annotation-inspector" }, /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-selection-heading" }, /* @__PURE__ */ import_react16.default.createElement("strong", null, element ? "\u5DF2\u9009\u5143\u7D20" : region ? "\u5DF2\u9009\u533A\u57DF" : "\u9009\u62E9\u5185\u5BB9"), region && /* @__PURE__ */ import_react16.default.createElement("small", null, Math.round(region.width * (image.current?.naturalWidth || snapshot?.frame.width || 0)), " \xD7 ", Math.round(region.height * (image.current?.naturalHeight || snapshot?.frame.height || 0)))), !region && /* @__PURE__ */ import_react16.default.createElement("p", { className: "tx-cu-annotation-empty" }, "\u5728\u5DE6\u4FA7\u5708\u9009\u533A\u57DF\u6216\u70B9\u9009\u5143\u7D20\uFF0C\u7136\u540E\u5199\u4E0B\u5E0C\u671B\u4FEE\u6539\u7684\u5185\u5BB9\u3002"), snapshot?.truncated && /* @__PURE__ */ import_react16.default.createElement("p", null, "\u5143\u7D20\u6E05\u5355\u5DF2\u8FBE\u663E\u793A\u4E0A\u9650\uFF0C\u53EF\u7528\u5708\u9009\u8865\u5145\u3002"), element && /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-element" }, /* @__PURE__ */ import_react16.default.createElement("strong", null, element.tag, element.id ? "#" + element.id : ""), /* @__PURE__ */ import_react16.default.createElement("span", null, element.label || element.text || element.role), /* @__PURE__ */ import_react16.default.createElement("details", null, /* @__PURE__ */ import_react16.default.createElement("summary", null, "\u5143\u7D20\u4FE1\u606F\u4E0E\u5F53\u524D\u6837\u5F0F"), /* @__PURE__ */ import_react16.default.createElement("pre", null, JSON.stringify({ ancestry: element.ancestry, styles: element.styles }, null, 2)))), !!element?.framePath?.length && /* @__PURE__ */ import_react16.default.createElement("p", { className: "tx-cu-annotation-frame" }, "\u6240\u5728\u6846\u67B6\uFF1A", element.framePath.map((frame2) => frame2.title || frame2.id || frame2.url).join(" \u203A ")), element && api2 && /* @__PURE__ */ import_react16.default.createElement("details", { className: "tx-cu-style-editor" }, /* @__PURE__ */ import_react16.default.createElement("summary", null, "\u8C03\u6574\u6837\u5F0F"), /* @__PURE__ */ import_react16.default.createElement("p", null, "\u9884\u89C8\u4F1A\u6682\u505C\u52A9\u624B\uFF1B\u751F\u6210\u753B\u9762\u540E\u6062\u590D\u4E34\u65F6\u6837\u5F0F\u3002"), /* @__PURE__ */ import_react16.default.createElement("div", null, styleFields.map(([property, label]) => /* @__PURE__ */ import_react16.default.createElement("label", { key: property }, label, /* @__PURE__ */ import_react16.default.createElement("input", { "aria-label": "\u9884\u89C8" + label, disabled: busy, placeholder: element.styles[property] || "\u4F8B\u5982 300px", value: styleDraft[property] ?? "", onChange: (event) => setStyleDraft({ ...styleDraft, [property]: event.target.value }) })))), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", disabled: busy || !Object.values(styleDraft).some((value) => value.trim()), onClick: previewStyles }, busyAction === "preview" ? "\u6B63\u5728\u9884\u89C8\u2026" : "\u9884\u89C8\u6837\u5F0F"), stylePreview && /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", disabled: busy, onClick: showOriginal }, "\u663E\u793A\u539F\u56FE"), /* @__PURE__ */ import_react16.default.createElement("p", { role: "status" }, "\u4E34\u65F6\u6837\u5F0F\u5DF2\u6062\u590D\uFF0C\u5F53\u524D\u663E\u793A\u9884\u89C8\u56FE\u3002", stylePreview.restored.conflicts?.length ? "\u9875\u9762\u81EA\u884C\u6539\u53D8\u7684\u6837\u5F0F\u5DF2\u4FDD\u7559\u3002" : ""))), /* @__PURE__ */ import_react16.default.createElement("label", { className: "tx-cu-annotation-comment" }, "\u8BF4\u660E", /* @__PURE__ */ import_react16.default.createElement("textarea", { "aria-label": "\u6279\u6CE8\u8BF4\u660E", placeholder: "\u5E0C\u671B\u8FD9\u91CC\u600E\u4E48\u6539\uFF1F\uFF08\u53EF\u9009\uFF09", value: comment, onChange: (event) => setComment(event.target.value) })), error && /* @__PURE__ */ import_react16.default.createElement("p", { className: "tx-cu-error", role: "alert" }, error))), /* @__PURE__ */ import_react16.default.createElement("footer", null, /* @__PURE__ */ import_react16.default.createElement("small", null, "\u4EC5\u52A0\u5165\u8349\u7A3F\uFF0C\u4E0D\u4F1A\u53D1\u9001"), /* @__PURE__ */ import_react16.default.createElement("div", null, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", onClick: close }, "\u53D6\u6D88"), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", className: "tx-cu-primary", title: "\u52A0\u5165\u8F93\u5165\u6846\uFF08\u2318/Ctrl+Enter\uFF09", disabled: loading || busy || !region || region.width < 5e-3 || region.height < 5e-3, onClick: attach }, busyAction === "attach" ? "\u6B63\u5728\u52A0\u5165\u2026" : "\u52A0\u5165\u8F93\u5165\u6846")))));
}

// src/client/computer-use.jsx
var base = "/trisoul-x/computer-use/";
var url = (op, id) => base + op + "?session=" + encodeURIComponent(id);
async function api(op, id, value, signal) {
  const r = await fetch(url(op, id), value === void 0 ? { signal } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value), signal });
  const body = await r.json();
  if (!r.ok) throw Object.assign(new Error(body.error ?? "Computer Use \u8BF7\u6C42\u5931\u8D25"), { code: body.code });
  if (value !== void 0 && body.status) window.dispatchEvent(new CustomEvent("trisoul-cu-state", { detail: { id, state: body } }));
  return body;
}
function useStateView(id, visible = true) {
  const [state, setState] = (0, import_react17.useState)(null), [error, setError] = (0, import_react17.useState)(""), [connectionError, setConnectionError] = (0, import_react17.useState)("");
  (0, import_react17.useEffect)(() => {
    setState(null);
    setError("");
    if (!id || !visible) return;
    let live = true, timer, revision = 0;
    const update = (next) => setState((previous) => previous && ((next.controlEpoch ?? 0) < (previous.controlEpoch ?? 0) || (next.navigationRevision ?? 0) < (previous.navigationRevision ?? 0) || (next.viewRevision ?? 0) < (previous.viewRevision ?? 0)) ? previous : next);
    const changed = (e) => {
      if (e.detail.id === id) {
        revision++;
        update(e.detail.state);
        setError("");
      }
    };
    window.addEventListener("trisoul-cu-state", changed);
    const tick = async () => {
      const before = revision;
      try {
        const s = await api("state", id);
        if (live && revision === before) {
          update(s);
          setConnectionError("");
        }
      } catch (e) {
        if (live) setConnectionError(e.message);
      }
      if (live) timer = setTimeout(tick, 800);
    };
    void tick();
    return () => {
      live = false;
      clearTimeout(timer);
      window.removeEventListener("trisoul-cu-state", changed);
    };
  }, [id, visible]);
  return { state, error: error || connectionError, setState, setError };
}
var ScreenIcon = () => /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "screen", size: 17 });
var names = { running: "\u6B63\u5728\u64CD\u4F5C", idle: "\u5C31\u7EEA", stopped: "\u5DF2\u505C\u6B62", stopping: "\u6B63\u5728\u505C\u6B62", error: "\u9700\u8981\u5904\u7406" };
function ComputerChip({ sessionId, onOpen, inputActions, conversation }) {
  const { state, setState, setError, error } = useStateView(sessionId);
  const previewAnchor = (0, import_react17.useRef)(null);
  if (!sessionId || state?.enabled === false) return null;
  const active = !!state?.target && (state.status === "running" || state.status === "stopping" || state.status === "error" || state.transitioning);
  return /* @__PURE__ */ import_react17.default.createElement("div", { ref: previewAnchor, className: "tx-cu-chip", title: error || void 0 }, /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", className: "tx-cu-entry", "aria-label": "\u6253\u5F00 Computer Use", title: "\u67E5\u770B\u548C\u64CD\u4F5C\u5E94\u7528\u3001\u7F51\u9875", onClick: onOpen }, /* @__PURE__ */ import_react17.default.createElement(ScreenIcon, null), /* @__PURE__ */ import_react17.default.createElement("span", null, "\u7535\u8111")), /* @__PURE__ */ import_react17.default.createElement(FloatingPreview, { sessionId, state, url, api, onState: setState, onError: setError, anchor: previewAnchor, onOpen }), /* @__PURE__ */ import_react17.default.createElement(WindowShare, { sessionId, inputActions, conversation }), state?.vision?.input === "text" && /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-vision-warning", title: "\u5F53\u524D\u6A21\u578B\u4EC5\u63A5\u6536\u6587\u5B57\uFF0C\u622A\u56FE\u4E0D\u4F1A\u9001\u5165\u6A21\u578B\u3002" }, "\u4EC5\u6587\u672C\u6A21\u578B"), state?.target && /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-chip-status" }, state.resuming ? "\u6B63\u5728\u6062\u590D" : state.transitioning ? "\u6B63\u5728\u8F7D\u5165" : names[state.status]), active && /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", title: "\u505C\u6B62\u64CD\u4F5C", "aria-label": "\u505C\u6B62\u64CD\u4F5C", disabled: state.status === "stopping", onClick: () => api("stop", sessionId, {}).then(setState).catch((e) => setError(e.message)) }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "stop", size: 13 })), state?.status === "stopped" && !state.transitioning && /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", className: "tx-cu-chip-resume", onClick: () => api("resume", sessionId, {}).then(setState).catch((e) => setError(e.message)) }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "play", size: 12 }), "\u6062\u590D\u63A7\u5236"));
}
function ComputerPane({ sessionId, useTabInfo, inputActions, conversation }) {
  const { tab } = useTabInfo();
  const { state, error, setState, setError } = useStateView(sessionId, tab.visible);
  const target = state?.viewTarget ?? state?.target;
  const [busy, setBusy] = (0, import_react17.useState)(false), [navigation, setNavigation] = (0, import_react17.useState)(null), [frame, setFrame] = (0, import_react17.useState)(null), controls = (0, import_react17.useRef)(null);
  const [previewScale, setPreviewScale] = (0, import_react17.useState)("1"), [deviceMode, setDeviceMode] = (0, import_react17.useState)(false);
  (0, import_react17.useEffect)(() => {
    setNavigation(null);
  }, [target?.id]);
  const act = async (op, value = {}) => {
    setBusy(true);
    try {
      setState(await api(op, sessionId, value));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const browserActions = target?.kind === "tab" ? /* @__PURE__ */ import_react17.default.createElement(import_react17.default.Fragment, null, /* @__PURE__ */ import_react17.default.createElement(PageAnnotation, { compact: true, sessionId, frame: state.enabled ? frame : null, target, inputActions, conversation, api }), state?.target && target.id !== state.target.id && /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", "aria-label": "\u67E5\u770B\u52A9\u624B\u5F53\u524D\u753B\u9762", title: "\u67E5\u770B\u52A9\u624B\u5F53\u524D\u753B\u9762", onClick: () => act("view-tab", { current: true }) }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "return", size: 15 })), state?.status === "stopped" && !state?.transitioning ? /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", className: "is-resume", "aria-label": "\u6062\u590D\u52A9\u624B\u63A7\u5236", title: "\u6062\u590D\u52A9\u624B\u63A7\u5236", disabled: busy, onClick: () => act("resume") }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "play", size: 14 })) : /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", "aria-label": "\u505C\u6B62\u5E76\u63A5\u7BA1", title: "\u505C\u6B62\u5E76\u63A5\u7BA1", disabled: busy || state?.status === "stopping", onClick: () => act("stop") }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "stop", size: 14 }))) : null;
  return /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-pane" + (target?.kind === "tab" ? " tx-cu-pane-browser" : "") }, target?.kind !== "tab" && /* @__PURE__ */ import_react17.default.createElement("header", null, /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-pane-heading" }, /* @__PURE__ */ import_react17.default.createElement(ScreenIcon, null), /* @__PURE__ */ import_react17.default.createElement("div", null, /* @__PURE__ */ import_react17.default.createElement("strong", null, "Computer Use"), /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-status " + (state?.status === "running" ? "is-running" : "") }, state?.resuming ? "\u6B63\u5728\u6062\u590D" : state?.transitioning ? "\u6B63\u5728\u8F7D\u5165" : names[state?.status] ?? "\u8FDE\u63A5\u4E2D"))), state?.target && target?.id !== state.target.id && /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", onClick: () => act("view-tab", { current: true }) }, "\u67E5\u770B\u52A9\u624B\u5F53\u524D\u753B\u9762"), /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-toolbar" }, target?.kind === "tab" && /* @__PURE__ */ import_react17.default.createElement(PageAnnotation, { sessionId, frame: state.enabled ? frame : null, target, inputActions, conversation, api }), " ", state?.status === "stopped" && !state?.transitioning ? /* @__PURE__ */ import_react17.default.createElement("button", { className: "tx-cu-primary", onClick: () => act("resume") }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "play", size: 12 }), "\u6062\u590D\u52A9\u624B\u63A7\u5236") : target && /* @__PURE__ */ import_react17.default.createElement("button", { className: "tx-cu-stop", disabled: busy, onClick: () => act("stop") }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "stop", size: 12 }), "\u505C\u6B62\u5E76\u63A5\u7BA1"))), state?.vision?.input === "text" && /* @__PURE__ */ import_react17.default.createElement("p", { className: "tx-cu-vision-warning", role: "status" }, state.vision.name, " \u5F53\u524D\u4EC5\u63A5\u6536\u6587\u5B57\uFF0C\u622A\u56FE\u4E0D\u4F1A\u9001\u5165\u6A21\u578B\u3002\u9700\u8981\u770B\u56FE\u65F6\uFF0C\u8BF7\u5728\u8F93\u5165\u533A\u5207\u6362\u652F\u6301\u56FE\u7247\u7684\u6A21\u578B\uFF1B\u5E94\u7528\u63A7\u4EF6\u6587\u5B57\u4ECD\u53EF\u8BFB\u53D6\u3002"), !target && /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-empty" }, /* @__PURE__ */ import_react17.default.createElement(ScreenIcon, null), /* @__PURE__ */ import_react17.default.createElement("h3", null, "\u8BA9\u52A9\u624B\u64CD\u4F5C\u5E94\u7528\u548C\u7F51\u9875"), /* @__PURE__ */ import_react17.default.createElement("p", null, "\u5728\u5BF9\u8BDD\u4E2D\u7528 @ \u9009\u62E9\u5E94\u7528\u6216\u7F51\u9875\uFF0C", /* @__PURE__ */ import_react17.default.createElement("br", null), "\u4E5F\u53EF\u4EE5\u6253\u5F00\u6D4F\u89C8\u5668\u5F00\u59CB\u5DE5\u4F5C\u3002")), /* @__PURE__ */ import_react17.default.createElement(BrowserControls, { ref: controls, sessionId, state, visible: tab.visible, navigation, frame, api, onState: setState, onError: setError, previewScale, onPreviewScale: setPreviewScale, onDeviceModeChange: setDeviceMode, actions: browserActions }), target && target.kind !== "tab" && /* @__PURE__ */ import_react17.default.createElement("p", { className: "tx-cu-target" }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, null), target.name ?? "\u5F53\u524D\u5E94\u7528"), (error || state?.lastError) && /* @__PURE__ */ import_react17.default.createElement("p", { className: "tx-cu-error", role: "alert" }, error || state.lastError.message), target?.kind === "tab" ? /* @__PURE__ */ import_react17.default.createElement(BrowserPreview, { key: target.id, sessionId, tabId: target.id, pageUrl: navigation?.tabId === target.id ? navigation.url : target.url, visible: tab.visible, state, api, url, onState: setState, onError: setError, onNavigation: setNavigation, onFrame: setFrame, onBrowserShortcut: (action) => controls.current?.shortcut(action), onViewportResize: (size) => controls.current?.resizeViewport(size), deviceMode, previewScale }) : target?.kind === "app" ? /* @__PURE__ */ import_react17.default.createElement(NativePreview, { key: target.viewId, sessionId, targetId: target.viewId, visible: tab.visible, state, url, onError: setError }) : null, /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-pane-support" }, /* @__PURE__ */ import_react17.default.createElement(ComputerSetup, { sessionId, visible: tab.visible, api }), !!state?.history?.length && /* @__PURE__ */ import_react17.default.createElement("details", { className: "tx-cu-history" }, /* @__PURE__ */ import_react17.default.createElement("summary", null, "\u6700\u8FD1\u64CD\u4F5C \xB7 ", state.history.length), state.history.slice().reverse().map((h, i) => /* @__PURE__ */ import_react17.default.createElement("div", { key: i }, /* @__PURE__ */ import_react17.default.createElement("span", { className: h.ok || h.cancelled ? "" : "tx-cu-error" }, h.operation, h.cancelled ? " \xB7 \u5DF2\u53D6\u6D88" : ""), /* @__PURE__ */ import_react17.default.createElement("span", null, h.elapsedMs, " ms"), h.error && /* @__PURE__ */ import_react17.default.createElement("small", null, h.error))))));
}
function ComputerCard({ block, loadImage, toolName, openFile }) {
  const [open, setOpen] = (0, import_react17.useState)(false), bodyId = (0, import_react17.useId)();
  let args = {};
  try {
    args = JSON.parse(block.call?.argsRaw ?? block.argsRaw ?? "{}");
  } catch {
  }
  const settled = block.kind === "tool-result", failure = block.isError || block.meta?.computerUseError;
  const content = block.content ?? [], message = content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const images = content.filter((c) => c.type === "image");
  const files = block.meta?.computerUseFiles ?? [];
  const stopped = failure && /tool call aborted|COMPUTER_USE_STOPPED|Computer Use (?:was |is )?stopped|execution (?:was )?cancelled/i.test(message);
  const status = !settled ? "\u6267\u884C\u4E2D" : stopped ? "\u5DF2\u505C\u6B62" : failure ? "\u6267\u884C\u5931\u8D25" : "\u5DF2\u6267\u884C";
  return /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-card", "data-state": !settled ? "running" : stopped ? "stopped" : failure ? "error" : "idle" }, /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", className: "tx-cu-card-heading", "aria-expanded": open, "aria-controls": bodyId, onClick: () => setOpen((value) => !value) }, /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-card-leading" }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "screen", size: 16 }), /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { className: "tx-cu-card-chevron", name: "chevron", size: 14 })), /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-card-title" }, args.title ?? (toolName === "computer_use_reset" ? "\u91CD\u7F6E Computer Use" : "Computer Use")), !!images.length && /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-card-count" }, images.length, " \u5F20\u622A\u56FE"), !!files.length && /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-card-count" }, files.length, " \u4E2A\u6587\u4EF6"), /* @__PURE__ */ import_react17.default.createElement("small", { className: failure && !stopped ? "tx-cu-error" : settled && !stopped ? "tx-cu-visually-hidden" : "" }, status)), open && /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-card-body", id: bodyId }, !!images.length && /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-result-images" }, images.map((c, i) => /* @__PURE__ */ import_react17.default.createElement(SavedImage, { key: i, attachment: c.attachment, loadImage }))), !!files.length && /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-export-files" }, files.map((file, i) => /* @__PURE__ */ import_react17.default.createElement("button", { key: i, type: "button", onClick: () => openFile?.(file.path), disabled: !openFile, title: file.path }, file.name, /* @__PURE__ */ import_react17.default.createElement("small", null, Math.ceil(file.bytes / 1024), " KB")))), failure && /* @__PURE__ */ import_react17.default.createElement("p", { className: "tx-cu-error" }, message.split("\n").find((line) => line.trim()) || String(block.meta?.computerUseError || status)), !images.length && message && /* @__PURE__ */ import_react17.default.createElement("pre", null, message), /* @__PURE__ */ import_react17.default.createElement("details", null, /* @__PURE__ */ import_react17.default.createElement("summary", null, "\u67E5\u770B\u64CD\u4F5C\u4E0E\u7ED3\u679C"), args.code && /* @__PURE__ */ import_react17.default.createElement("pre", null, args.code), message && /* @__PURE__ */ import_react17.default.createElement("pre", null, message))));
}
function installComputerUseClient(ctx, shared) {
  const useOptions = () => (0, import_react17.useSyncExternalStore)(shared.subscribe, shared.current);
  installComputerReferenceMessages(ctx);
  computerGroupPresentation(ctx);
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "trisoul-x-computer-use";
    style.textContent = computer_use_default;
    document.head.append(style);
    return () => style.remove();
  });
  function ComputerEntry(props) {
    const { openPanel } = useOptions();
    return /* @__PURE__ */ import_react17.default.createElement(ComputerChip, { ...props, conversation: ctx.get("conversation"), onOpen: () => openPanel ? openPanel("computer") : ctx.sidebarRight.openTab("trisoul-x-computer-use") });
  }
  function StandaloneEntry(props) {
    const options = useOptions();
    return options.integrated ? null : /* @__PURE__ */ import_react17.default.createElement(ComputerEntry, { ...props });
  }
  ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({ name: "conversation.composer.dock", id: "trisoul-computer-use", order: 25 }, StandaloneEntry));
  const id = "trisoul_x/trisoul-x-computer-use";
  ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind: "trisoul-x-computer-use", title: () => "Computer Use", guide: [{ order: 6, title: () => "Computer Use", description: () => "\u67E5\u770B\u753B\u9762\u3001\u505C\u6B62\u64CD\u4F5C\u4E0E\u63A5\u7BA1\u63A7\u5236", icon: ScreenIcon }] }));
  function Pane(props) {
    const { renderPane } = useOptions();
    return renderPane ? renderPane(props) : /* @__PURE__ */ import_react17.default.createElement(ComputerPane, { ...props, conversation: ctx.get("conversation") });
  }
  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: id }, Pane));
  for (const key of ["computer_use", "computer_use_reset"]) ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key }, ComputerCard));
  ctx.inject(["inputTriggers"], (scope) => {
    let inventoryCache, inventoryAt = 0, inflight;
    const inventoryFor = async (id2) => {
      if (inventoryCache && Date.now() - inventoryAt < 4e3) return inventoryCache;
      if (!inflight) inflight = api("inventory", id2, {}).then((value) => {
        inventoryCache = value;
        inventoryAt = Date.now();
        return value;
      }).finally(() => {
        inflight = null;
      });
      return inflight;
    };
    scope.effect(() => scope.inputTriggers.registerSource({
      trigger: "@",
      name: "Computer Use",
      order: 15,
      async candidates(session, request) {
        const inventory = await inventoryFor(session.sessionId);
        if (request.signal.aborted) return [];
        const entries = [...inventory.browsers.map((b) => ({ name: b.type === "managed" ? "Browser" : b.name, description: b.type === "managed" ? "\u5185\u7F6E\u6D4F\u89C8\u5668 \xB7 \u72EC\u7ACB\u5DE5\u4F5C\u914D\u7F6E" : "\u6D4F\u89C8\u5668 \xB7 " + b.name, ref: { kind: "browser", id: b.id } })), ...inventory.browsers.flatMap((b) => b.tabs.map((t) => ({ name: t.title || t.url, description: "\u7F51\u9875 \xB7 " + t.url, ref: { kind: "tab", id: t.id, browser: b.id, url: t.url, title: t.title } }))), ...inventory.apps.map((a) => ({ name: a.displayName ?? a.id, description: a.isRunning ? "\u684C\u9762\u5E94\u7528 \xB7 \u6B63\u5728\u8FD0\u884C" : "\u684C\u9762\u5E94\u7528", ref: { kind: "app", id: a.id } }))];
        return entries.filter((e) => (e.name + " " + e.description).toLowerCase().includes(request.query.toLowerCase())).slice(0, 30).map((e) => ({ name: e.name, description: e.description, icon: "session", value: JSON.stringify({ ...e.ref, label: e.name }) }));
      },
      onPick: ({ candidate }) => ({ insert: { source: "Computer Use", ref: candidate.value, label: candidate.name, appearance: "session", clipboardText: "@" + candidate.name } }),
      codec: { clipboardText: (ref) => "@" + JSON.parse(ref).id, serialize: async (ref) => "<computer-use-target>" + JSON.stringify(JSON.parse(ref)).replaceAll("<", "\\u003c") + "</computer-use-target>" }
    }));
  });
  return { ComputerEntry };
}
var sharedKey = Symbol.for("opencu.client.v1");
function applyComputerUseClient(ctx, options = {}) {
  const root = ctx.root;
  let shared = root[sharedKey];
  if (!shared) {
    const owners = /* @__PURE__ */ new Map(), listeners = /* @__PURE__ */ new Set(), empty = {};
    shared = {
      owners,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      current: () => [...owners.values()].find((value) => value.integrated) ?? owners.values().next().value ?? empty,
      changed: () => {
        for (const listener of listeners) listener();
      }
    };
    root[sharedKey] = shared;
    shared.fiber = root.plugin({ name: "opencu-ui", inject: ["slots", "sidebarRightTabs", "sidebarRight"], apply(scope) {
      shared.entry = installComputerUseClient(scope, shared).ComputerEntry;
      shared.changed();
    } });
  }
  const owner = Symbol();
  shared.owners.set(owner, options);
  shared.changed();
  ctx.effect(() => () => {
    shared.owners.delete(owner);
    shared.changed();
    if (shared.owners.size) return;
    if (root[sharedKey] === shared) delete root[sharedKey];
    return shared.fiber.dispose();
  });
  function ComputerEntry(props) {
    (0, import_react17.useSyncExternalStore)(shared.subscribe, () => shared.entry);
    const Entry = shared.entry;
    return Entry ? /* @__PURE__ */ import_react17.default.createElement(Entry, { ...props }) : null;
  }
  return { ComputerEntry };
}

// src/client/index.jsx
var inject = ["slots", "sidebarRightTabs", "sidebarRight"];
function apply(ctx) {
  applyComputerUseClient(ctx);
}
return module.exports;}});
