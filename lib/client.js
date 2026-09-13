window.__ModuleLoader__.load({id:"trisoul_x",factory:(require)=>{var module={exports:{}};var exports=module.exports;
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
var import_react19 = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/frequency.mjs
var FREQUENCY_PRESETS = {
  always: { digestEvery: 16, stateEvery: 30, supplementMinSteps: 20, surgeryCooldownSteps: 10, minRegionTokens: 2e4 },
  medium: { digestEvery: 32, stateEvery: 60, supplementMinSteps: 30, surgeryCooldownSteps: 20, minRegionTokens: 4e4 },
  slow: { digestEvery: 48, stateEvery: 90, supplementMinSteps: 45, surgeryCooldownSteps: 30, minRegionTokens: 8e4 }
};

// src/client/context-history.mjs
var frameTokens = (nodes = []) => nodes.reduce((sum, node) => sum + (node.tokens || 0), 0);
function contextHistoryLayout(frames) {
  const max = Math.max(1, ...frames.flatMap((frame) => [frameTokens(frame.nodes), frame.inputTokens || 0, frame.cacheReadTokens || 0]));
  return frames.map((frame) => ({
    frame,
    tokens: frameTokens(frame.nodes),
    width: frameTokens(frame.nodes) / max * 100,
    inputWidth: (frame.inputTokens || 0) / max * 100,
    cacheWidth: Math.min(frame.cacheReadTokens || 0, frame.inputTokens ?? Infinity) / max * 100
  }));
}

// src/client/style.css
var style_default = ".tx-app, .tx-scope-chip, .tx-brand-mark, .tx-stats-line, .tx-wordmark, .tx-bt-option, .tx-bt-notice, .tx-workbench, .tx-composer-dock {\n  --tx-bg: var(--dsw-alias-bg-base, Canvas);\n  --tx-text: var(--dsw-alias-label-primary, CanvasText);\n  --tx-muted: var(--dsw-alias-label-tertiary, GrayText);\n  --tx-line: color-mix(in srgb, var(--tx-text) 11%, var(--tx-bg));\n  --tx-soft: color-mix(in srgb, var(--tx-text) 3%, var(--tx-bg));\n  --tx-blue: color-mix(in srgb, #3978e7 76%, var(--tx-text));\n  --tx-tint: color-mix(in srgb, var(--tx-blue) 6%, var(--tx-bg));\n  --tx-hover: color-mix(in srgb, var(--tx-text) 4%, var(--tx-bg));\n  --tx-danger: var(--dsw-alias-state-error-primary, #be555e);\n}\n.tx-bt-notice { box-sizing: border-box; width: min(400px, calc(100vw - 32px)); margin: auto; padding: 22px; border: 1px solid var(--tx-line); border-radius: 14px; background: var(--tx-bg); color: var(--tx-text); box-shadow: 0 18px 60px #0003; font: inherit; font-size: 13px; line-height: 1.7; }\n.tx-bt-notice::backdrop { background: #0005; }\n.tx-bt-notice h2 { margin: 0 0 10px; font-size: 15px; font-weight: 600; }\n.tx-bt-notice p { margin: 0; font-size: 13px; line-height: 1.75; }\n.tx-bt-notice > div { display: flex; justify-content: flex-end; margin-top: 20px; }\n.tx-bt-notice button { border: 1px solid var(--tx-blue); border-radius: 7px; background: var(--tx-blue); color: white; padding: 6px 16px; font: inherit; cursor: pointer; }\n.tx-app { height: 100%; min-height: 0; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; position: relative; background: var(--tx-bg); color: var(--tx-text); font-size: 13px; line-height: 1.65; container-type: inline-size; container-name: txpanel; font-variant-numeric: tabular-nums; }\n.tx-app *, .tx-app *::before, .tx-app *::after { box-sizing: border-box; }\n.tx-app h2, .tx-app h3, .tx-app p { margin: 0; }\n.tx-app h2 { font-size: 17px; font-weight: 600; letter-spacing: -.3px; line-height: 1.35; }\n.tx-app h3 { font-size: 13px; font-weight: 620; line-height: 1.5; }\n.tx-app svg { flex-shrink: 0; }\n.tx-page-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 20px 20px 18px; flex: 0 0 auto; }\n.tx-title-line { display: flex; align-items: center; gap: 12px; min-width: 0; }\n.tx-title-line p { color: var(--tx-muted); font-size: 11px; margin-top: 4px; }\n.tx-page-icon { height: 30px; width: 30px; border-radius: 8px; display: grid; place-items: center; background: var(--tx-soft); color: var(--tx-muted); flex-shrink: 0; }\n.tx-head-actions, .tx-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }\n.tx-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 20px 24px; scrollbar-width: thin; scrollbar-color: var(--tx-line) transparent; }\n.tx-section { padding: 20px 0; border-bottom: 1px solid var(--tx-line); }\n.tx-section:last-child { border-bottom: 0; }\n.tx-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 13px; }\n.tx-section-heading > span { text-align: right; }\n.tx-muted, .tx-help, .tx-footnote { color: var(--tx-muted); font-size: 11px; line-height: 1.65; }\n.tx-app .tx-help { margin-top: 10px; }\n.tx-footnote { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--tx-line); }\n.tx-error, .tx-danger { color: var(--tx-danger) !important; }\n.tx-app .tx-button { display: inline-flex; justify-content: center; align-items: center; gap: 6px; min-height: 32px; padding: 6px 11px; border: 1px solid var(--tx-line); border-radius: 8px; background: var(--tx-bg); color: var(--tx-text); font: inherit; font-size: 12px; font-weight: 500; line-height: 1.5; white-space: nowrap; cursor: pointer; transition: background .14s, border-color .14s, color .14s; }\n.tx-app .tx-button:hover { background: var(--tx-hover); border-color: color-mix(in srgb, var(--tx-text) 22%, var(--tx-line)); }\n.tx-app .tx-button.tx-primary { background: #2864d7; color: #fff; border-color: #2864d7; box-shadow: 0 1px 2px #15347110; }\n.tx-app .tx-button.tx-primary:hover { background: #2158c3; border-color: #2158c3; }\n.tx-app .tx-button.tx-quiet { border-color: transparent; background: transparent; color: var(--tx-muted); box-shadow: none; }\n.tx-app .tx-button.tx-quiet:hover { background: var(--tx-hover); color: var(--tx-text); }\n.tx-app .tx-button.tx-icon-button { padding: 6px; width: 30px; min-height: 30px; }\n.tx-app .tx-button:disabled { opacity: .45; cursor: default; }\n.tx-app .tx-primary:disabled { background: var(--tx-soft); border-color: var(--tx-line); color: var(--tx-muted); box-shadow: none; opacity: .7; }\n.tx-app button:focus-visible, .tx-app summary:focus-visible, .tx-scope-chip:focus-visible { outline: 2px solid var(--tx-blue); outline-offset: 3px; }\n.tx-app input:not([type=checkbox]), .tx-app select, .tx-app textarea { width: 100%; min-width: 0; appearance: auto; border: 1px solid var(--tx-line); border-radius: 8px; background: var(--tx-bg); color: var(--tx-text); padding: 9px 11px; outline: none; font: inherit; font-size: 12px; line-height: 1.5; transition: border-color .15s, box-shadow .15s; }\n.tx-app input:not([type=checkbox]):focus, .tx-app select:focus, .tx-app textarea:focus { border-color: var(--tx-blue); box-shadow: 0 0 0 3px var(--tx-tint); }\n.tx-app input::placeholder, .tx-app textarea::placeholder { color: var(--tx-muted); opacity: .65; }\n.tx-app textarea { resize: vertical; line-height: 1.9; min-height: 140px; }\n.tx-app input[type=checkbox] { accent-color: #2864d7; width: 14px; height: 14px; margin: 0; flex-shrink: 0; }\n.tx-field { display: flex; flex-direction: column; gap: 7px; min-width: 0; margin: 8px 0; }\n.tx-field > span { color: var(--tx-muted); font-size: 11px; }\n.tx-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 14px; row-gap: 2px; }\n.tx-tabs { display: flex; align-items: center; gap: 22px; padding: 0 22px; border-bottom: 1px solid var(--tx-line); flex-shrink: 0; }\n.tx-tabs > button { display: flex; align-items: center; gap: 6px; color: var(--tx-muted); font: inherit; font-size: 12px; cursor: pointer; padding: 10px 0 12px; border: 0; border-bottom: 2px solid transparent; background: transparent; }\n.tx-tabs > button[aria-selected=true] { color: var(--tx-blue); border-bottom-color: var(--tx-blue); font-weight: 600; }\n.tx-tabs > button > span { background: var(--tx-hover); min-width: 17px; height: 17px; line-height: 17px; text-align: center; border-radius: 5px; font-size: 10px; }\n.tx-segments { display: flex; padding: 3px; gap: 3px; border-radius: 9px; background: var(--tx-hover); min-width: 0; }\n.tx-segments > button { flex: 1; border: 1px solid transparent; border-radius: 6px; background: transparent; padding: 7px 10px; color: var(--tx-muted); font: inherit; font-size: 12px; line-height: 1.4; white-space: nowrap; cursor: pointer; }\n.tx-segments > button[aria-pressed=true] { color: var(--tx-blue); background: var(--tx-bg); border-color: var(--tx-line); box-shadow: 0 1px 3px #00000006; font-weight: 600; }\n.tx-inline-note { display: flex; align-items: center; gap: 8px; color: var(--tx-muted); font-size: 11px; padding-top: 12px; }\n.tx-inline-note svg { color: var(--tx-blue); }\n.tx-route-fields, .tx-route-list { margin-top: 12px; }\n.tx-choice-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }\n.tx-choice-grid > button { position: relative; padding: 12px; text-align: left; color: var(--tx-text); background: var(--tx-bg); border: 1px solid var(--tx-line); border-radius: 10px; cursor: pointer; font: inherit; }\n.tx-choice-grid > button[aria-pressed=true] { border-color: color-mix(in srgb, var(--tx-blue) 60%, var(--tx-line)); background: var(--tx-tint); }\n.tx-choice-grid strong { display: block; font-size: 12px; font-weight: 600; padding-right: 15px; margin-bottom: 5px; }\n.tx-choice-grid small { display: block; color: var(--tx-muted); font-size: 10px; line-height: 1.65; }\n.tx-choice-mark { position: absolute; top: 14px; right: 10px; width: 13px; height: 13px; border-radius: 50%; border: 1px solid var(--tx-line); color: white; display: grid; place-items: center; }\n[aria-pressed=true] > .tx-choice-mark { border-color: var(--tx-blue); background: var(--tx-blue); }\n.tx-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 13px 0; cursor: pointer; }\n.tx-toggle-row + .tx-toggle-row { border-top: 1px solid var(--tx-line); }\n.tx-toggle-row > span { min-width: 0; }\n.tx-toggle-row strong { font-size: 12px; font-weight: 500; display: block; }\n.tx-toggle-row small { font-size: 11px; color: var(--tx-muted); display: block; margin-top: 3px; }\n.tx-app .tx-toggle-row input { appearance: none; position: relative; width: 32px; height: 19px; border-radius: 20px; background: color-mix(in srgb, var(--tx-text) 16%, var(--tx-bg)); cursor: pointer; border: 1px solid transparent; transition: background .16s; }\n.tx-app .tx-toggle-row input::after { content: ''; position: absolute; width: 13px; height: 13px; border-radius: 50%; left: 2px; top: 2px; background: #fff; box-shadow: 0 1px 2px #00000020; transition: transform .16s; }\n.tx-app .tx-toggle-row input:checked { background: #2864d7; }\n.tx-app .tx-toggle-row input:checked::after { transform: translateX(13px); }\n.tx-app .tx-toggle-row input:focus-visible { outline: 2px solid var(--tx-blue); outline-offset: 3px; }\n.tx-switches { padding-top: 8px; padding-bottom: 8px; }\n.tx-fold { border: 1px solid var(--tx-line); border-radius: 10px; margin-top: 10px; }\n.tx-fold > summary { display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 15px 14px; }\n.tx-fold > summary > div { flex: 1; min-width: 0; }\n.tx-fold > summary strong { display: block; font-size: 12px; font-weight: 550; }\n.tx-fold > summary small { display: block; margin-top: 3px; font-size: 11px; color: var(--tx-muted); overflow-wrap: anywhere; }\n.tx-fold > summary > svg { color: var(--tx-muted); width: 14px; transition: transform .15s; }\n.tx-fold[open] > summary { border-bottom: 1px solid var(--tx-line); }\n.tx-app details[open] > summary > svg { transform: rotate(90deg); }\n.tx-app details > summary { list-style: none; }\n.tx-app details > summary::-webkit-details-marker { display: none; }\n.tx-fold-body { padding: 10px 14px 14px; }\n.tx-route-list .tx-fold { border-radius: 8px; }\n.tx-route-list .tx-fold > summary { padding: 11px 13px; }\n.tx-route-list .tx-fold > summary > div { display: flex; align-items: center; justify-content: space-between; gap: 14px; }\n.tx-route-list .tx-fold > summary small { margin: 0; font-size: 10px; }\n.tx-subfold { margin-top: 14px; border-top: 1px solid var(--tx-line); padding-top: 11px; }\n.tx-subfold > summary, .tx-memory-details > summary { font-size: 11px; color: var(--tx-muted); cursor: pointer; }\n.tx-subfold > summary::before, .tx-memory-details > summary::before { content: '+'; display: inline-block; margin-right: 7px; color: var(--tx-blue); }\n.tx-subfold[open] > summary::before, .tx-memory-details[open] > summary::before { content: '\u2212'; }\n.tx-app .tx-advanced-intro { margin: 17px 0; }\n.tx-savebar, .tx-batchbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 22px; background: var(--tx-bg); border-top: 1px solid var(--tx-line); flex-shrink: 0; }\n.tx-savebar > span { font-size: 11px; max-width: 55%; overflow-wrap: anywhere; }\n.tx-badge { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; max-width: 100%; border-radius: 5px; padding: 2px 7px; background: var(--tx-hover); color: var(--tx-muted); font-size: 10px; font-weight: 500; line-height: 1.7; }\n.tx-badge.tx-good, .tx-badge.tx-soft { background: var(--tx-tint); color: var(--tx-blue); }\n.tx-badge.tx-warn { background: color-mix(in srgb, var(--tx-danger) 8%, var(--tx-bg)); color: var(--tx-danger); }\n.tx-alert { border-radius: 8px; background: var(--tx-tint); color: var(--tx-blue); padding: 10px 12px; font-size: 11px; margin: 14px 0; overflow-wrap: anywhere; }\n.tx-alert-error { color: var(--tx-danger); background: color-mix(in srgb, var(--tx-danger) 8%, var(--tx-bg)); }\n.tx-empty { padding: 44px 16px; display: flex; flex-direction: column; align-items: center; text-align: center; }\n.tx-empty > span { display: grid; place-items: center; height: 52px; width: 52px; border: 0; border-radius: 14px; background: var(--tx-soft); color: var(--tx-muted); margin-bottom: 16px; }\n.tx-empty > h3 { font-size: 13px; font-weight: 550; }\n.tx-empty > p { font-size: 11px; color: var(--tx-muted); max-width: 280px; margin-top: 7px; line-height: 1.8; }\n.tx-row-between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }\n.tx-prose { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.9; }\n.tx-app pre { white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 7px; padding: 11px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.75; background: var(--tx-hover); margin: 9px 0; }\n.tx-context-summary { display: flex; align-items: center; justify-content: space-between; padding: 0 22px 13px; gap: 14px; font-size: 11px; color: var(--tx-muted); }\n.tx-context-summary > div { display: flex; align-items: center; gap: 7px; }\n.tx-context-summary strong { color: var(--tx-blue); font-size: 14px; }\n.tx-status-dot, .tx-component-dot { display: inline-block; width: 6px; height: 6px; background: var(--tx-blue); border-radius: 50%; flex-shrink: 0; }\n.tx-progress { height: 3px; background: var(--tx-hover); margin: 0 22px 9px; border-radius: 3px; overflow: hidden; }\n.tx-progress > i { height: 100%; display: block; background: var(--tx-blue); transition: width .3s; }\n.tx-task { border-bottom: 1px solid var(--tx-line); padding: 20px 0; }\n.tx-task-title { display: flex; align-items: flex-start; gap: 10px; }\n.tx-task-title > strong { font-size: 13px; font-weight: 550; flex: 1; min-width: 0; overflow-wrap: anywhere; }\n.tx-task-check { width: 17px; height: 17px; margin-top: 3px; display: grid; place-items: center; border: 1px solid var(--tx-line); border-radius: 5px; flex-shrink: 0; }\n.tx-task-check.is-done { color: var(--tx-blue); border-color: color-mix(in srgb, var(--tx-blue) 18%, var(--tx-line)); background: var(--tx-tint); }\n.tx-task-id { color: var(--tx-muted); font-family: ui-monospace, monospace; font-size: 10px; padding-top: 3px; }\n.tx-task-badges { display: flex; gap: 6px; padding-left: 27px; margin-top: 8px; }\n.tx-task-detail { margin: 13px 0 0 27px; }\n.tx-task-detail > summary { display: inline-flex; align-items: center; gap: 4px; color: var(--tx-muted); font-size: 11px; cursor: pointer; }\n.tx-quote { white-space: pre-wrap; overflow-wrap: anywhere; padding: 10px 12px; margin: 12px 0; border-left: 2px solid var(--tx-blue); background: var(--tx-tint); font-size: 12px; }\n.tx-quote small { display: block; color: var(--tx-muted); font-size: 10px; margin-top: 6px; }\n.tx-evidence { border-top: 1px solid var(--tx-line); padding: 13px 0 3px; }\n.tx-evidence strong { font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }\n.tx-evidence p { font-size: 12px; margin-top: 8px; }\n.tx-state-text { font-size: 13px; }\n.tx-pin { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; }\n.tx-pin svg { color: var(--tx-blue); margin-top: 3px; }\n.tx-pin span { overflow-wrap: anywhere; font-size: 12px; }\n.tx-document { font-size: 12px; line-height: 1.95; }\n.tx-note-line { padding: 12px 0; border-bottom: 1px solid var(--tx-line); }\n.tx-note-line:last-child { border-bottom: 0; padding-bottom: 0; }\n.tx-note-line small { display: block; margin-top: 7px; font-size: 10px; color: var(--tx-muted); }\n.tx-detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px 16px; align-items: start; padding: 10px 0; font-size: 11px; }\n.tx-detail-grid > span { color: var(--tx-muted); }\n.tx-detail-grid > strong { font-weight: 500; text-align: right; overflow-wrap: anywhere; max-width: 230px; }\n.tx-memory-tools { padding: 0 22px; flex-shrink: 0; }\n.tx-search { display: flex; align-items: center; gap: 8px; background: var(--tx-hover); border: 1px solid transparent; border-radius: 9px; padding: 0 11px; margin-bottom: 13px; color: var(--tx-muted); }\n.tx-search:focus-within { border-color: color-mix(in srgb, var(--tx-blue) 50%, var(--tx-line)); background: var(--tx-bg); }\n.tx-app .tx-search > input { border: 0; box-shadow: none !important; background: transparent; padding: 10px 0; }\n.tx-search .tx-icon-button { width: 24px; min-height: 24px; }\n.tx-memory-tools .tx-segments { width: auto; }\n.tx-memory-tools .tx-segments button { padding: 5px 10px; font-size: 11px; }\n.tx-filter-box { background: var(--tx-hover); border-radius: 9px; padding: 9px 13px; margin-top: 12px; }\n.tx-check { display: inline-flex; align-items: center; gap: 7px; color: var(--tx-muted); font-size: 11px; cursor: pointer; margin: 8px 14px 8px 0; }\n.tx-list-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 0 8px; gap: 12px; border-bottom: 1px solid var(--tx-line); }\n.tx-list-toolbar > span { font-size: 11px; color: var(--tx-muted); }\n.tx-list-toolbar .tx-button { font-size: 11px; padding: 4px 7px; min-height: 27px; }\n.tx-memory-item { padding: 20px 0 15px; border-bottom: 1px solid var(--tx-line); }\n.tx-memory-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.tx-memory-meta > div { min-width: 0; flex-shrink: 1; }\n.tx-memory-key { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx-muted); font-size: 10px; font-family: ui-monospace, monospace; }\n.tx-app p.tx-memory-text { margin: 12px 0 8px; line-height: 1.85; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }\n.tx-clamped { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }\n.tx-text-button { border: 0; background: transparent; color: var(--tx-blue); font: inherit; font-size: 11px; padding: 0; cursor: pointer; margin-bottom: 8px; }\n.tx-memory-bottom { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--tx-muted); font-size: 10px; }\n.tx-memory-bottom .tx-button { font-size: 10px; min-height: 25px; padding: 3px 5px; }\n.tx-memory-details { margin-top: 6px; }\n.tx-memory-details summary { font-size: 10px; }\n.tx-archived .tx-memory-text { color: var(--tx-muted); }\n.tx-selected-item { background: var(--tx-tint); margin: 0 -12px; padding-left: 12px; padding-right: 12px; border-radius: 8px; }\n.tx-memory-footer { padding-top: 20px; }\n.tx-shard { display: flex; flex-direction: column; gap: 3px; padding: 12px 0; border-top: 1px solid var(--tx-line); font-size: 10px; overflow-wrap: anywhere; }\n.tx-shard strong { font-weight: 500; }\n.tx-shard span { color: var(--tx-muted); }\n.tx-trace-row { padding: 11px 0; border-bottom: 1px solid var(--tx-line); }\n.tx-trace-row:last-child { border-bottom: 0; }\n.tx-trace-row > div { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; }\n.tx-trace-row strong { font-weight: 500; }\n.tx-trace-row span { color: var(--tx-muted); font-size: 10px; }\n.tx-trace-row p { margin-top: 7px; font-size: 11px; overflow-wrap: anywhere; }\n.tx-path { overflow-wrap: anywhere; }\n.tx-editor { position: absolute; inset: 0; z-index: 5; background: var(--tx-bg); display: flex; flex-direction: column; }\n.tx-editor .tx-body { padding-top: 4px; }\n.tx-batchbar { background: var(--tx-tint); font-size: 12px; }\n.tx-monitor-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 22px 15px; }\n.tx-monitor-top .tx-segments { width: auto; }\n.tx-monitor-top .tx-segments > button { font-size: 11px; padding: 6px 10px; }\n.tx-running-label { display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--tx-muted); }\n.tx-running-label .tx-status-dot { background: var(--tx-muted); opacity: .5; }\n.tx-running-label.is-running { color: var(--tx-blue); }\n.tx-running-label.is-running .tx-status-dot { background: var(--tx-blue); opacity: 1; box-shadow: 0 0 0 3px var(--tx-tint); }\n.tx-stats-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 20px 0 4px; }\n.tx-stat { border: 1px solid var(--tx-line); border-radius: 11px; padding: 15px; background: var(--tx-soft); min-width: 0; }\n.tx-stat > span { font-size: 11px; color: var(--tx-muted); display: block; }\n.tx-stat > strong { display: block; font-size: 25px; font-weight: 550; line-height: 1.35; letter-spacing: -.7px; margin-top: 7px; white-space: nowrap; }\n.tx-stat > small { font-size: 10px; color: var(--tx-muted); margin-top: 3px; display: block; }\n.tx-live-list { border-radius: 9px; background: var(--tx-tint); padding: 4px 13px; margin-top: 12px; }\n.tx-live-list > div { display: flex; align-items: center; gap: 10px; padding: 9px 0; }\n.tx-live-list > div > div { flex: 1; min-width: 0; }\n.tx-live-list strong { display: block; font-weight: 550; color: var(--tx-blue); font-size: 11px; }\n.tx-live-list small { font-size: 10px; color: var(--tx-muted); display: block; overflow-wrap: anywhere; }\n.tx-live-list > div > span:last-child { color: var(--tx-blue); font-size: 11px; }\n.tx-pulse { height: 6px; width: 6px; background: var(--tx-blue); border-radius: 50%; box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-blue) 12%, transparent); animation: tx-breathe 2s infinite; }\n@keyframes tx-breathe { 50% { opacity: .4; } }\n.tx-timeline { overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--tx-line) transparent; padding: 3px 0 8px; }\n.tx-timeline-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; font-size: 10px; width: max-content; min-width: 100%; }\n.tx-timeline-row > span { position: sticky; left: 0; background: var(--tx-bg); min-width: 65px; color: var(--tx-muted); z-index: 1; }\n.tx-timeline-row > div { display: flex; gap: 3px; }\n.tx-timeline-row button, .tx-timeline-row i { padding: 0; display: block; border: 0; width: 8px; height: 15px; background: var(--tx-hover); border-radius: 2px; }\n.tx-timeline-row button { cursor: pointer; }\n.tx-timeline-row .tx-call { background: var(--tx-blue); opacity: .75; }\n.tx-timeline-row .tx-call:hover { opacity: 1; transform: scaleY(1.25); }\n.tx-timeline-row .tx-call-error { background: var(--tx-danger); }\n.tx-legend { display: flex; align-items: center; flex-wrap: wrap; gap: 7px 13px; margin-top: 12px; font-size: 10px; color: var(--tx-muted); }\n.tx-legend > span { display: flex; align-items: center; gap: 5px; }\n.tx-legend i { width: 6px; height: 6px; border-radius: 2px; }\n.tx-component { border-bottom: 1px solid var(--tx-line); }\n.tx-component:last-child { border-bottom: 0; }\n.tx-component > summary { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 12px 0; cursor: pointer; font-size: 12px; }\n.tx-component > summary > span { display: flex; align-items: center; gap: 9px; }\n.tx-component > summary > span:last-child { gap: 12px; }\n.tx-component strong { font-size: 12px; font-weight: 550; }\n.tx-component small { font-size: 11px; color: var(--tx-muted); min-width: 65px; text-align: right; }\n.tx-component summary svg { color: var(--tx-muted); }\n.tx-component-dot { background: color-mix(in srgb, var(--tx-blue) 70%, var(--tx-line)); width: 5px; height: 5px; }\n.tx-component-dot.has-error { background: var(--tx-danger); }\n.tx-component-details { padding: 0 0 14px 14px; }\n.tx-call-filters { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 14px; margin-bottom: 6px; }\n.tx-call-filters .tx-field { flex: 1; max-width: 190px; }\n.tx-call-filters .tx-check { flex-shrink: 0; margin-right: 0; }\n.tx-call-row { border-bottom: 1px solid var(--tx-line); }\n.tx-call-row > summary { display: flex; align-items: center; gap: 11px; padding: 14px 0; cursor: pointer; }\n.tx-call-icon { width: 27px; height: 27px; background: var(--tx-tint); color: var(--tx-blue); border-radius: 8px; display: grid; place-items: center; flex-shrink: 0; }\n.tx-call-row summary > div { flex: 1; min-width: 0; }\n.tx-call-row summary strong { font-size: 12px; font-weight: 550; display: block; }\n.tx-call-row summary small { display: block; font-size: 10px; color: var(--tx-muted); margin-top: 2px; }\n.tx-call-row summary > span:not(.tx-call-icon), .tx-call-row summary > svg { color: var(--tx-muted); font-size: 11px; }\n.tx-failed-call .tx-call-icon { background: color-mix(in srgb, var(--tx-danger) 8%, var(--tx-bg)); color: var(--tx-danger); }\n.tx-call-detail { padding: 0 0 14px 38px; }\n.tx-context-number { display: flex; align-items: baseline; gap: 8px; font-size: 30px; letter-spacing: -.8px; font-weight: 500; padding-bottom: 18px; }\n.tx-context-number > span { font-size: 11px; letter-spacing: 0; color: var(--tx-muted); font-weight: 400; }\n.tx-frame-bar { display: flex; height: 15px; border-radius: 4px; overflow: hidden; background: var(--tx-hover); }\n.tx-frame-bar i { min-width: 0; }\n.tx-frame-row { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; font-size: 11px; border-bottom: 1px solid var(--tx-line); }\n.tx-frame-row span:last-child { color: var(--tx-muted); flex-shrink: 0; }\n.tx-context-history { padding: 24px 0 0; }\n.tx-history-chart { max-height: 280px; overflow: auto; margin: 15px 0; scrollbar-width: thin; }\n.tx-history-row { width: 100%; display: flex; align-items: center; gap: 9px; padding: 7px 6px; border: 0; border-radius: 5px; background: transparent; color: var(--tx-muted); font: inherit; font-size: 10px; cursor: pointer; text-align: left; }\n.tx-history-row:hover, .tx-history-row.tx-selected { background: var(--tx-hover); }\n.tx-history-row > span:first-child { width: 5em; flex-shrink: 0; font-variant-numeric: tabular-nums; }\n.tx-history-row > span:last-child { width: 48px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }\n.tx-history-scale { flex: 1; min-width: 0; }\n.tx-history-row .tx-frame-bar { height: 10px; border-radius: 2px; }\n.tx-history-usage { position: relative; height: 2px; margin-top: 3px; }\n.tx-history-usage > i, .tx-history-usage > b { position: absolute; left: 0; top: 0; height: 100%; border-radius: 2px; }\n.tx-history-usage > i { background: var(--tx-line); }\n.tx-history-usage > b { background: var(--tx-blue); }\n.tx-selected-frame { padding: 14px; margin-top: 18px; background: var(--tx-hover); border-radius: 9px; }\n.tx-wordmark { letter-spacing: -.6px; font-weight: 600; font-size: 16px; white-space: nowrap; color: var(--tx-text); }\n.tx-wordmark > span { color: var(--tx-blue); }\n.tx-scope-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 7px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--tx-muted); font: inherit; font-size: 11px; cursor: pointer; }\n.tx-scope-chip strong { font-weight: 500; }\n.tx-scope-chip:hover { background: var(--tx-hover); color: var(--tx-text); }\n.tx-bt-chip { gap: 6px; padding-inline: 8px; }\n.tx-bt-chip strong { font-weight: 650; letter-spacing: .2px; }\n.tx-bt-off { color: var(--tx-muted); background: transparent; border-color: var(--tx-line); }\n.tx-bt-option { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-width: 235px; padding: 3px 0; }\n.tx-bt-option strong { display: block; font-size: 12px; font-weight: 500; }\n.tx-bt-option small { display: block; color: var(--tx-muted); font-size: 10px; line-height: 1.5; margin-top: 3px; }\n.tx-bt-state { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }\n.tx-bt-state small { margin: 0; }\n.tx-bt-toggle { display: inline-flex; align-items: center; width: 26px; height: 16px; border-radius: 10px; padding: 2px; box-sizing: border-box; background: color-mix(in srgb, var(--tx-muted) 35%, transparent); }\n.tx-bt-toggle::before { content: ''; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px #0002; transition: transform .15s; }\n.tx-bt-toggle.tx-on { background: var(--tx-blue); }\n.tx-bt-toggle.tx-on::before { transform: translateX(10px); }\n.tx-stats-line { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; border: 0; border-radius: 7px; background: transparent; color: var(--tx-muted); padding: 4px 6px; font: inherit; font-size: 11px; line-height: 18px; cursor: pointer; }\n.tx-stats-line:hover { background: var(--tx-hover); color: var(--tx-text); }\n.tx-stats-running { width: 5px; height: 5px; border-radius: 50%; background: var(--tx-blue); }\n.tx-composer-dock { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; width: 100%; padding: 2px 0; color: var(--tx-muted); }\n.tx-composer-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; min-width: 0; }\n.tx-workbench-entry { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 7px; padding: 5px 7px; background: transparent; color: var(--tx-muted); font: 12px/18px -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; }\n.tx-usage-toggle { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; border: 0; border-radius: 7px; padding: 5px 7px; background: transparent; color: var(--tx-muted); font: 12px/18px -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; }\n.tx-usage-toggle:hover, .tx-usage-toggle[aria-expanded=true] { background: var(--tx-hover); color: var(--tx-text); }\n.tx-usage-toggle > svg:last-child { transform: rotate(-90deg); }\n.tx-usage-toggle[aria-expanded=true] > svg:last-child { transform: rotate(90deg); }\n.tx-workbench-entry:hover { background: var(--tx-hover); color: var(--tx-text); }\n.tx-workbench { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; color: var(--tx-text); background: var(--tx-bg); font: 13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }\n.tx-workbench-nav { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 10px 12px; border-bottom: 1px solid var(--tx-line); flex-shrink: 0; }\n.tx-workbench-nav button { display: flex; justify-content: center; align-items: center; gap: 6px; min-width: 0; padding: 8px 4px; border: 0; border-radius: 8px; background: transparent; color: var(--tx-muted); font: inherit; font-size: 12px; cursor: pointer; }\n.tx-workbench-nav button:hover { background: var(--tx-hover); }\n.tx-workbench-nav button[aria-current=page] { color: var(--tx-blue); background: var(--tx-tint); font-weight: 500; }\n.tx-workbench :is(.tx-workbench-nav button, .tx-workbench-entry):focus-visible, .tx-composer-dock button:focus-visible { outline: 2px solid var(--tx-blue); outline-offset: 2px; }\n.tx-workbench-page { flex: 1; min-height: 0; overflow: hidden; }\n.tx-workbench-page[hidden] { display: none; }\n@container txpanel (min-width: 600px) {\n  .tx-page-head { padding: 27px 30px 22px; }\n  .tx-body { padding-left: 30px; padding-right: 30px; }\n  .tx-tabs, .tx-memory-tools, .tx-monitor-top, .tx-context-summary { padding-left: 30px; padding-right: 30px; }\n  .tx-progress { margin-left: 30px; margin-right: 30px; }\n  .tx-stats-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n  .tx-stat { padding: 17px; }\n  .tx-stat > strong { font-size: 24px; }\n  .tx-choice-grid > button { padding: 15px; }\n}\n@container txpanel (max-width: 330px) {\n  .tx-page-head { padding: 19px 16px 16px; }\n  .tx-body { padding-left: 16px; padding-right: 16px; }\n  .tx-tabs, .tx-memory-tools, .tx-monitor-top, .tx-context-summary { padding-left: 16px; padding-right: 16px; }\n  .tx-tabs { gap: 18px; }\n  .tx-title-line { gap: 9px; }\n  .tx-title-line p { font-size: 10px; }\n  .tx-page-icon { width: 32px; height: 32px; border-radius: 9px; }\n  .tx-app h2 { font-size: 18px; }\n  .tx-form-grid { grid-template-columns: 1fr; }\n  .tx-choice-grid { gap: 5px; }\n  .tx-choice-grid > button { padding: 9px 8px; }\n  .tx-choice-grid strong { padding-right: 0; }\n  .tx-choice-mark { display: none; }\n  .tx-segments > button { padding-left: 7px; padding-right: 7px; }\n  .tx-savebar { padding: 12px 16px; }\n  .tx-task-detail { margin-left: 0; }\n  .tx-memory-bottom { align-items: flex-start; flex-direction: column; gap: 4px; }\n  .tx-detail-grid { gap: 8px; }\n}\n@media (prefers-reduced-motion: reduce) { .tx-app *, .tx-app *::before, .tx-app *::after { animation: none !important; transition: none !important; } }\n.tx-settings { --tx-bg: var(--dsw-alias-bg-layer-2, Canvas); }\n.tx-settings .tx-page-head { padding-top: 20px; padding-bottom: 16px; }\n.tx-settings .tx-section { padding-top: 18px; padding-bottom: 18px; }\n";

// src/client/shell.css
var shell_default = "/* DSH 0.1.5-rc.1 shell. Use public data attributes first; the few module\n   selectors below match the installed host and are covered by frontend UI QA. */\n.trisoul-shell {\n  --tx-shell-text: var(--dsw-alias-label-primary, CanvasText);\n  --tx-shell-muted: var(--dsw-alias-label-secondary, GrayText);\n  --tx-shell-bg: var(--dsw-alias-bg-base, Canvas);\n  --tx-shell-line: color-mix(in srgb, var(--tx-shell-text) 10%, var(--tx-shell-bg));\n  --tx-shell-hover: color-mix(in srgb, var(--tx-shell-text) 4%, var(--tx-shell-bg));\n  --dsw-specific-sidebar-fill: color-mix(in srgb, var(--tx-shell-text) 2.5%, var(--tx-shell-bg));\n  -webkit-font-smoothing: antialiased;\n}\n/* The hidden right pane overflows the grid. clip prevents focus/scrollIntoView\n   from horizontally scrolling the entire app, while keeping its paint bounds. */\n.trisoul-shell .pI_x6G_frame { overflow: clip; }\n.trisoul-shell .wSkVaW_root {\n  --dsh-chat-content-width: min(var(--dsh-chat-user-width, 760px), max(160px, calc(var(--dsh-conversation-column-width, 840px) - 64px)));\n  --dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px);\n}\n.trisoul-shell .wSkVaW_header { min-height: 56px; padding: 10px 20px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; border-bottom: 1px solid var(--tx-shell-line); }\n.trisoul-shell .wSkVaW_titleRow { flex: 1 1 240px; min-width: 0; }\n.trisoul-shell .wSkVaW_headerUtilities { margin-left: 10px; gap: 5px; }\n.trisoul-shell .wSkVaW_tabs { order: -1; flex: 0 0 auto; align-items: center; margin: 0; gap: 2px; padding: 2px; border-radius: 8px; background: var(--tx-shell-hover); }\n.trisoul-shell .wSkVaW_tab { padding: 5px 10px; border-radius: 6px; font-size: 12px; line-height: 18px; font-weight: 400; }\n.trisoul-shell .wSkVaW_tab:after { display: none; }\n.trisoul-shell .wSkVaW_tabActive { background: var(--tx-shell-bg); color: var(--tx-shell-text); box-shadow: 0 1px 3px #00000008; }\n.trisoul-shell [data-composer-card] {\n  border: 1px solid var(--tx-shell-line);\n  border-radius: 20px;\n  box-shadow: 0 2px 8px #00000004;\n  gap: 8px;\n  padding-top: 12px;\n  background: var(--dsw-specific-input-major, var(--tx-shell-bg));\n}\n.trisoul-shell [data-composer-card]:focus-within { border-color: color-mix(in srgb, #3877e8 26%, var(--tx-shell-line)); box-shadow: 0 2px 12px #00000008; }\n.trisoul-shell [data-composer-input] { min-height: 42px; padding: 4px 16px 0; font-size: var(--dsh-content-font-size, 15px); line-height: 25px; }\n.trisoul-shell [data-composer-placeholder] { left: 16px; font-size: 14px; color: var(--tx-shell-muted); }\n.trisoul-shell .uV2eYG_row { gap: 8px; padding: 4px 10px 10px; }\n.trisoul-shell :is(.uV2eYG_tools, .uV2eYG_modes, .uV2eYG_trailing) { gap: 7px; }\n.trisoul-shell .uV2eYG_add { background: transparent; width: 28px; height: 28px; color: var(--tx-shell-muted); }\n.trisoul-shell .uV2eYG_add:hover:not(:disabled) { background: var(--tx-shell-hover); }\n.trisoul-shell .uV2eYG_primary { width: 30px; height: 30px; transform: none; }\n.trisoul-shell [data-slot='conversation.composer.dock'] { display: flex !important; width: min(var(--dsh-composer-card-max-width), calc(100% - 32px)); max-width: none; padding: 2px 4px 8px; box-sizing: border-box; }\n.trisoul-shell .pXSMma_headline { font-size: 27px; font-weight: 500; letter-spacing: -.6px; gap: 12px; margin-bottom: 20px; }\n.trisoul-shell .pXSMma_previewBadge { font-size: 11px; line-height: 18px; font-weight: 400; color: var(--tx-shell-muted); background: var(--tx-shell-hover); border: 0; }\n.trisoul-shell .pXSMma_workspace { color: var(--tx-shell-muted); font-size: 12px; }\n.trisoul-shell .pXSMma_folder { color: var(--tx-shell-muted); }\n.trisoul-shell [data-slot='conversation.hero.brand.mark'] .tx-brand-mark { width: 64px; height: 64px; }\n\n/* Project navigation: compact rows, a quiet create action and a clear selection. */\n.trisoul-shell .hHd-Xa_root { border-right: 0; }\n.trisoul-shell .hHd-Xa_logoRow { height: 50px; margin-bottom: 6px; padding-bottom: 4px; }\n.trisoul-shell .hHd-Xa_newSession { justify-content: flex-start; border: 0; background: transparent; box-shadow: none; padding-left: 9px; font-size: 13px; font-weight: 500; }\n.trisoul-shell .hHd-Xa_newSession:hover { background: var(--tx-shell-hover); }\n.trisoul-shell .hHd-Xa_collapsed .hHd-Xa_newSession { justify-content: center; padding-left: 0; }\n.trisoul-shell .YDXeBa_title { font-size: 13px; }\n.trisoul-shell .YDXeBa_projectRow { height: 33px; font-weight: 500; }\n.trisoul-shell .YDXeBa_sessionRow { margin-block: 1px; border-radius: 7px; }\n.trisoul-shell .YDXeBa_sessionRow .YDXeBa_title { color: var(--dsw-alias-label-secondary, var(--tx-shell-text)); font-size: 13px; }\n.trisoul-shell .YDXeBa_sessionRow.YDXeBa_selected { background: color-mix(in srgb, #3877e8 8%, var(--tx-shell-bg)); }\n.trisoul-shell .YDXeBa_sessionRow.YDXeBa_selected .YDXeBa_title { color: var(--tx-shell-text); font-weight: 500; }\n.trisoul-shell :is(.YDXeBa_time, .YDXeBa_meta) { font-size: 11px; }\n.trisoul-shell .YDXeBa_rowActions { gap: 8px; }\n.trisoul-shell .bhn1Oq_searchButton { color: var(--tx-shell-muted); }\n.trisoul-shell [role=dialog]:not(.tx-cu-share-dialog) { border-radius: 16px; }\n@media (max-width: 760px) {\n  .trisoul-shell .wSkVaW_header { padding: 8px 12px; gap: 6px; }\n  .trisoul-shell .wSkVaW_titleRow { flex-basis: 200px; }\n  .trisoul-shell [data-composer-card] { border-radius: 16px; }\n  .trisoul-shell .uV2eYG_row { gap: 5px; padding-inline: 8px; }\n  .trisoul-shell :is(.uV2eYG_tools, .uV2eYG_modes, .uV2eYG_trailing) { gap: 4px; }\n  .trisoul-shell .tx-composer-dock { padding-inline: 2px; }\n}\n@media (max-width: 540px) {\n  .trisoul-shell .wSkVaW_titleRow { flex-basis: 100%; }\n  .trisoul-shell .wSkVaW_tabs { margin-left: 0; }\n}\n/* Reveal the original host statistics on demand; keep their live popovers. */\n.trisoul-shell [data-slot='conversation.composer.dock'] { align-items: center; flex-wrap: wrap; gap: 3px 10px; }\n.trisoul-shell .tx-composer-dock { display: contents; }\n.trisoul-shell .tx-composer-tools { order: 0; flex: 1 1 auto; }\n.trisoul-shell .tx-usage-toggle { order: 1; }\n.trisoul-shell [data-composer-stats] { display: none; order: 2; flex: 1 1 calc(100% - 130px); width: auto; max-width: none; margin: 0; padding: 4px 2px; gap: 8px; opacity: 1; }\n.trisoul-shell .tx-stats-line { display: none; order: 3; }\n.trisoul-shell[data-omd-usage-expanded] [data-composer-stats] { display: flex; }\n.trisoul-shell[data-omd-usage-expanded] .tx-stats-line { display: inline-flex; }\n.trisoul-shell .bOPqQW_pill { padding: 2px 4px; font-size: 11px; gap: 5px; }\n.trisoul-shell .bOPqQW_pill svg { width: 13px; height: 13px; }\n/* Process details read as a disclosure, with the response itself in focus. */\n.trisoul-shell .l_V-RG_root { height: 26px; border-bottom: 0; padding-bottom: 0; }\n.trisoul-shell .l_V-RG_label { font-size: 12px; color: var(--tx-shell-muted); }\n.trisoul-shell [data-disclosure-row] { min-height: 28px; font-size: 12px; }\n/* The process is one operation list, not a paragraph-spaced stack of cards.\n   Keep the host renderers, file actions and result bodies fully intact. */\n.trisoul-shell [data-chat-flow-kind=tool-call] { --dsh-chat-flow-gap: 2px; }\n.trisoul-shell [data-turn-process-member] { --dsh-chat-flow-gap: 2px; }\n.trisoul-shell [data-chat-flow-key]:has(.tx-cu-group, [data-cu-process-context]) { --dsh-chat-flow-gap: 2px; }\n.trisoul-shell .tx-cu-group [data-disclosure-row] { height: 26px; min-height: 26px; }\n.trisoul-shell [data-chat-flow-kind=assistant-step]:has(.tx-cu-group) { --dsh-chat-flow-gap: 2px; }\n.trisoul-shell [data-chat-flow-kind=assistant-step]:has(.tx-cu-process-answer[data-process-open]) { --dsh-chat-flow-gap: 2px; }\n.trisoul-shell .tx-cu-process-answer[data-process-open] .hWmORq_body { gap: 2px; }\n.trisoul-shell .tx-cu-process-answer[data-process-open] .hWmORq_body > :not(:has(> [data-variant=think])) { margin-top: 14px; }\n.trisoul-shell [data-turn-process-member][data-chat-flow-kind=context] [data-disclosure-row],\n.trisoul-shell [data-variant=think] [data-disclosure-row] { height: 26px; min-height: 26px; }\n/* The host fixes a collapsed Think container at 24px. Match its row so the\n   next operation never overlaps its 26px hit area. Expanded text stays auto. */\n.trisoul-shell .lcKema_root:not([data-expanded]) { height: 26px; }\n.trisoul-shell [data-chat-flow-kind=tool-call] :is(.o3BgMG_row, .CY-8Ka_root) { height: 26px; min-height: 26px; }\n.trisoul-shell [data-chat-flow-kind=tool-call] :is(.o3BgMG_title, .CY-8Ka_title) { font-size: var(--dsh-content-font-size-secondary, 13px); font-weight: 400; }\n.trisoul-shell [data-chat-flow-kind=tool-call] :is(.o3BgMG_sep, .CY-8Ka_sep) { background: transparent; width: 0; margin-inline: 3px; }\n.trisoul-shell [data-chat-flow-kind=tool-call] .o3BgMG_fileLink { color: var(--dsw-alias-label-tertiary, var(--tx-shell-muted)); }\n.trisoul-shell [data-chat-flow-kind=tool-call] .o3BgMG_fileLink:hover { color: var(--tx-shell-text); }\n.trisoul-shell [data-chat-flow-kind=context] [data-disclosure-row][aria-expanded=false] :is([data-context-source], .XrJvXW_sep) { display: none; }\n.trisoul-shell .hWmORq_actions { margin-top: 12px; }\n.trisoul-shell .xzv4MW_actions { gap: 5px; }\n.trisoul-shell :is(.xzv4MW_timeStart, .xzv4MW_timeEnd) { font-size: 11px; }\n.trisoul-shell .Q51KRG_trigger { font-size: 11px; gap: 4px; padding-inline: 6px; }\n.trisoul-shell .Sixlwa_bubble { border-radius: 18px; padding: 11px 16px; }\n";

// vendor/opencu/src/client/computer-icons.jsx
var import_react = __toESM(require("react"), 1);
function ComputerIcon({ name = "screen", size = 16, ...props }) {
  const paths = {
    globe: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "12", cy: "12", r: "9" }), /* @__PURE__ */ import_react.default.createElement("ellipse", { cx: "12", cy: "12", rx: "4", ry: "9" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M3 12h18" })),
    rotate: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("rect", { x: "3", y: "3", width: "9", height: "15", rx: "2" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M7 15h1m8-9a6 6 0 0 1 5 6m0-5v5h-5M15 16h4a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-9" })),
    region: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M8 3H4v4m12-4h4v4M4 17v4h4m8 0h4v-4M4 11v2m16-2v2M11 3h2m-2 18h2" })),
    pointer: /* @__PURE__ */ import_react.default.createElement("path", { d: "m5 3 14 10-7 1-3 7Z" }),
    plus: /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 5v14M5 12h14" }),
    minus: /* @__PURE__ */ import_react.default.createElement("path", { d: "M5 12h14" }),
    reset: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M3 10a9 9 0 1 1 2 8M3 4v6h6" })),
    history: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M3 10a9 9 0 1 1 2 8M3 4v6h6m3-4v6l4 2" })),
    download: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 3v12m-4-4 4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" })),
    book: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 5v16M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2Z" })),
    terminal: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("rect", { x: "3", y: "4", width: "18", height: "16", rx: "3" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "m7 8 3 3-3 3m6 2h4" })),
    search: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("circle", { cx: "10", cy: "10", r: "6" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "m15 15 6 6" })),
    image: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("rect", { x: "3", y: "3", width: "18", height: "18", rx: "3" }), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "8", cy: "8", r: "1.5" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "m3 17 5-5 4 4 4-7 5 8" })),
    screen: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("rect", { x: "3", y: "4", width: "18", height: "13", rx: "2.5" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M8 21h8m-4-4v4" })),
    browser: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("rect", { x: "3", y: "3", width: "18", height: "18", rx: "3" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M3 8h18M7 5.5h.01M10 5.5h.01" })),
    share: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("rect", { x: "3", y: "7", width: "18", height: "14", rx: "2.5" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 15V2m-4 4 4-4 4 4" })),
    preview: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2.5" }), /* @__PURE__ */ import_react.default.createElement("rect", { x: "11", y: "11", width: "7", height: "6", rx: "1" })),
    popout: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M14 3h7v7m0-7-9 9M10 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4" })),
    return: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M10 14H3V7m0 7 9-9m2 16h4a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h-4M3 18a3 3 0 0 0 3 3h4" })),
    close: /* @__PURE__ */ import_react.default.createElement("path", { d: "m6 6 12 12M6 18 18 6" }),
    expand: /* @__PURE__ */ import_react.default.createElement("path", { d: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" }),
    shrink: /* @__PURE__ */ import_react.default.createElement("path", { d: "M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5" }),
    chevron: /* @__PURE__ */ import_react.default.createElement("path", { d: "m9 5 7 7-7 7" }),
    stack: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("rect", { x: "6", y: "8", width: "15", height: "13", rx: "2.5" }), /* @__PURE__ */ import_react.default.createElement("path", { d: "M17 4H6a3 3 0 0 0-3 3v10" })),
    stop: /* @__PURE__ */ import_react.default.createElement("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2", fill: "currentColor", stroke: "none" }),
    play: /* @__PURE__ */ import_react.default.createElement("path", { d: "m8 5 11 7-11 7Z", fill: "currentColor", stroke: "none" }),
    annotate: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-6M15 3l6 6M10 14l-1 4 4-1L22 8a2 2 0 0 0-6-6Z" })),
    settings: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("path", { d: "M4 7h16M4 17h16" }), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "9", cy: "7", r: "3", fill: "var(--cu-bg, Canvas)" }), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "16", cy: "17", r: "3", fill: "var(--cu-bg, Canvas)" }))
  };
  return /* @__PURE__ */ import_react.default.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.65", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", ...props }, paths[name] ?? paths.screen);
}

// vendor/opencu/src/client/computer-use.jsx
var import_react17 = __toESM(require("react"), 1);

// vendor/opencu/src/client/computer-use.css
var computer_use_default = "/* DSH surfaces and blue accents, with compact controls and media-first previews. */\n.tx-cu-pane, .tx-cu-card, .tx-cu-chip, .tx-cu-group, .tx-cu-share,\n.tx-cu-share-dialog, .tx-cu-floating, .tx-cu-user-message, .tx-cu-image-dialog, .tx-cu-result-images, .tx-cu-group-toggle {\n  --cu-bg: var(--dsw-alias-bg-base, Canvas);\n  --cu-text: var(--dsw-alias-label-primary, CanvasText);\n  --cu-muted: var(--dsw-alias-label-tertiary, GrayText);\n  --cu-line: color-mix(in srgb, var(--cu-text) 12%, var(--cu-bg));\n  --cu-soft: color-mix(in srgb, var(--cu-text) 3%, var(--cu-bg));\n  --cu-hover: color-mix(in srgb, var(--cu-text) 6%, var(--cu-bg));\n  --cu-blue: #3877e8;\n  --cu-tint: color-mix(in srgb, var(--cu-blue) 9%, var(--cu-bg));\n  --cu-danger: var(--dsw-alias-state-error-primary, #c45252);\n  --cu-shadow: 0 8px 32px -8px #0003, 0 2px 6px #0000000a;\n  color: var(--cu-text);\n  font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n  font-variant-numeric: tabular-nums;\n  -webkit-font-smoothing: antialiased;\n}\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) *,\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) *::before,\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) *::after { box-sizing: border-box; }\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 30px;\n  border: 1px solid var(--cu-line);\n  border-radius: 8px;\n  padding: 5px 10px;\n  background: var(--cu-bg);\n  color: var(--cu-text);\n  font: inherit;\n  font-size: 12px;\n  line-height: 18px;\n  cursor: pointer;\n  transition: background .15s, border-color .15s, color .15s;\n}\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) button:hover:not(:disabled) { background: var(--cu-hover); }\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) button:disabled { opacity: .4; cursor: default; }\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) :is(button, input, select, textarea, summary):focus-visible {\n  outline: 2px solid var(--cu-blue);\n  outline-offset: 2px;\n}\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) svg { flex-shrink: 0; }\n:where(.tx-cu-pane, .tx-cu-share-dialog) :is(input:not([type=checkbox]), select, textarea) {\n  min-width: 0;\n  border: 1px solid var(--cu-line);\n  border-radius: 8px;\n  padding: 7px 10px;\n  background: var(--cu-bg);\n  color: var(--cu-text);\n  font: inherit;\n  font-size: 12px;\n}\n:where(.tx-cu-pane, .tx-cu-share-dialog) :is(input, textarea)::placeholder { color: var(--cu-muted); opacity: .8; }\n:where(.tx-cu-pane, .tx-cu-share-dialog, .tx-cu-floating) .tx-cu-primary {\n  background: var(--cu-blue);\n  color: #fff;\n  border-color: transparent;\n}\n:where(.tx-cu-pane, .tx-cu-share-dialog, .tx-cu-floating) .tx-cu-primary:hover:not(:disabled) { background: #2868d8; }\n.tx-cu-error { color: var(--cu-danger, #c45252) !important; overflow-wrap: anywhere; }\n.tx-cu-result-images { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 8px; }\n.tx-cu-image-button { display: block; width: 80px; height: 80px; padding: 0; overflow: hidden; border: 1px solid var(--cu-line); border-radius: 8px; background: var(--cu-bg); cursor: zoom-in; }\n.tx-cu-image-button .tx-cu-card-image { width: 100%; height: 100%; margin: 0; border: 0; border-radius: 0; object-fit: cover; }\n.tx-cu-image-retry { padding: 8px; color: var(--cu-danger); }\n.tx-cu-image-dialog { position: fixed; inset: 0; width: calc(100vw - 40px); height: calc(100dvh - 40px); max-width: none; max-height: none; margin: auto; padding: 0; border: 1px solid var(--cu-line); border-radius: 12px; background: var(--cu-bg); box-shadow: var(--cu-shadow); }\n.tx-cu-image-dialog::backdrop { background: #0009; }\n.tx-cu-image-dialog * { box-sizing: border-box; }\n.tx-cu-image-dialog header { min-height: 48px; padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-image-dialog header > span, .tx-cu-image-dialog header > div { display: flex; align-items: center; gap: 5px; }\n.tx-cu-image-dialog header > span { gap: 12px; font-size: 13px; }\n.tx-cu-image-dialog output { min-width: 40px; text-align: center; font-variant-numeric: tabular-nums; font-size: 11px; color: var(--cu-muted); }\n.tx-cu-image-dialog small { color: var(--cu-muted); font-size: 11px; }\n.tx-cu-image-dialog button, .tx-cu-image-dialog a { display: inline-flex; align-items: center; padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; text-decoration: none; }\n.tx-cu-image-dialog button:hover, .tx-cu-image-dialog a:hover { background: var(--cu-hover); }\n.tx-cu-image-dialog[open] { display: flex; flex-direction: column; }\n.tx-cu-image-canvas { flex: 1; min-height: 0; padding: 16px; overflow: auto; background: var(--cu-soft); touch-action: none; }\n.tx-cu-image-stage { min-width: 100%; min-height: 100%; width: max-content; display: flex; align-items: center; justify-content: center; }\n.tx-cu-image-canvas img { display: block; flex-shrink: 0; max-width: none; max-height: none; object-fit: contain; cursor: zoom-in; }\n.tx-cu-image-canvas.is-original img { cursor: grab; }\n.tx-cu-image-canvas.is-panning, .tx-cu-image-canvas.is-panning img { cursor: grabbing; }\n.tx-cu-image-dialog footer { padding: 6px 12px; text-align: center; color: var(--cu-muted); font-size: 10px; border-top: 1px solid var(--cu-line); }\n.tx-cu-image-dialog button:disabled { opacity: .4; cursor: default; }\n.tx-cu-image-loading { display: grid; place-items: center; width: 80px; height: 80px; border-radius: 8px; background: var(--cu-soft); color: var(--cu-muted); font-size: 10px; }\n.tx-cu-image-failure { display: flex; align-items: center; justify-content: center; min-height: 100%; gap: 12px; color: var(--cu-muted); font-size: 12px; }\n/* read_image keeps its original result in the host's inspect action. */\n.trisoul-shell .o3BgMG_imageBody :is(.o3BgMG_imageLabel, .o3BgMG_imageMeta) { display: none; }\n.tx-cu-muted { color: var(--cu-muted); }\n.tx-cu-pane > .tx-cu-error { padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--cu-danger) 7%, var(--cu-bg)); font-size: 12px; }\n\n/* The panel keeps the host layout and concentrates actions in its header. */\n.tx-cu-pane { height: 100%; padding: 18px 16px; overflow: auto; box-sizing: border-box; background: var(--cu-bg); container-type: inline-size; scrollbar-width: thin; }\n.tx-cu-pane > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }\n.tx-cu-pane-heading { display: flex; align-items: center; gap: 9px; min-width: 0; }\n.tx-cu-pane-heading > svg { color: var(--cu-muted); }\n.tx-cu-pane-heading > div { display: flex; flex-direction: column; gap: 1px; }\n.tx-cu-pane-heading strong { font-size: 13px; font-weight: 600; letter-spacing: -.15px; }\n.tx-cu-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--cu-muted); }\n.tx-cu-status::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .55; }\n.tx-cu-status.is-running { color: var(--cu-blue); }\n.tx-cu-status.is-running::before { opacity: 1; }\n.tx-cu-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-left: auto; }\n.tx-cu-toolbar button { min-height: 28px; padding: 4px 8px; font-size: 11px; }\n.tx-cu-toolbar .tx-cu-stop { background: var(--cu-soft); border-color: transparent; }\n.tx-cu-toolbar .tx-cu-stop:hover:not(:disabled) { background: var(--cu-hover); }\n.tx-cu-target { display: flex; align-items: center; gap: 7px; margin: 16px 0 9px; font-size: 12px; font-weight: 500; }\n.tx-cu-target svg { color: var(--cu-muted); }\n.tx-cu-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; margin: 12px 0 0; padding: 28px 18px 20px; text-align: center; }\n.tx-cu-empty > svg { width: 34px; height: 34px; margin-bottom: 16px; color: var(--cu-muted); stroke-width: 1.25; }\n.tx-cu-empty h3 { margin: 0 0 8px; font-size: 15px; font-weight: 550; letter-spacing: -.2px; }\n.tx-cu-empty p { max-width: 260px; margin: 0; color: var(--cu-muted); font-size: 12px; line-height: 1.75; }\n.tx-cu-information { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin: 24px 0; font-size: 12px; }\n.tx-cu-information span { color: var(--cu-muted); }\n.tx-cu-information strong { font-weight: 500; }\n\n/* Browser tabs preserve exact target identity; the strip remains keyboard accessible. */\n.tx-cu-browser-controls { position: relative; padding: 0 10px 6px; margin: 0 -16px; border-bottom: 1px solid var(--cu-line); background: var(--cu-bg); }\n.tx-cu-tabs { display: flex; align-items: center; gap: 4px; min-width: 0; margin-bottom: 7px; }\n.tx-cu-tablist { display: flex; align-items: center; gap: 3px; min-width: 0; max-width: calc(100% - 32px); overflow-x: auto; scrollbar-width: thin; }\n.tx-cu-browser-tab { display: flex; align-items: center; flex: 0 1 180px; min-width: 100px; max-width: 200px; border-radius: 8px; }\n.tx-cu-browser-tab.is-active { background: var(--cu-hover); }\n.tx-cu-tabs .tx-cu-browser-tab [role=tab] { width: auto; min-width: 0; flex: 1; justify-content: flex-start; padding: 5px 8px; color: var(--cu-text); }\n.tx-cu-browser-tab [role=tab] > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-browser-tab .tx-cu-tab-close { width: 22px; min-height: 22px; padding: 3px; margin-right: 3px; opacity: 0; }\n.tx-cu-browser-tab:is(:hover,:focus-within,.is-active) .tx-cu-tab-close { opacity: 1; }\n.tx-cu-tabs .tx-cu-tab-close:disabled { opacity: .35; }\n.tx-cu-tabs button, .tx-cu-address button { width: 28px; min-height: 28px; padding: 5px; flex-shrink: 0; border-color: transparent; background: transparent; color: var(--cu-muted); }\n.tx-cu-address { display: flex; align-items: center; gap: 2px; margin: 0; }\n.tx-cu-browser-navigation { display: grid; grid-template-columns: minmax(0,1fr) auto 28px 28px; gap: 2px; align-items: center; }\n.tx-cu-browser-actions { display: flex; align-items: center; gap: 2px; }\n.tx-cu-browser-actions > button { width: 28px; min-height: 28px; padding: 5px; border: 0; background: transparent; color: var(--cu-muted); }\n.tx-cu-browser-actions > .is-resume { color: var(--cu-blue); }\n.tx-cu-downloads { position: relative; }\n.tx-cu-downloads > button { border: 0; background: transparent; width: 28px; min-height: 28px; padding: 5px; color: var(--cu-muted); }\n.tx-cu-download-panel { position: absolute; z-index: 31; top: calc(100% + 5px); right: -30px; width: 320px; max-width: calc(100vw - 32px); max-height: min(480px,65vh); overflow: auto; padding: 12px; border: 1px solid var(--cu-line); border-radius: 12px; background: var(--cu-bg); box-shadow: var(--cu-shadow); font-size: 12px; }\n.tx-cu-download-panel header { display: flex; align-items: center; justify-content: space-between; }\n.tx-cu-download-panel header button { border: 0; background: transparent; min-height: 26px; padding: 5px; }\n.tx-cu-download-panel ul { list-style: none; padding: 0; margin: 8px 0; }\n.tx-cu-download-panel li { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-download-panel li > svg { flex-shrink: 0; margin-top: 2px; color: var(--cu-muted); }\n.tx-cu-download-panel li > div { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }\n.tx-cu-download-panel li strong { overflow-wrap: anywhere; font-weight: 500; }\n.tx-cu-download-panel :is(small,footer) { color: var(--cu-muted); overflow-wrap: anywhere; font-size: 11px; }\n.tx-cu-download-panel progress { width: 100%; height: 4px; accent-color: var(--cu-blue); }\n.tx-cu-download-filters { display: flex; gap: 6px; margin-top: 10px; }\n.tx-cu-download-filters input { min-width: 0; width: 0; flex: 1; }\n.tx-cu-download-filters select { width: 82px; }\n.tx-cu-download-filters :is(input,select) { min-height: 28px; padding: 4px 6px; font-size: 11px; }\n.tx-cu-download-panel footer, .tx-cu-browser-popover footer { display: flex; flex-direction: column; gap: 8px; }\n.tx-cu-download-panel footer > div, .tx-cu-browser-popover footer > div { display: flex; justify-content: space-between; gap: 8px; }\n.tx-cu-download-panel footer button, .tx-cu-browser-popover footer button { min-height: 26px; padding: 3px 5px; border: 0; background: transparent; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-browser-popover { position: absolute; z-index: 32; top: 76px; right: 10px; width: min(420px,calc(100% - 20px)); max-height: min(520px,70vh); overflow: auto; padding: 12px; border: 1px solid var(--cu-line); border-radius: 12px; background: var(--cu-bg); box-shadow: var(--cu-shadow); font-size: 12px; }\n.tx-cu-browser-popover header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }\n.tx-cu-browser-popover header button { border: 0; background: transparent; min-height: 26px; padding: 5px; }\n.tx-cu-browser-popover > input { width: 100%; min-height: 30px; font-size: 12px; }\n.tx-cu-history-entries h4 { margin: 14px 0 6px; font-size: 11px; font-weight: 500; color: var(--cu-muted); }\n.tx-cu-history-link { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 4px; text-align: left; border: 0; background: transparent; }\n.tx-cu-history-link > svg { flex-shrink: 0; color: var(--cu-muted); }\n.tx-cu-history-link > span { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }\n.tx-cu-history-link strong, .tx-cu-history-link small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }\n.tx-cu-history-link small, .tx-cu-history-link time { color: var(--cu-muted); font-size: 10px; }\n.tx-cu-history-more { margin-block: 8px; width: 100%; border: 0; background: transparent; font-size: 11px; }\n.tx-cu-browser-popover footer { border-top: 1px solid var(--cu-line); padding-top: 10px; margin-top: 12px; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-browser-tools { position: relative; }\n.tx-cu-browser-tools .tx-cu-browser-options { border: 0; background: transparent; width: 28px; padding: 0; min-height: 28px; font-size: 18px; color: var(--cu-muted); }\n.tx-cu-browser-menu { position: absolute; top: calc(100% + 5px); right: 0; z-index: 30; width: 240px; max-width: calc(100vw - 32px); padding: 5px; border: 1px solid var(--cu-line); border-radius: 16px; background: var(--cu-bg); box-shadow: var(--cu-shadow); }\n.tx-cu-browser-menu button { width: 100%; justify-content: flex-start; border: 0; background: transparent; padding: 6px 8px; }\n.tx-cu-browser-menu button > span { flex: 1; text-align: left; }\n.tx-cu-browser-menu kbd { margin-left: auto; font: inherit; font-size: 10px; color: var(--cu-muted); }\n.tx-cu-browser-menu hr { border: 0; border-top: 1px solid var(--cu-line); margin: 4px 6px; }\n.tx-cu-find .is-missing { color: var(--dsw-alias-state-error-primary,#c6333d); }\n.tx-cu-device-toolbar { grid-column: 1/-1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 5px -10px -6px; padding: 6px 10px; border-block: 1px solid var(--cu-line); background: var(--cu-soft); color: var(--cu-muted); font-size: 11px; }\n.tx-cu-device-toolbar :is(input,select,button) { min-height: 26px; padding: 3px 5px; font-size: 11px; }\n.tx-cu-device-toolbar input { width: 72px; min-width: 0; appearance: textfield; text-align: center; font-weight: 550; border-color: transparent; border-radius: 10px; background: var(--cu-hover); }\n.tx-cu-device-toolbar input::-webkit-inner-spin-button { appearance: none; }\n.tx-cu-device-toolbar select { width: 80px; border-color: transparent; background: transparent; }\n.tx-cu-device-toolbar .tx-cu-device-preset { width: clamp(88px,25cqw,176px); }\n.tx-cu-device-dimensions { display: flex; align-items: center; gap: 4px; }\n.tx-cu-device-toolbar button { border-color: transparent; background: transparent; }\n.tx-cu-device-toolbar button[hidden] { display: none; }\n.tx-cu-device-toolbar .tx-cu-device-close { margin-left: auto; }\n.tx-cu-device-apply { width: 26px; }\n.tx-cu-browser-tool-progress { position: absolute; right: 12px; bottom: -20px; z-index: 5; padding: 2px 6px; border-radius: 4px; background: var(--cu-bg); font-size: 11px; color: var(--cu-muted); }\n.tx-cu-find { grid-column: 1/-1; display: flex; align-items: center; gap: 3px; padding: 5px; border: 1px solid var(--cu-line); border-radius: 8px; margin: 3px 0; }\n.tx-cu-find input { flex: 1; width: 80px; min-width: 0; border: 0; background: transparent; padding: 3px; }\n.tx-cu-find > span { font-size: 11px; white-space: nowrap; color: var(--cu-muted); }\n.tx-cu-find button { width: 25px; padding: 3px; min-height: 26px; border: 0; background: transparent; }\n.tx-cu-location { position: relative; flex: 1; min-width: 0; }\n.tx-cu-address .tx-cu-location input { width: 100%; min-height: 30px; padding: 5px 32px 5px 9px; border-color: transparent; background: transparent; }\n.tx-cu-location > span { position: absolute; inset: 5px 32px 5px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; pointer-events: none; font-size: 12px; }\n.tx-cu-location .tx-cu-open-external { position: absolute; right: 1px; top: 1px; width: 28px; }\n.tx-cu-location:focus-within > span { display: none; }\n.tx-cu-location:not(:focus-within) input:not(:placeholder-shown) { color: transparent; }\n.tx-cu-location:focus-within input { background: var(--cu-soft); }\n.tx-cu-address button[type=submit] { display: none; }\n.tx-cu-browser-open { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }\n.tx-cu-pane:has(.tx-cu-empty) .tx-cu-browser-open { justify-content: center; margin: 0 0 30px; }\n.tx-cu-pane:has(.tx-cu-empty) .tx-cu-browser-open > button { background: var(--cu-blue); border-color: transparent; color: #fff; padding-inline: 14px; }\n.tx-cu-browser-open select { flex: 1 1 100%; width: 100%; }\n.tx-cu-loading { position: absolute; inset: auto 0 -1px; height: 2px; overflow: hidden; pointer-events: none; background: color-mix(in srgb,var(--cu-blue) 12%,transparent); }\n.tx-cu-loading::before { content: ''; position: absolute; width: 35%; height: 100%; background: var(--cu-blue); animation: tx-cu-loading 1.2s ease-in-out infinite; }\n@keyframes tx-cu-loading { from { transform: translateX(-100%); } to { transform: translateX(390%); } }\n.tx-cu-tab-loading { animation: tx-cu-tab-loading 1s ease-in-out infinite alternate; }\n@keyframes tx-cu-tab-loading { to { opacity: .3; } }\n.tx-cu-pane-browser { display: flex; flex-direction: column; padding-top: 6px; padding-bottom: 0; overflow: hidden; }\n.tx-cu-pane-browser > * { flex-shrink: 0; }\n.tx-cu-pane-browser > .tx-cu-browser-controls { z-index: 3; }\n.tx-cu-pane-browser > header { margin-bottom: 8px; }\n.tx-cu-pane-browser .tx-cu-pane-heading > div { flex-direction: row; align-items: center; gap: 8px; }\n.tx-cu-pane-browser > .tx-cu-live { display: flex; flex: 1 1 0; min-height: 100px; flex-direction: column; margin-inline: -16px; border: 0; border-radius: 0; }\n.tx-cu-pane-browser > .tx-cu-live > .tx-cu-preview-stage { flex: 1 1 0; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; }\n.tx-cu-pane-browser > .tx-cu-live > :not(.tx-cu-preview-stage) { flex-shrink: 0; }\n.tx-cu-pane-browser > .tx-cu-live > .tx-cu-live-meta { order: 1; padding: 5px 12px; background: transparent; border-top: 1px solid var(--cu-line); }\n.tx-cu-pane-browser > .tx-cu-live > .tx-cu-dialog { order: 2; }\n.tx-cu-pane-browser > .tx-cu-live.is-device { align-items: center; background: var(--cu-soft); }\n.tx-cu-preview-stage { position: relative; width: 100%; min-width: 0; }\n.tx-cu-pane-browser > .tx-cu-live.is-device > .tx-cu-preview-stage { max-height: none; }\n.tx-cu-pane-browser .tx-cu-pane-support { flex: 0 1 auto; min-height: 0; max-height: 40%; overflow: auto; scrollbar-width: thin; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-setup { margin-top: 0; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-setup-toggle { padding-block: 8px; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-history { margin-block: 0; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-history summary { padding-block: 8px; }\n.tx-cu-browser-blank { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: var(--cu-bg); color: var(--cu-muted); }\n.tx-cu-browser-blank h3 { color: var(--cu-text); font-size: 15px; font-weight: 550; margin: 16px 0 8px; }\n.tx-cu-browser-blank p { font-size: 13px; margin: 0; }\n.tx-cu-live.is-blank > .tx-cu-preview-stage { overflow: hidden; }\n.tx-cu-live.is-blank .tx-cu-live-surface { visibility: hidden; }\n.tx-cu-pane-browser > .tx-cu-live.is-blank > .tx-cu-live-meta { visibility: hidden; border-color: transparent; }\n@media (prefers-reduced-motion: reduce) { .tx-cu-loading::before, .tx-cu-tab-loading { animation: none; } }\n.tx-cu-live.is-device > .tx-cu-preview-stage { display: flex; align-items: flex-start; max-height: var(--cu-preview-height,none); overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; background: #3f3f3f; }\n.tx-cu-device-frame { position: relative; width: 100%; min-width: 0; }\n.tx-cu-device-frame.is-device { box-sizing: border-box; width: calc(var(--cu-device-width) + 40px); padding: 0 20px 20px; flex-shrink: 0; margin-inline: auto; }\n.tx-cu-device-frame.is-device > .tx-cu-live-surface { width: var(--cu-device-width); }\n.tx-cu-device-frame > .tx-cu-device-handle { position: absolute; z-index: 2; min-height: 0; padding: 0; border: 0; border-radius: 0; background: transparent; color: #b9b9b9; touch-action: none; }\n.tx-cu-device-frame > .tx-cu-device-handle:hover:not(:disabled) { background: #ffffff12; }\n.tx-cu-device-frame > .tx-cu-device-handle:focus-visible { outline-offset: -3px; }\n.tx-cu-device-handle::after { content: ''; display: block; }\n.tx-cu-device-handle:is(.is-left,.is-right) { top: 0; bottom: 20px; width: 20px; cursor: ew-resize; }\n.tx-cu-device-handle.is-left { left: 0; }\n.tx-cu-device-handle.is-right { right: 0; }\n.tx-cu-device-handle:is(.is-left,.is-right)::after { width: 4px; height: 30px; border-inline: 1px solid currentColor; }\n.tx-cu-device-handle.is-bottom { bottom: 0; left: 20px; right: 20px; height: 20px; cursor: ns-resize; }\n.tx-cu-device-handle.is-bottom::after { height: 4px; width: 30px; border-block: 1px solid currentColor; }\n.tx-cu-device-handle:is(.is-bottom-left,.is-bottom-right) { bottom: 0; width: 20px; height: 20px; }\n.tx-cu-device-handle.is-bottom-left { left: 0; cursor: nesw-resize; }\n.tx-cu-device-handle.is-bottom-right { right: 0; cursor: nwse-resize; }\n.tx-cu-device-handle:is(.is-bottom-left,.is-bottom-right)::after { width: 11px; height: 4px; border-block: 1px solid currentColor; transform: rotate(45deg); }\n.tx-cu-device-handle.is-bottom-right::after { transform: rotate(-45deg); }\n.tx-cu-device-ghost-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3; }\n.tx-cu-device-ghost { position: absolute; top: 0; box-sizing: border-box; border: 2px solid var(--cu-blue); }\n.tx-cu-device-ghost-layer output { position: absolute; left: 50%; top: 6px; transform: translateX(-50%); padding: 3px 6px; border-radius: 4px; background: #252525; color: #fff; font-size: 11px; white-space: nowrap; }\n.tx-cu-live.is-device > :is(.tx-cu-live-meta,.tx-cu-dialog) { align-self: stretch; }\n@container (max-width: 320px) {\n  .tx-cu-address button[type=submit] { display: none; }\n}\n\n/* Live surfaces: image geometry is shared by the screenshot and assistant cursor. */\n.tx-cu-preview, .tx-cu-live { position: relative; overflow: hidden; border: 1px solid var(--cu-line); border-radius: 10px; }\n.tx-cu-preview img { display: block; width: 100%; height: auto; background: #fff; }\n.tx-cu-preview small { display: block; padding: 8px 10px; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-live-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; color: var(--cu-muted); font-size: 10px; background: var(--cu-soft); }\n.tx-cu-live-dot::before { content: ''; display: inline-block; width: 5px; height: 5px; margin-right: 6px; border-radius: 50%; background: #28966b; }\n.tx-cu-live-surface { position: relative; overflow: hidden; touch-action: none; overscroll-behavior: contain; line-height: 0; outline-offset: -2px; }\n.tx-cu-live-surface:focus-within { outline: 2px solid var(--cu-blue); }\n.tx-cu-live-surface > img, .tx-cu-observed-image > img { display: block; width: 100%; height: auto; user-select: none; -webkit-user-drag: none; background: #fff; }\n.tx-cu-observed-image { position: relative; line-height: 0; }\n.tx-cu-live-placeholder { display: grid; place-items: center; min-height: 220px; padding: 16px; color: var(--cu-muted); font-size: 12px; line-height: 1.5; background: var(--cu-soft); }\n.tx-cu-live-overlay { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: #171717a6; color: #fff; font-size: 12px; line-height: 1.5; pointer-events: none; }\n.tx-cu-keyboard { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; padding: 0; border: 0; pointer-events: none; resize: none; }\n.tx-cu-dialog { padding: 14px; border-top: 1px solid var(--cu-line); background: var(--cu-bg); }\n.tx-cu-dialog p { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 12px; font-size: 12px; }\n.tx-cu-dialog input { width: 100%; }\n.tx-cu-dialog > div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }\n.tx-cu-reconnect { margin: 8px; }\n.tx-cu-assistant-cursor { position: absolute; z-index: 2; pointer-events: none; transform: translate(-2px,-2px); filter: drop-shadow(0 2px 3px #0005); transition: left 35ms linear,top 35ms linear; line-height: 0; }\n.tx-cu-assistant-cursor.is-pressed { transition: none; }\n.tx-cu-assistant-cursor svg { display: block; transform-origin: 2px 2px; }\n.tx-cu-assistant-cursor.is-pressed svg { transform: scale(.9); }\n.tx-cu-cursor-pulse { position: absolute; z-index: 2; pointer-events: none; left: 2px; top: 2px; width: 22px; height: 22px; margin: -11px; border: 2px solid #fff; box-shadow: 0 0 0 1px #377cdb99; border-radius: 50%; animation: tx-cu-cursor-click .25s ease-out both; }\n@keyframes tx-cu-cursor-click { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.3); } }\n\n/* One quiet strip below the composer, plus collapsible conversation records. */\n.tx-cu-chip { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; padding: 2px 0; font-size: 11px; }\n.tx-cu-chip button { min-height: 26px; padding: 3px 7px; border-color: transparent; background: transparent; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-chip .tx-cu-entry { color: var(--cu-text); }\n.tx-cu-chip .tx-cu-entry svg { color: var(--cu-muted); }\n.tx-cu-chip-status { display: inline-flex; align-items: center; gap: 5px; margin-inline: 5px; color: var(--cu-muted); font-size: 10px; }\n.tx-cu-chip .tx-cu-chip-resume { color: var(--cu-blue); }\n.tx-cu-share { font-size: 11px; }\n.tx-cu-share-entry { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 7px; background: transparent; color: var(--cu-muted); padding: 3px 7px; font: inherit; cursor: pointer; }\n.tx-cu-share-entry:hover { background: var(--cu-hover); }\n.tx-cu-card { margin: 0; max-width: 100%; min-width: 0; }\n.tx-cu-card-heading { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; min-height: 26px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--cu-muted); text-align: left; font: var(--dsh-content-font-size-secondary, 13px)/26px -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; }\n.tx-cu-card-heading:hover { color: var(--dsw-alias-label-secondary, var(--cu-text)); }\n.tx-cu-card-heading:focus-visible, .tx-cu-group-toggle:focus-visible { outline: 2px solid var(--cu-blue); outline-offset: 2px; }\n.tx-cu-card-heading svg { flex-shrink: 0; }\n.tx-cu-card-leading { position: relative; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex-shrink: 0; }\n.tx-cu-card-chevron { position: absolute; opacity: 0; }\n.tx-cu-card-heading:is(:hover, :focus-visible, [aria-expanded=true]) .tx-cu-card-leading > svg:first-child { opacity: 0; }\n.tx-cu-card-heading:is(:hover, :focus-visible, [aria-expanded=true]) .tx-cu-card-chevron { opacity: 1; }\n.tx-cu-card-chevron, .tx-cu-disclosure { transition: transform .15s; }\n[aria-expanded=true] .tx-cu-card-chevron, [aria-expanded=true] > .tx-cu-disclosure { transform: rotate(90deg); }\n.tx-cu-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }\n.tx-cu-card-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-card-count { font-size: 10px; flex-shrink: 0; }\n.tx-cu-card-heading small { margin-left: auto; font-size: 10px; font-weight: 400; flex-shrink: 0; color: var(--cu-muted); }\n.tx-cu-card[data-state=running] .tx-cu-card-heading small { color: var(--cu-blue); }\n.tx-cu-card-body { margin: 4px 0 8px 22px; padding: 4px 10px; border-left: 1px solid var(--cu-line); overflow: hidden; }\n.tx-cu-card-body > p { font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }\n.tx-cu-card-body > details { color: var(--cu-muted); font-size: 11px; }\n.tx-cu-card-body summary { cursor: pointer; padding: 6px 0; }\n.tx-cu-card-image { display: block; max-width: 100%; max-height: 340px; border: 1px solid var(--cu-line); border-radius: 9px; margin: 10px 0; }\n.tx-cu-card pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.6 ui-monospace, monospace; max-height: 300px; overflow: auto; }\n[data-chat-flow-key]:has([data-cu-group-hidden=true]) { display: none; }\n.tx-cu-group-toggle { display: flex; align-items: center; gap: 6px; width: fit-content; max-width: 100%; min-height: 26px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-secondary, var(--cu-muted)); font: var(--dsh-content-font-size-secondary, 13px)/26px -apple-system, BlinkMacSystemFont, sans-serif; text-align: left; cursor: pointer; }\n.tx-cu-group-toggle:hover { color: var(--cu-text); }\n.tx-cu-group-toggle strong { font-weight: 400; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-group-toggle > span, .tx-cu-group-toggle > svg { flex-shrink: 0; }\n.tx-cu-group-toggle > span { font-size: 10px; }\n.tx-cu-export-files { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }\n.tx-cu-export-files button { display: flex; align-items: center; gap: 12px; max-width: 100%; padding: 7px 10px; border: 1px solid var(--cu-line); border-radius: 8px; background: var(--cu-soft); color: inherit; cursor: pointer; overflow-wrap: anywhere; }\n.tx-cu-export-files small { color: var(--cu-muted); font-size: 10px; white-space: nowrap; }\n.tx-cu-vision-warning { color: color-mix(in srgb, #a97520 85%, var(--cu-text)); font-size: 11px; line-height: 1.7; }\n.tx-cu-pane > .tx-cu-vision-warning { padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, #a97520 7%, var(--cu-bg)); }\n\n/* Setup is a compact disclosure; paths and implementation details stay inside it. */\n.tx-cu-setup { margin: 18px 0 0; border-top: 1px solid var(--cu-line); }\n.tx-cu-pane .tx-cu-setup-toggle { justify-content: space-between; width: 100%; padding: 13px 0; border: 0; border-radius: 0; background: transparent; text-align: left; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-setup-toggle > span { display: inline-flex; align-items: center; gap: 7px; }\n.tx-cu-setup-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; }\n.tx-cu-setup-row strong { font-size: 12px; font-weight: 500; }\n.tx-cu-setup p { margin: 4px 0 0; color: var(--cu-muted); font-size: 11px; line-height: 1.7; }\n.tx-cu-setup-row > span { font-size: 10px; flex-shrink: 0; }\n.tx-cu-setup .is-ready { color: var(--cu-muted); }\n.tx-cu-setup .is-ready::before { content: ''; display: inline-block; width: 5px; height: 5px; border-radius: 50%; margin-right: 5px; background: #28966b; }\n.tx-cu-setup .is-needed { color: var(--cu-muted); }\n.tx-cu-setup-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 12px 0; }\n.tx-cu-setup-actions > span { flex: 1; min-width: 160px; font-size: 10px; }\n.tx-cu-setup-advanced { font-size: 11px; margin-bottom: 10px; color: var(--cu-muted); }\n.tx-cu-setup-advanced summary { cursor: pointer; }\n.tx-cu-setup code { display: block; padding: 8px 10px; border-radius: 7px; background: var(--cu-soft); font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 8px; }\n.tx-cu-setup-install { padding: 10px 0; }\n.tx-cu-setup-install button { margin-top: 10px; }\n.tx-cu-history { margin-top: 0; border-top: 1px solid var(--cu-line); }\n.tx-cu-history summary { padding: 12px 0; color: var(--cu-muted); font-size: 11px; cursor: pointer; }\n.tx-cu-history > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; padding: 8px 0; border-top: 1px solid var(--cu-line); font-size: 11px; }\n.tx-cu-history > div > span:last-of-type { color: var(--cu-muted); font-size: 10px; }\n.tx-cu-history small { width: 100%; overflow-wrap: anywhere; }\n\n/* Sharing and annotation use the same dialog, buttons and spacing. */\n.tx-cu-share-dialog { box-sizing: border-box; width: min(540px, calc(100vw - 32px)); max-height: min(720px, 80vh); overflow: auto; padding: 20px; border: 1px solid var(--cu-line); border-radius: 16px; background: var(--cu-bg); box-shadow: var(--cu-shadow); }\n.tx-cu-share-dialog::backdrop { background: #0005; backdrop-filter: blur(3px); }\n.tx-cu-share-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.tx-cu-share-dialog header strong { font-size: 15px; font-weight: 600; letter-spacing: -.2px; }\n.tx-cu-share-dialog header button { width: 28px; min-height: 28px; padding: 5px; border-color: transparent; background: transparent; color: var(--cu-muted); }\n.tx-cu-share-dialog > p { margin: 8px 0 16px; color: var(--cu-muted); font-size: 12px; line-height: 1.65; }\n.tx-cu-share-list { display: grid; gap: 4px; }\n.tx-cu-share-list button { justify-content: flex-start; gap: 10px; padding: 11px 10px; border-color: transparent; border-radius: 10px; text-align: left; }\n.tx-cu-share-window-icon { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border: 1px solid var(--cu-line); border-radius: 8px; background: var(--cu-soft); color: var(--cu-muted); }\n.tx-cu-share-window-info { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }\n.tx-cu-share-window-info strong { font-size: 12px; font-weight: 500; }\n.tx-cu-share-window-info > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-share-list small { white-space: nowrap; color: var(--cu-blue); font-size: 10px; }\n.tx-cu-window-picker { padding: 16px; }\n.tx-cu-window-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--cu-line); border-radius: 8px; padding: 0 8px; margin-bottom: 12px; color: var(--cu-muted); }\n.tx-cu-window-search input { min-width: 0; flex: 1; width: 0; border: 0!important; background: transparent!important; padding: 9px 0!important; }\n.tx-cu-window-search button { border: 0; background: transparent; padding: 5px; }\n.tx-cu-window-picker .tx-cu-share-list { max-height: 45vh; overflow: auto; }\n.tx-cu-share-list button.is-selected { background: var(--cu-tint); }\n.tx-cu-window-picker footer { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--cu-line); }\n.tx-cu-window-picker footer small { color: var(--cu-muted); font-size: 11px; }\n.tx-cu-annotation-modes { display: flex; align-items: center; gap: 4px; font-size: 11px; }\n.tx-cu-annotation-modes button { padding: 5px 10px; border-color: transparent; background: var(--cu-soft); }\n.tx-cu-annotation-modes button[aria-pressed=true] { color: var(--cu-blue); background: var(--cu-tint); }\n.tx-cu-annotation-element { font-size: 11px; padding: 8px 0; overflow-wrap: anywhere; }\n.tx-cu-annotation-element > span { margin-left: 8px; color: var(--cu-muted); }\n.tx-cu-annotation-element pre { max-height: 140px; overflow: auto; white-space: pre-wrap; }\n.tx-cu-annotation-element summary, .tx-cu-style-editor summary { color: var(--cu-muted); cursor: pointer; }\n.tx-cu-style-editor { font-size: 11px; margin: 8px 0; }\n.tx-cu-style-editor > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0; }\n.tx-cu-style-editor label { display: flex; flex-direction: column; gap: 5px; color: var(--cu-muted); }\n.tx-cu-style-editor input { box-sizing: border-box; width: 100%; padding: 6px 8px; }\n.tx-cu-style-editor button { margin-right: 6px; }\n.tx-cu-annotation-outline { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }\n.tx-cu-annotation-outline polygon { stroke: #3877e8; stroke-width: 2px; fill: #3877e81a; }\n.tx-cu-annotation-frame { overflow-wrap: anywhere; }\n.tx-cu-annotation-dialog { width: min(1120px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 0; overflow: hidden; }\n.tx-cu-annotation-dialog[open] { display: flex; flex-direction: column; }\n.tx-cu-annotation-dialog > header { padding: 14px 16px; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-annotation-dialog > header > div { display: flex; align-items: center; gap: 12px; }\n.tx-cu-annotation-dialog > header small { font-size: 11px; color: var(--cu-muted); }\n.tx-cu-annotation-dialog > .tx-cu-annotation-modes { padding: 8px 12px; flex-wrap: wrap; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-annotation-workspace { display: grid; grid-template-columns: minmax(0,1fr) 280px; flex: 1; min-height: 0; overflow: hidden; }\n.tx-cu-annotation-viewport { min-width: 0; min-height: 0; overflow: auto; background: var(--cu-soft); padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; }\n.tx-cu-annotation-surface { position: relative; width: fit-content; max-width: 100%; flex-shrink: 0; margin: 0 auto; touch-action: none; cursor: crosshair; line-height: 0; border-radius: 6px; }\n.tx-cu-annotation-surface img { display: block; max-width: 100%; max-height: min(62vh,calc(100dvh - 230px)); user-select: none; border-radius: 6px; }\n.tx-cu-annotation-inspector { min-height: 0; overflow: auto; padding: 16px; border-left: 1px solid var(--cu-line); }\n.tx-cu-selection-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }\n.tx-cu-selection-heading small, .tx-cu-annotation-hint { color: var(--cu-muted); font-size: 10px; }\n.tx-cu-annotation-hint { padding-top: 12px; }\n.tx-cu-annotation-empty { color: var(--cu-muted); font-size: 12px; line-height: 1.7; }\n.tx-cu-annotation-comment { display: block; margin-top: 16px; font-size: 12px; color: var(--cu-muted); }\n.tx-cu-annotation-comment textarea { margin-top: 8px; }\n.tx-cu-annotation-outline.is-hover polygon { stroke-dasharray: 4 3; fill: transparent; }\n.tx-cu-annotation-region.is-hover { border-style: dashed; background: transparent; }\n.tx-cu-annotation-hover-label { position: absolute; left: 6px; top: 6px; max-width: calc(100% - 12px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--cu-blue); color: #fff; padding: 4px 6px; border-radius: 4px; font-size: 10px; line-height: 14px; pointer-events: none; }\n.tx-cu-annotation-region { position: absolute; box-sizing: border-box; border: 2px solid #3877e8; background: #3877e81a; pointer-events: none; }\n.tx-cu-annotation-dialog textarea { box-sizing: border-box; display: block; width: 100%; min-height: 70px; padding: 10px; resize: vertical; }\n.tx-cu-annotation-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--cu-line); }\n.tx-cu-annotation-dialog footer > div { display: flex; gap: 8px; }\n.tx-cu-annotation-dialog footer > small { font-size: 11px; color: var(--cu-muted); }\n@media (max-width: 680px) {\n  .tx-cu-share-dialog.tx-cu-annotation-dialog { padding: 0; }\n  .tx-cu-annotation-workspace { display: block; overflow: auto; }\n  .tx-cu-annotation-viewport { padding: 12px; }\n  .tx-cu-annotation-surface img { max-height: 34vh; }\n  .tx-cu-annotation-inspector { border-left: 0; border-top: 1px solid var(--cu-line); overflow: visible; padding: 12px; }\n  .tx-cu-annotation-dialog > header small { display: none; }\n  .tx-cu-image-dialog { width: calc(100vw - 16px); height: calc(100dvh - 16px); }\n  .tx-cu-image-dialog header { padding: 6px 8px; }\n  .tx-cu-image-dialog header > span { width: 100%; justify-content: space-between; }\n  .tx-cu-image-dialog header > div { width: 100%; justify-content: space-between; }\n}\n.tx-cu-user-message { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 0; }\n.tx-cu-user-bubble { max-width: 82%; padding: 10px 14px; border-radius: 16px; background: var(--dsw-specific-bubble, var(--cu-tint)); color: var(--cu-text); font-size: 14px; line-height: 22px; white-space: pre-wrap; overflow-wrap: anywhere; }\n.tx-cu-reference { display: inline-flex; align-items: center; gap: 4px; max-width: min(100%, 320px); padding: 1px 5px; border-radius: 5px; background: color-mix(in srgb, var(--cu-blue) 8%, transparent); color: var(--cu-blue); font-size: 12px; line-height: 20px; vertical-align: middle; white-space: nowrap; }\n.tx-cu-reference > svg { flex-shrink: 0; }\n.tx-cu-reference > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }\n.tx-cu-user-actions { display: flex; justify-content: flex-end; gap: 8px; color: var(--dsw-alias-label-tertiary, GrayText); font-size: 12px; }\n.tx-cu-user-actions button { background: transparent; border: 0; padding: 2px 4px; font: inherit; color: inherit; cursor: pointer; }\n.tx-cu-user-attachments { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }\n.tx-cu-user-file { display: flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l3, #dce3ed); padding: 10px; border-radius: 10px; }\n.tx-cu-user-file svg { width: 20px; height: 20px; }\n\n/* Compact multi-target preview. No control actor is attached to these cards. */\n.tx-cu-floating { position: fixed; inset: 0; height: 100dvh; display: flex; flex-direction: column; gap: 5px; padding: 6px; box-sizing: border-box; background: var(--cu-bg); color-scheme: light dark; }\n.tx-cu-floating header, .tx-cu-floating header > div { display: flex; align-items: center; gap: 7px; min-width: 0; }\n.tx-cu-floating header { justify-content: space-between; flex-shrink: 0; min-height: 24px; }\n.tx-cu-floating header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 500; }\n.tx-cu-floating header > div > svg { color: var(--cu-muted); }\n.tx-cu-floating header > div:first-child { flex: 1; overflow: hidden; }\n.tx-cu-floating header strong { min-width: 0; }\n.tx-cu-floating header > div:last-child { flex-shrink: 0; }\n.tx-cu-floating-count { color: var(--cu-muted); font-size: 10px; white-space: nowrap; }\n.tx-cu-floating header button { width: 24px; min-height: 24px; padding: 4px; border-color: transparent; background: transparent; color: var(--cu-muted); }\n.tx-cu-floating header > div:last-child { gap: 1px; }\n.tx-cu-floating .tx-cu-live { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--cu-soft); border-radius: 8px; overflow: hidden; }\n.tx-cu-floating .tx-cu-live-meta { display: none; }\n.tx-cu-floating .tx-cu-live-surface { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }\n.tx-cu-floating .tx-cu-observed-image { position: relative; line-height: 0; width: 100%; height: 100%; }\n.tx-cu-floating .tx-cu-observed-image img { display: block; width: 100%; height: 100%; object-fit: contain; }\n.tx-cu-floating .tx-cu-live-placeholder { min-height: 80px; font-size: 11px; }\n.tx-cu-floating footer { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-shrink: 0; min-height: 24px; font-size: 11px; color: var(--cu-muted); }\n.tx-cu-floating footer > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-floating footer button { min-height: 24px; padding: 3px 6px; font-size: 10px; border-color: transparent; background: transparent; }\n.tx-cu-floating footer .tx-cu-stop { width: 25px; height: 25px; padding: 4px; border-radius: 50%; background: var(--cu-text); color: var(--cu-bg); }\n.tx-cu-floating footer .tx-cu-stop:hover:not(:disabled) { background: color-mix(in srgb, var(--cu-text) 80%, var(--cu-bg)); }\n.tx-cu-floating footer .tx-cu-stop:disabled { color: var(--cu-muted); background: var(--cu-hover); opacity: .55; }\n.tx-cu-floating footer .tx-cu-resume { width: 25px; height: 25px; padding: 4px; border-radius: 50%; background: var(--cu-blue); color: #fff; }\n.tx-cu-floating footer .tx-cu-resume:hover:not(:disabled) { background: #2868d8; }\n.tx-cu-preview-search { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border: 1px solid var(--cu-line); border-radius: 7px; background: var(--cu-bg); color: var(--cu-muted); }\n.tx-cu-preview-search input { width: 0; min-width: 0; flex: 1; border: 0; background: transparent; padding: 4px 0; outline: 0; font: inherit; font-size: 11px; color: var(--cu-text); }\n.tx-cu-preview-search:focus-within { outline: 2px solid var(--cu-blue); outline-offset: -1px; }\n.tx-cu-preview-empty { margin: auto; padding: 16px; color: var(--cu-muted); font-size: 11px; text-align: center; }\n.tx-cu-preview-stack { position: relative; flex: 1; min-height: 0; }\n.tx-cu-preview-card { position: absolute; left: 50%; top: calc(min(var(--preview-depth), 4)*22px); width: min(var(--cu-card-max-width, 400px), calc(var(--cu-card-max-height, 400px)*var(--preview-ratio, 1.7778))); aspect-ratio: var(--preview-ratio, 1.7778); transform: translateX(calc(-50% + (min(var(--preview-count) - 1, 4)/2 - min(var(--preview-depth), 4))*28px)); overflow: hidden; border: 0; border-radius: 6px; background: var(--cu-bg); box-shadow: 0 3px 12px #00000026; }\n.tx-cu-floating .tx-cu-preview-card .tx-cu-live { height: 100%; border: 0; border-radius: 0; }\n.tx-cu-floating .tx-cu-preview-card .tx-cu-observed-image img { max-height: none; }\n.tx-cu-floating .tx-cu-preview-open { position: absolute; inset: 0; width: 100%; padding: 0; border: 0; border-radius: 0; display: flex; align-items: flex-end; justify-content: space-between; background: transparent; color: #fff; text-align: left; }\n.tx-cu-floating .tx-cu-preview-open::before { content: ''; position: absolute; inset: auto 0 0; height: 36px; pointer-events: none; background: linear-gradient(transparent, #111b); opacity: 0; transition: opacity .12s; }\n.tx-cu-floating .tx-cu-preview-open > span { position: relative; display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; font-size: 11px; line-height: 16px; opacity: 0; transition: opacity .12s; }\n.tx-cu-floating .tx-cu-preview-open:hover::before, .tx-cu-floating .tx-cu-preview-open:focus-visible::before,\n.tx-cu-floating .tx-cu-preview-open:hover > span, .tx-cu-floating .tx-cu-preview-open:focus-visible > span { opacity: 1; }\n.tx-cu-preview-open > span:first-child { flex: 1; min-width: 0; }\n.tx-cu-preview-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-floating .tx-cu-preview-open:hover:not(:disabled) { background: #ffffff08; }\n.tx-cu-preview-open:focus-visible { outline: 2px solid var(--cu-blue); outline-offset: -2px; }\n.tx-cu-preview-stack:not(.is-expanded) .tx-cu-preview-card:nth-child(n+6) { visibility: hidden; }\n.tx-cu-preview-stack.is-expanded { overflow: auto; display: flex; flex-direction: column; gap: 8px; margin: 0; scrollbar-width: thin; }\n.tx-cu-preview-stack.is-focused { margin: 0; }\n.tx-cu-preview-stack.is-focused .tx-cu-preview-card { visibility: hidden; pointer-events: none; }\n.tx-cu-preview-stack.is-focused .tx-cu-preview-card[data-focused] { visibility: visible; pointer-events: auto; top: 0; left: 50%; transform: translateX(-50%); }\n.tx-cu-preview-stack.is-expanded .tx-cu-preview-card { position: relative; inset: auto; transform: none; flex: 0 0 auto; align-self: center; max-width: 100%; }\n.tx-cu-floating > .tx-cu-error { font-size: 11px; line-height: 1.4; margin: 0; max-height: 48px; overflow: auto; }\n.tx-cu-preview-card .tx-cu-reconnect { position: relative; z-index: 5; }\n.tx-cu-preview-card[data-connection=error], .tx-cu-preview-card[data-connection=closed] { box-shadow: 0 0 0 1px var(--cu-line),0 3px 12px #00000026; }\n.tx-cu-floating-inline { inset: auto; z-index: 30; width: min(400px, calc(100vw - 24px)); height: 289px; max-height: calc(100vh - 24px); padding: 0; background: transparent; border: 0; box-shadow: none; pointer-events: none; }\n.tx-cu-floating-inline > header, .tx-cu-floating-inline > footer { pointer-events: none; opacity: 0; transition: opacity .15s; background: var(--cu-bg); border-radius: 8px; padding: 0 5px; }\n.tx-cu-floating-inline:hover > header, .tx-cu-floating-inline:hover > footer,\n.tx-cu-floating-inline:focus-within > header, .tx-cu-floating-inline:focus-within > footer { opacity: 1; pointer-events: auto; }\n.tx-cu-floating-inline .tx-cu-preview-card, .tx-cu-floating-inline > .tx-cu-error { pointer-events: auto; }\n.tx-cu-floating-inline > .tx-cu-error { background: var(--cu-bg); padding: 5px; border-radius: 6px; }\n.tx-cu-floating-inline > header { pointer-events: auto; cursor: grab; touch-action: none; user-select: none; }\n.tx-cu-floating-inline.is-dragging > header { cursor: grabbing; }\n.tx-cu-floating-inline.is-list > header, .tx-cu-floating-inline.is-list > footer { opacity: 1; pointer-events: auto; }\n.tx-cu-floating-inline > .tx-cu-preview-search { pointer-events: auto; }\n/* Keep the observer connected while host @/command menus cover the composer. */\nbody:has([role=listbox]) .tx-cu-floating-inline { visibility: hidden; pointer-events: none; }\n@media (max-width: 700px) {\n  .tx-cu-style-editor > div { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  .tx-cu-share-dialog { padding: 16px; }\n}\n@media (prefers-reduced-motion: reduce) {\n  .tx-cu-assistant-cursor, .tx-cu-card-chevron, .tx-cu-disclosure { transition: none; }\n  .tx-cu-cursor-pulse { animation: none; opacity: .6; }\n}\n";

// vendor/opencu/src/client/browser-preview.jsx
var import_react4 = __toESM(require("react"), 1);

// vendor/opencu/src/client/assistant-cursor.jsx
var import_react2 = __toESM(require("react"), 1);
function AssistantCursor({ cursor, frame }) {
  const [expired, setExpired] = (0, import_react2.useState)(null);
  const [pulseExpired, setPulseExpired] = (0, import_react2.useState)(null);
  const identity = cursor && cursor.source + ":" + cursor.sequence;
  const pulse = cursor?.press && cursor.source + ":" + cursor.press.sequence;
  (0, import_react2.useEffect)(() => {
    if (!identity) return;
    const timer = setTimeout(() => setExpired(identity), 1500);
    return () => clearTimeout(timer);
  }, [identity]);
  (0, import_react2.useEffect)(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulseExpired(pulse), 250);
    return () => clearTimeout(timer);
  }, [pulse]);
  if (!cursor || !frame || expired === identity || cursor.loaderId !== frame.loaderId || !cursor.geometry || Object.keys(cursor.geometry).some((key) => cursor.geometry[key] !== frame.geometry?.[key])) return null;
  const x = cursor.x / frame.width, y = cursor.y / frame.height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
  const pressed = cursor.buttons !== 0;
  return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, pulse && pulseExpired !== pulse && /* @__PURE__ */ import_react2.default.createElement("span", { key: pulse, "aria-hidden": "true", className: "tx-cu-cursor-pulse", style: { left: cursor.press.x / frame.width * 100 + "%", top: cursor.press.y / frame.height * 100 + "%" } }), /* @__PURE__ */ import_react2.default.createElement(
    "span",
    {
      className: "tx-cu-assistant-cursor" + (pressed ? " is-pressed" : ""),
      "aria-hidden": "true",
      "data-sequence": cursor.sequence,
      "data-state": pressed ? "pressed" : "moving",
      style: { left: x * 100 + "%", top: y * 100 + "%" }
    },
    /* @__PURE__ */ import_react2.default.createElement("svg", { width: "22", height: "27", viewBox: "0 0 22 27", fill: "none" }, /* @__PURE__ */ import_react2.default.createElement("path", { d: "M2 2L19 14.5L11.6 15.5L7.7 22.5L2 2Z", fill: "#17191c", stroke: "white", strokeWidth: "2", strokeLinejoin: "round" }))
  ));
}

// vendor/opencu/src/client/device-frame.jsx
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

// vendor/opencu/src/client/browser-preview.jsx
var releases = /* @__PURE__ */ new Set(["release", "pointerup", "keyup"]);
function BrowserPreview({ sessionId, tabId, pageUrl, visible, state, api: api3, url: url2, onState, onError, onNavigation, onBrowserShortcut, onFrame, onViewportResize, deviceMode = false, previewScale = "1" }) {
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
        const result = await api3("view-layout", sessionId, { actor: frame.actor, tabId, controlEpoch: state.controlEpoch, size: layoutSize }, controller.signal);
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
          const next = await api3("input", sessionId, item);
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

// vendor/opencu/src/client/native-preview.jsx
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

// vendor/opencu/src/client/browser-controls.jsx
var import_react10 = __toESM(require("react"), 1);

// vendor/opencu/src/client/browser-tools.jsx
var import_react7 = __toESM(require("react"), 1);

// vendor/opencu/src/client/tool-image.jsx
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

// vendor/opencu/src/client/browser-tools.jsx
var presets = { phone: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 800 } };
var BrowserTools = (0, import_react7.forwardRef)(function BrowserTools2({ sessionId, target, frame, state, api: api3, onState, onError, previewScale = "1", onPreviewScale, onDeviceModeChange, popupOpen, onMenuOpen, onOpenHistory, onOpenDownloads }, ref) {
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
      const result = await api3(op, sessionId, { ...value, actor: observed.actor, tabId: observed.tabId, controlEpoch: current.state.controlEpoch }, controller.signal);
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

// vendor/opencu/src/client/browser-downloads.jsx
var import_react8 = __toESM(require("react"), 1);
var bytes = (value) => value >= 1048576 ? (value / 1048576).toFixed(1) + " MB" : value >= 1024 ? (value / 1024).toFixed(1) + " KB" : Math.max(0, value || 0) + " B";
function BrowserDownloads({ sessionId, visible, api: api3, active, onActiveChange }) {
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
        const result = await api3("downloads", sessionId, void 0, controller.signal);
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
  }, [open, visible, sessionId, api3, reload]);
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
      const result = await api3("downloads-clear", sessionId, {});
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

// vendor/opencu/src/client/browser-history.jsx
var import_react9 = __toESM(require("react"), 1);
function BrowserHistoryPanel({ sessionId, api: api3, onOpen, onClose }) {
  const [entries, setEntries] = (0, import_react9.useState)(null), [query, setQuery] = (0, import_react9.useState)(""), [error, setError] = (0, import_react9.useState)(""), [busy, setBusy] = (0, import_react9.useState)(false), [limit, setLimit] = (0, import_react9.useState)(100);
  const root = (0, import_react9.useRef)(null), search = (0, import_react9.useRef)(null), active = (0, import_react9.useRef)(true), request = (0, import_react9.useRef)(null);
  const load = async (clear = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const result = await api3(clear ? "browser-history-clear" : "browser-history", sessionId, clear ? {} : void 0, controller.signal);
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

// vendor/opencu/src/client/browser-controls.jsx
var Icon = ({ kind }) => /* @__PURE__ */ import_react10.default.createElement("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", "aria-hidden": "true" }, kind === "back" ? /* @__PURE__ */ import_react10.default.createElement("path", { d: "m14 6-6 6 6 6" }) : kind === "forward" ? /* @__PURE__ */ import_react10.default.createElement("path", { d: "m10 6 6 6-6 6" }) : kind === "new" ? /* @__PURE__ */ import_react10.default.createElement("path", { d: "M12 5v14M5 12h14" }) : kind === "close" ? /* @__PURE__ */ import_react10.default.createElement("path", { d: "m6 6 12 12M6 18 18 6" }) : /* @__PURE__ */ import_react10.default.createElement(import_react10.default.Fragment, null, /* @__PURE__ */ import_react10.default.createElement("path", { d: "M20 11a8 8 0 1 0-2 6M20 4v7h-7" })));
var tabLabel = (tab) => tab.url === "about:blank" ? "\u65B0\u6807\u7B7E\u9875" : tab.title || tab.url;
var BrowserControls = (0, import_react10.forwardRef)(function BrowserControls2({ sessionId, state, visible, navigation, frame, api: api3, onState, onError, previewScale, onPreviewScale, onDeviceModeChange, actions }, ref) {
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
        const result = await api3("tabs", sessionId);
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
      const next = await api3(op, sessionId, { ...value, controlEpoch: latest.current.state?.controlEpoch ?? 0, ...op === "navigate" ? { navigationClient: navigationClient.current, navigationSequence: request.sequence, navigationRevision: latest.current.state?.navigationRevision ?? 0 } : {} });
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
      latest.current.onState(await api3("stop", sessionId, {}));
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
  }, placeholder: "\u641C\u7D22\u6216\u8F93\u5165\u7F51\u5740", "aria-label": "\u6D4F\u89C8\u5668\u5730\u5740" }), /* @__PURE__ */ import_react10.default.createElement("span", { "aria-hidden": "true" }, location), /* @__PURE__ */ import_react10.default.createElement("button", { type: "button", className: "tx-cu-open-external", "aria-label": "\u5728\u5916\u90E8\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00", title: canOpenExternal ? "\u5728\u5916\u90E8\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00\uFF08DSH \u6240\u5728\u7535\u8111\uFF09" : "\u5F53\u524D\u5730\u5740\u4E0D\u80FD\u5728\u5916\u90E8\u6D4F\u89C8\u5668\u4E2D\u6253\u5F00", disabled: disabled || !canOpenExternal, onClick: () => void act("open-external", { tabId: target.id, expectedUrl: current.url }) }, /* @__PURE__ */ import_react10.default.createElement(ComputerIcon, { name: "popout", size: 14 }))), /* @__PURE__ */ import_react10.default.createElement("button", { disabled: !canNavigate || !address, type: "submit" }, "\u524D\u5F80")), /* @__PURE__ */ import_react10.default.createElement("div", { className: "tx-cu-browser-actions" }, actions), /* @__PURE__ */ import_react10.default.createElement(BrowserDownloads, { key: sessionId, sessionId, visible: visible && state?.enabled !== false, api: api3, active: panel === "downloads", onActiveChange: (value) => setPanel(value ? "downloads" : null) }), /* @__PURE__ */ import_react10.default.createElement(BrowserTools, { ref: tools, sessionId, target, frame, state, api: api3, onState, onError, previewScale, onPreviewScale, onDeviceModeChange, popupOpen: !!panel, onMenuOpen: () => setPanel(null), onOpenHistory: () => setPanel("history"), onOpenDownloads: () => setPanel("downloads") })), panel === "history" && visible && /* @__PURE__ */ import_react10.default.createElement(BrowserHistoryPanel, { key: sessionId, sessionId, api: api3, onClose: (focus) => {
    setPanel(null);
    if (focus) tools.current?.focus();
  }, onOpen: (entry) => act("tabs", { action: "new", browserId: entry.browserId, url: entry.url }) }), (navigation?.loading || state?.transitioning) && /* @__PURE__ */ import_react10.default.createElement("div", { className: "tx-cu-loading", role: "status", "aria-label": state?.resuming ? "\u6B63\u5728\u6062\u590D\u52A9\u624B\u63A7\u5236\u2026" : "\u6B63\u5728\u8F7D\u5165\u9875\u9762\u2026" }, /* @__PURE__ */ import_react10.default.createElement("span", { className: "tx-cu-visually-hidden" }, state?.resuming ? "\u6B63\u5728\u6062\u590D\u52A9\u624B\u63A7\u5236\u2026" : "\u6B63\u5728\u8F7D\u5165\u9875\u9762\u2026")));
});

// vendor/opencu/src/client/computer-reference.jsx
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

// vendor/opencu/src/client/computer-groups.jsx
var import_react12 = __toESM(require("react"), 1);

// vendor/opencu/src/client/computer-groups.mjs
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

// vendor/opencu/src/client/computer-groups.jsx
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
  function Group({ sessionId, useChat, nodeKey, callId: callId2, turnProcess, completedContext = false, children }) {
    const group = useChat((snapshot) => groups(snapshot).get(nodeKey ?? `call:${callId2}`));
    const identity = `${sessionId}:${group?.id}`;
    const expanded = (0, import_react12.useSyncExternalStore)(subscribe, () => open.has(identity));
    const seat = (0, import_react12.useRef)(null), wasFoldable = (0, import_react12.useRef)(false), [hostGrouped, setHostGrouped] = (0, import_react12.useState)(false), [visited, setVisited] = (0, import_react12.useState)(false);
    const first = !!group && (nodeKey ? nodeKey === group.id : group.headerCallId === callId2), foldable = !!turnProcess?.foldable || completedContext;
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

// vendor/opencu/src/client/computer-setup.jsx
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
function ComputerSetup({ sessionId, visible, api: api3 }) {
  const panelId = (0, import_react13.useId)();
  const [open, setOpen] = (0, import_react13.useState)(false), [setup, setSetup] = (0, import_react13.useState)(null), [error, setError] = (0, import_react13.useState)(""), [loadError, setLoadError] = (0, import_react13.useState)(""), [busy, setBusy] = (0, import_react13.useState)("");
  (0, import_react13.useEffect)(() => {
    if (!open || !visible || !sessionId) return;
    let live = true, timer;
    const refresh = async () => {
      try {
        const next = await api3("setup", sessionId);
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
      setSetup(await api3("setup", sessionId, { action }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };
  const native = setup?.native;
  return /* @__PURE__ */ import_react13.default.createElement("section", { className: "tx-cu-setup" }, /* @__PURE__ */ import_react13.default.createElement("button", { className: "tx-cu-setup-toggle", type: "button", "aria-expanded": open, "aria-controls": panelId, onClick: () => setOpen((value) => !value) }, /* @__PURE__ */ import_react13.default.createElement("span", null, /* @__PURE__ */ import_react13.default.createElement(ComputerIcon, { name: "settings", size: 14 }), "\u8FD0\u884C\u73AF\u5883\u4E0E\u6743\u9650"), /* @__PURE__ */ import_react13.default.createElement(ComputerIcon, { className: "tx-cu-disclosure", name: "chevron", size: 12 })), open && /* @__PURE__ */ import_react13.default.createElement("div", { id: panelId }, (error || loadError) && /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-error", role: "alert" }, error || loadError), !setup ? /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-muted", role: "status" }, "\u6B63\u5728\u68C0\u67E5\u8FD0\u884C\u73AF\u5883\u2026") : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "\u5185\u7F6E\u6D4F\u89C8\u5668"), /* @__PURE__ */ import_react13.default.createElement("p", null, setup.browser.name, " \xB7 \u72EC\u7ACB\u5DE5\u4F5C\u914D\u7F6E")), /* @__PURE__ */ import_react13.default.createElement("span", { className: setup.browser.installed ? "is-ready" : "is-needed" }, setup.browser.installed ? "\u5DF2\u5B89\u88C5" : "\u5F85\u5B89\u88C5")), !setup.browser.installed && /* @__PURE__ */ import_react13.default.createElement("p", null, "\u8BF7\u5B89\u88C5 Chrome\uFF0C\u6216\u5728\u63D2\u4EF6\u76EE\u5F55\u8FD0\u884C ", /* @__PURE__ */ import_react13.default.createElement("code", null, "pnpm exec playwright install chromium"), "\uFF0C\u7136\u540E\u91CD\u65B0\u6253\u5F00\u6D4F\u89C8\u5668\u3002"), /* @__PURE__ */ import_react13.default.createElement("details", { className: "tx-cu-setup-advanced" }, /* @__PURE__ */ import_react13.default.createElement("summary", null, "\u6D4F\u89C8\u5668\u8BE6\u60C5"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u7F51\u9875\u767B\u5F55\u4FDD\u5B58\u5728\u72EC\u7ACB\u914D\u7F6E\u4E2D\u3002", setup.extension?.installation?.platform === "darwin" && "\u9996\u6B21\u4F7F\u7528\u53EF\u80FD\u9700\u8981\u5728 macOS \u7CFB\u7EDF\u63D0\u793A\u4E2D\u5141\u8BB8\u6D4F\u89C8\u5668\u8BBF\u95EE\u94A5\u5319\u4E32\u3002"), /* @__PURE__ */ import_react13.default.createElement("code", null, setup.browser.path)), /* @__PURE__ */ import_react13.default.createElement(ChromeSetup, { extension: setup.extension, busy, act, onError: setError }), !native.supported ? /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-muted" }, "\u6B64\u7CFB\u7EDF\u7248\u672C\u5C1A\u4E0D\u652F\u6301\u539F\u751F\u5E94\u7528\u63A7\u5236\u3002\u6D4F\u89C8\u5668\u529F\u80FD\u53EF\u5355\u72EC\u4F7F\u7528\u3002") : !native.installed ? /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-install" }, /* @__PURE__ */ import_react13.default.createElement("strong", null, "\u5B89\u88C5\u684C\u9762\u63A7\u5236"), /* @__PURE__ */ import_react13.default.createElement("p", null, native.platform === "win32" ? "Windows \u5F00\u53D1\u7248\u91C7\u7528\u524D\u53F0\u64CD\u63A7\uFF0C\u5B89\u88C5\u65F6\u4F1A\u5728\u672C\u673A\u7F16\u8BD1\uFF0C\u9700\u8981 .NET 10 SDK\u3002\u8BF7\u4FDD\u6301\u684C\u9762\u89E3\u9501\uFF1B\u9F20\u6807\u6216\u952E\u76D8\u4ECB\u5165\u4F1A\u505C\u6B62\u52A9\u624B\u3002" : "\u5B89\u88C5 Oh My DSH Computer Use \u540E\uFF0C\u53EF\u9009\u62E9\u5E76\u64CD\u4F5C Mac \u5E94\u7528\u3002\u5F53\u524D\u5F00\u53D1\u7248\u4F1A\u5728\u672C\u673A\u7F16\u8BD1\uFF0C\u9700\u8981 Apple Command Line Tools\uFF1B\u53D1\u884C\u7248\u5B89\u88C5\u5305\u5C1A\u672A\u63D0\u4F9B\u3002"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || native.installing, onClick: () => act("install-native") }, busy === "install-native" || native.installing ? "\u6B63\u5728\u7F16\u8BD1\u5E76\u5B89\u88C5\u2026" : "\u5B89\u88C5\u684C\u9762\u63A7\u5236")) : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, (native.updateAvailable || native.restartRequired || native.repairRequired) && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-install" }, /* @__PURE__ */ import_react13.default.createElement("strong", null, native.repairRequired ? "\u684C\u9762\u63A7\u5236\u9700\u8981\u4FEE\u590D" : native.updateAvailable ? "\u684C\u9762\u63A7\u5236\u6709\u66F4\u65B0" : "\u684C\u9762\u63A7\u5236\u9700\u8981\u91CD\u542F"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u4F1A\u6682\u505C\u5F53\u524D\u684C\u9762\u64CD\u4F5C\uFF0C\u5B8C\u6210\u540E\u8BF7\u91CD\u65B0\u9009\u62E9\u5E94\u7528\u3002"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || native.installing, onClick: () => act("install-native") }, busy === "install-native" || native.installing ? "\u6B63\u5728\u66F4\u65B0\u684C\u9762\u63A7\u5236\u2026" : native.repairRequired ? "\u4FEE\u590D\u684C\u9762\u63A7\u5236" : native.updateAvailable ? "\u66F4\u65B0\u684C\u9762\u63A7\u5236" : "\u91CD\u542F\u684C\u9762\u63A7\u5236")), native.platform === "win32" ? /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "Windows \u684C\u9762"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u524D\u53F0\u64CD\u63A7\uFF1B\u4FDD\u6301\u684C\u9762\u89E3\u9501\uFF0C\u9F20\u6807\u6216\u952E\u76D8\u4ECB\u5165\u4F1A\u505C\u6B62\u52A9\u624B\u3002")), /* @__PURE__ */ import_react13.default.createElement("span", { className: native.interactive ? "is-ready" : "is-needed" }, native.interactive ? "\u53EF\u7528" : "\u5F53\u524D\u4E0D\u53EF\u7528")), /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "\u7A97\u53E3\u6355\u83B7"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u5411\u52A9\u624B\u63D0\u4F9B\u6240\u9009\u5E94\u7528\u7684\u753B\u9762")), /* @__PURE__ */ import_react13.default.createElement("span", { className: native.captureSupported ? "is-ready" : "is-needed" }, native.captureSupported ? "\u53EF\u7528" : "\u5F53\u524D\u4E0D\u53EF\u7528"))) : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement(Permission, { title: "\u8F85\u52A9\u529F\u80FD", detail: "\u8BFB\u53D6\u5E94\u7528\u63A7\u4EF6\u5E76\u64CD\u4F5C\u6240\u9009\u7A97\u53E3", value: native.accessibility }), /* @__PURE__ */ import_react13.default.createElement(Permission, { title: "\u5C4F\u5E55\u5F55\u5236", detail: "\u5411\u52A9\u624B\u63D0\u4F9B\u6240\u9009\u5E94\u7528\u7684\u753B\u9762", value: native.screenRecording })), native.error && /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-error", role: "alert" }, native.error), native.platform !== "win32" && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-actions" }, /* @__PURE__ */ import_react13.default.createElement("span", { className: "tx-cu-muted" }, "\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u7684\u5E94\u7528\u540D\u79F0\uFF1A", native.displayName ?? "Oh My DSH Computer Use"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy, onClick: () => act("permissions") }, busy === "permissions" ? "\u6B63\u5728\u6253\u5F00\u2026" : "\u6253\u5F00\u6743\u9650\u8BBE\u7F6E")), /* @__PURE__ */ import_react13.default.createElement("details", { className: "tx-cu-setup-advanced" }, /* @__PURE__ */ import_react13.default.createElement("summary", null, "\u684C\u9762\u63A7\u5236\u7248\u672C"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u5DF2\u5B89\u88C5 ", native.version ?? "\u672A\u77E5", native.runningVersion && native.runningVersion !== native.version ? ` \xB7 \u6B63\u5728\u8FD0\u884C ${native.runningVersion}` : ""), native.removable && /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-actions" }, /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || native.installing || native.removing, onClick: () => act("remove-native") }, busy === "remove-native" || native.removing ? "\u6B63\u5728\u79FB\u9664\u684C\u9762\u63A7\u5236\u2026" : "\u79FB\u9664\u684C\u9762\u63A7\u5236")), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u79FB\u9664\u4F1A\u505C\u6B62\u684C\u9762\u64CD\u63A7\u4E0E\u9884\u89C8\uFF0C\u5E94\u7528\u7A97\u53E3\u548C\u7528\u6237\u6587\u4EF6\u4FDD\u7559\u3002\u9700\u8981\u65F6\u53EF\u91CD\u65B0\u5B89\u88C5\u3002")))))));
}

// vendor/opencu/src/client/window-share.jsx
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

// vendor/opencu/src/client/floating-preview.jsx
var import_react15 = __toESM(require("react"), 1);
var import_react_dom2 = require("react-dom");
function FloatingPreview({ sessionId, state, url: url2, api: api3, onState, onError, anchor, onOpen }) {
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
      const next = await api3("stop", sessionId, {});
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
      const next = await api3("resume", sessionId, {});
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
      const next = await api3("view-tab", sessionId, { tabId: item.id, browserId: item.browserId });
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

// vendor/opencu/src/client/page-annotation.jsx
var import_react16 = __toESM(require("react"), 1);

// vendor/opencu/src/computer-use/annotation-geometry.mjs
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

// vendor/opencu/src/client/page-annotation.jsx
var styleFields = [["width", "\u5BBD\u5EA6"], ["height", "\u9AD8\u5EA6"], ["font-size", "\u5B57\u53F7"], ["color", "\u6587\u5B57\u989C\u8272"], ["background-color", "\u80CC\u666F\u989C\u8272"], ["padding-top", "\u4E0A\u5185\u8DDD"], ["padding-left", "\u5DE6\u5185\u8DDD"], ["margin-top", "\u4E0A\u5916\u8DDD"]];
function PageAnnotation({ sessionId, frame, target, inputActions, conversation, api: api3, compact = false }) {
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
    if (api3) {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        const result = await api3("annotation", sessionId, { actor: frame.actor, tabId: frame.tabId, controlEpoch: frame.controlEpoch }, controller.signal);
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
    if (!api3 || !element || !frame || frame.tabId !== snapshot?.frame.tabId) return;
    const revision = epoch.current, controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setBusyAction("preview");
    setError("");
    setHovered(null);
    try {
      const result = await api3("annotation-style", sessionId, { actor: frame.actor, tabId: frame.tabId, controlEpoch: Math.max(controlEpoch.current, frame.controlEpoch), sourceFrameId: snapshot.frame.id, elementKey: element.key, changes: Object.fromEntries(Object.entries(styleDraft).filter(([, value]) => value.trim())) }, controller.signal);
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
  } }, /* @__PURE__ */ import_react16.default.createElement("img", { ref: image, draggable: false, src: "data:" + (stylePreview?.frame ?? snapshot.frame).mediaType + ";base64," + (stylePreview?.frame ?? snapshot.frame).data, alt: "\u5F85\u6279\u6CE8\u7684\u51BB\u7ED3\u9875\u9762" }), selectedPolygon ? /* @__PURE__ */ import_react16.default.createElement("svg", { className: "tx-cu-annotation-outline", viewBox: "0 0 1 1", preserveAspectRatio: "none" }, /* @__PURE__ */ import_react16.default.createElement("polygon", { points: selectedPolygon.map((p) => p.x + "," + p.y).join(" "), vectorEffect: "non-scaling-stroke" })) : region && /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-region", style: { left: region.x * 100 + "%", top: region.y * 100 + "%", width: region.width * 100 + "%", height: region.height * 100 + "%" } }), hovered && hovered.key !== element?.key && /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, hovered.polygon ? /* @__PURE__ */ import_react16.default.createElement("svg", { className: "tx-cu-annotation-outline is-hover", viewBox: "0 0 1 1", preserveAspectRatio: "none" }, /* @__PURE__ */ import_react16.default.createElement("polygon", { points: hovered.polygon.map((p) => p.x + "," + p.y).join(" "), vectorEffect: "non-scaling-stroke" })) : /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-region is-hover", style: { left: hovered.region.x * 100 + "%", top: hovered.region.y * 100 + "%", width: hovered.region.width * 100 + "%", height: hovered.region.height * 100 + "%" } }), /* @__PURE__ */ import_react16.default.createElement("span", { className: "tx-cu-annotation-hover-label" }, hovered.tag, hovered.id ? "#" + hovered.id : ""))), /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-hint" }, stylePreview ? "\u6B63\u5728\u67E5\u770B\u6837\u5F0F\u9884\u89C8" : mode === "region" ? "\u62D6\u52A8\u5708\u9009\u8981\u8BA8\u8BBA\u7684\u533A\u57DF" : "\u79FB\u5165\u9884\u89C8\u5143\u7D20\uFF0C\u70B9\u51FB\u9009\u4E2D")), /* @__PURE__ */ import_react16.default.createElement("aside", { className: "tx-cu-annotation-inspector" }, /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-selection-heading" }, /* @__PURE__ */ import_react16.default.createElement("strong", null, element ? "\u5DF2\u9009\u5143\u7D20" : region ? "\u5DF2\u9009\u533A\u57DF" : "\u9009\u62E9\u5185\u5BB9"), region && /* @__PURE__ */ import_react16.default.createElement("small", null, Math.round(region.width * (image.current?.naturalWidth || snapshot?.frame.width || 0)), " \xD7 ", Math.round(region.height * (image.current?.naturalHeight || snapshot?.frame.height || 0)))), !region && /* @__PURE__ */ import_react16.default.createElement("p", { className: "tx-cu-annotation-empty" }, "\u5728\u5DE6\u4FA7\u5708\u9009\u533A\u57DF\u6216\u70B9\u9009\u5143\u7D20\uFF0C\u7136\u540E\u5199\u4E0B\u5E0C\u671B\u4FEE\u6539\u7684\u5185\u5BB9\u3002"), snapshot?.truncated && /* @__PURE__ */ import_react16.default.createElement("p", null, "\u5143\u7D20\u6E05\u5355\u5DF2\u8FBE\u663E\u793A\u4E0A\u9650\uFF0C\u53EF\u7528\u5708\u9009\u8865\u5145\u3002"), element && /* @__PURE__ */ import_react16.default.createElement("div", { className: "tx-cu-annotation-element" }, /* @__PURE__ */ import_react16.default.createElement("strong", null, element.tag, element.id ? "#" + element.id : ""), /* @__PURE__ */ import_react16.default.createElement("span", null, element.label || element.text || element.role), /* @__PURE__ */ import_react16.default.createElement("details", null, /* @__PURE__ */ import_react16.default.createElement("summary", null, "\u5143\u7D20\u4FE1\u606F\u4E0E\u5F53\u524D\u6837\u5F0F"), /* @__PURE__ */ import_react16.default.createElement("pre", null, JSON.stringify({ ancestry: element.ancestry, styles: element.styles }, null, 2)))), !!element?.framePath?.length && /* @__PURE__ */ import_react16.default.createElement("p", { className: "tx-cu-annotation-frame" }, "\u6240\u5728\u6846\u67B6\uFF1A", element.framePath.map((frame2) => frame2.title || frame2.id || frame2.url).join(" \u203A ")), element && api3 && /* @__PURE__ */ import_react16.default.createElement("details", { className: "tx-cu-style-editor" }, /* @__PURE__ */ import_react16.default.createElement("summary", null, "\u8C03\u6574\u6837\u5F0F"), /* @__PURE__ */ import_react16.default.createElement("p", null, "\u9884\u89C8\u4F1A\u6682\u505C\u52A9\u624B\uFF1B\u751F\u6210\u753B\u9762\u540E\u6062\u590D\u4E34\u65F6\u6837\u5F0F\u3002"), /* @__PURE__ */ import_react16.default.createElement("div", null, styleFields.map(([property, label]) => /* @__PURE__ */ import_react16.default.createElement("label", { key: property }, label, /* @__PURE__ */ import_react16.default.createElement("input", { "aria-label": "\u9884\u89C8" + label, disabled: busy, placeholder: element.styles[property] || "\u4F8B\u5982 300px", value: styleDraft[property] ?? "", onChange: (event) => setStyleDraft({ ...styleDraft, [property]: event.target.value }) })))), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", disabled: busy || !Object.values(styleDraft).some((value) => value.trim()), onClick: previewStyles }, busyAction === "preview" ? "\u6B63\u5728\u9884\u89C8\u2026" : "\u9884\u89C8\u6837\u5F0F"), stylePreview && /* @__PURE__ */ import_react16.default.createElement(import_react16.default.Fragment, null, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", disabled: busy, onClick: showOriginal }, "\u663E\u793A\u539F\u56FE"), /* @__PURE__ */ import_react16.default.createElement("p", { role: "status" }, "\u4E34\u65F6\u6837\u5F0F\u5DF2\u6062\u590D\uFF0C\u5F53\u524D\u663E\u793A\u9884\u89C8\u56FE\u3002", stylePreview.restored.conflicts?.length ? "\u9875\u9762\u81EA\u884C\u6539\u53D8\u7684\u6837\u5F0F\u5DF2\u4FDD\u7559\u3002" : ""))), /* @__PURE__ */ import_react16.default.createElement("label", { className: "tx-cu-annotation-comment" }, "\u8BF4\u660E", /* @__PURE__ */ import_react16.default.createElement("textarea", { "aria-label": "\u6279\u6CE8\u8BF4\u660E", placeholder: "\u5E0C\u671B\u8FD9\u91CC\u600E\u4E48\u6539\uFF1F\uFF08\u53EF\u9009\uFF09", value: comment, onChange: (event) => setComment(event.target.value) })), error && /* @__PURE__ */ import_react16.default.createElement("p", { className: "tx-cu-error", role: "alert" }, error))), /* @__PURE__ */ import_react16.default.createElement("footer", null, /* @__PURE__ */ import_react16.default.createElement("small", null, "\u4EC5\u52A0\u5165\u8349\u7A3F\uFF0C\u4E0D\u4F1A\u53D1\u9001"), /* @__PURE__ */ import_react16.default.createElement("div", null, /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", onClick: close }, "\u53D6\u6D88"), /* @__PURE__ */ import_react16.default.createElement("button", { type: "button", className: "tx-cu-primary", title: "\u52A0\u5165\u8F93\u5165\u6846\uFF08\u2318/Ctrl+Enter\uFF09", disabled: loading || busy || !region || region.width < 5e-3 || region.height < 5e-3, onClick: attach }, busyAction === "attach" ? "\u6B63\u5728\u52A0\u5165\u2026" : "\u52A0\u5165\u8F93\u5165\u6846")))));
}

// vendor/opencu/src/client/computer-use.jsx
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

// src/client/brand.jsx
var import_react18 = __toESM(require("react"), 1);

// src/client/brand.mjs
var DOWN = "M23.271 2.216C23.039 2.071 22.91 2.287 22.755 2.388C22.703 2.42 22.656 2.464 22.61 2.505C22.214 2.848 21.771 3.054 21.225 2.956C20.412 2.784 19.68 2.919 19.005 3.435C18.92 2.663 18.493 2.157 17.808 1.798C17.446 1.621 17.08 1.449 16.83 1.111C16.656 0.872 16.611 0.612 16.524 0.354C16.469 0.198 16.414 0.039 16.223 0.009C16.017 -0.024 15.936 0.137 15.856 0.271C15.539 0.822 15.418 1.43 15.429 2.046C15.454 3.432 16.041 4.538 17.196 5.36C17.325 5.456 17.356 5.547 17.312 5.674C17.229 5.936 17.134 6.191 17.051 6.454C16.999 6.623 16.921 6.659 16.738 6.58C16.107 6.306 15.56 5.909 15.074 5.433C14.248 4.633 13.5 3.751 12.568 3.06C12.349 2.898 12.13 2.748 11.903 2.605C10.952 1.682 12.028 0.923 12.277 0.833C12.537 0.739 12.367 0.416 11.526 0.42C10.684 0.424 9.914 0.706 8.933 1.081C8.789 1.138 8.638 1.179 8.484 1.213C7.593 1.044 6.668 1.006 5.702 1.115C3.883 1.318 2.43 2.178 1.362 3.646C0.079 5.41 -0.223 7.415 0.147 9.506C0.535 11.71 1.66 13.535 3.389 14.962C5.181 16.441 7.246 17.166 9.601 17.027C11.032 16.944 12.624 16.753 14.421 15.232C14.874 15.458 15.35 15.548 16.138 15.615C16.746 15.672 17.331 15.585 17.784 15.491C18.493 15.341 18.444 14.684 18.188 14.564C16.108 13.595 16.565 13.989 16.15 13.67C17.206 12.42 18.82 10.198 19.278 7.246C19.318 6.948 19.375 6.534 19.371 6.293C19.371 6.145 19.411 6.092 19.597 6.098C20.113 6.109 20.619 6.051 21.096 5.891C22.503 5.375 23.169 4.232 23.448 2.804C23.49 2.586 23.491 2.356 23.271 2.216ZM11.175 14.49C9.159 13.005 8.182 12.567 7.778 12.621C7.401 12.673 7.469 13.087 7.552 13.354C7.639 13.619 7.752 13.797 7.91 14.024C8.02 14.175 8.095 14.406 7.801 14.609C7.152 15.063 6.023 14.63 5.97 14.609C4.657 13.941 3.559 12.965 2.785 11.569C2.037 10.225 1.603 8.783 1.532 7.244C1.513 6.872 1.622 6.741 1.992 6.673C2.479 6.583 2.981 6.564 3.468 6.636C5.525 6.936 7.276 7.843 8.744 9.163C9.582 9.888 10.216 10.783 10.869 11.679C11.563 12.659 12.31 13.617 13.262 14.415C13.598 14.696 13.866 14.91 14.123 15.068C13.349 15.155 12.058 15.177 11.175 14.491L11.175 14.49ZM12.141 8.26C12.141 8.095 12.273 7.963 12.439 7.963C12.476 7.963 12.511 7.971 12.541 7.982C12.582 7.997 12.62 8.019 12.65 8.053C12.704 8.106 12.733 8.181 12.733 8.26C12.733 8.425 12.601 8.556 12.435 8.556C12.27 8.556 12.141 8.425 12.141 8.26ZM15.142 9.799C14.949 9.878 14.757 9.945 14.572 9.953C14.284 9.968 13.972 9.851 13.802 9.709C13.537 9.487 13.348 9.363 13.27 8.977C13.236 8.812 13.255 8.556 13.284 8.41C13.352 8.094 13.277 7.892 13.055 7.708C12.873 7.558 12.643 7.516 12.39 7.516C12.296 7.516 12.209 7.475 12.145 7.441C12.039 7.389 11.952 7.257 12.035 7.096C12.062 7.043 12.19 6.916 12.22 6.893C12.563 6.698 12.96 6.762 13.326 6.908C13.665 7.047 13.922 7.302 14.292 7.663C14.669 8.098 14.738 8.218 14.953 8.545C15.123 8.801 15.277 9.063 15.383 9.364C15.447 9.551 15.364 9.705 15.142 9.799Z";
var UP = "M22.403 0.567C22.145 0.477 22.068 0.718 21.939 0.85C21.895 0.893 21.86 0.947 21.824 0.997C21.515 1.421 21.13 1.721 20.591 1.77C19.829 1.867 19.221 2.244 18.712 2.958C18.535 2.227 18.116 1.839 17.516 1.626C17.203 1.506 16.887 1.379 16.663 1.064C16.508 0.839 16.462 0.581 16.383 0.329C16.332 0.176 16.283 0.02 16.121 -0.002C15.944 -0.029 15.875 0.133 15.805 0.269C15.52 0.822 15.408 1.43 15.42 2.046C15.449 3.432 16.031 4.532 17.202 5.274C17.337 5.356 17.374 5.445 17.335 5.582C17.261 5.862 17.169 6.134 17.086 6.413C17.032 6.59 16.952 6.63 16.764 6.558C16.118 6.301 15.562 5.909 15.074 5.433C14.248 4.633 13.5 3.751 12.568 3.06C12.349 2.898 12.13 2.748 11.903 2.605C10.952 1.682 12.028 0.923 12.277 0.833C12.537 0.739 12.367 0.416 11.526 0.42C10.684 0.424 9.914 0.706 8.933 1.081C8.789 1.138 8.638 1.179 8.484 1.213C7.593 1.044 6.668 1.006 5.702 1.115C3.883 1.318 2.43 2.178 1.362 3.646C0.079 5.41 -0.223 7.415 0.147 9.506C0.535 11.71 1.66 13.535 3.389 14.962C5.181 16.441 7.246 17.166 9.601 17.027C11.032 16.944 12.624 16.753 14.421 15.232C14.874 15.458 15.35 15.548 16.138 15.615C16.746 15.672 17.331 15.585 17.784 15.491C18.493 15.341 18.444 14.684 18.188 14.564C16.108 13.595 16.565 13.989 16.15 13.67C17.206 12.42 18.82 10.198 19.363 7.086C19.421 6.709 19.484 6.171 19.469 5.866C19.458 5.681 19.493 5.604 19.681 5.556C20.199 5.412 20.691 5.172 21.125 4.806C22.366 3.824 22.758 2.554 22.708 1.1C22.7 0.878 22.649 0.654 22.403 0.567ZM11.175 14.451C9.159 12.726 8.182 12.088 7.778 12.067C7.401 12.047 7.469 12.505 7.552 12.807C7.639 13.103 7.752 13.313 7.91 13.581C8.02 13.758 8.095 14.01 7.801 14.16C7.152 14.487 6.023 13.806 5.97 13.772C4.657 12.85 3.559 11.766 2.785 10.369C2.037 9.025 1.603 7.583 1.532 6.044C1.513 5.672 1.622 5.541 1.992 5.473C2.479 5.383 2.981 5.364 3.468 5.436C5.525 5.736 7.276 6.675 8.744 8.323C9.582 9.299 10.216 10.425 10.869 11.496C11.563 12.592 12.31 13.603 13.262 14.414C13.598 14.696 13.866 14.91 14.123 15.068C13.349 15.154 12.058 15.167 11.175 14.452L11.175 14.451ZM12.141 8.26C12.141 8.095 12.273 7.963 12.439 7.963C12.476 7.963 12.511 7.971 12.541 7.982C12.582 7.997 12.62 8.019 12.65 8.053C12.704 8.106 12.733 8.181 12.733 8.26C12.733 8.425 12.601 8.556 12.435 8.556C12.27 8.556 12.141 8.425 12.141 8.26ZM15.142 9.799C14.949 9.878 14.757 9.945 14.572 9.953C14.284 9.968 13.972 9.851 13.802 9.709C13.537 9.487 13.348 9.363 13.27 8.977C13.236 8.812 13.255 8.556 13.284 8.41C13.352 8.094 13.277 7.892 13.055 7.708C12.873 7.558 12.643 7.516 12.39 7.516C12.296 7.516 12.209 7.475 12.145 7.441C12.039 7.389 11.952 7.257 12.035 7.096C12.062 7.043 12.19 6.916 12.22 6.893C12.563 6.698 12.96 6.762 13.326 6.908C13.665 7.047 13.922 7.302 14.292 7.663C14.669 8.098 14.738 8.218 14.953 8.545C15.123 8.801 15.277 9.063 15.383 9.364C15.447 9.551 15.364 9.705 15.142 9.799Z";
function whaleSvg(id = "omd-whale") {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="omd-whale" viewBox="-3 -6 30 30" fill="none" aria-hidden="true">
<defs>
  <path id="${id}-shape" class="omd-whale-contour" d="${DOWN}"/>
  <linearGradient id="${id}-body" x1="4" y1="0" x2="16" y2="19" gradientUnits="userSpaceOnUse">
    <stop stop-color="#a8fbff"/><stop offset=".18" stop-color="#43d5ff"/><stop offset=".4" stop-color="#268cfa"/><stop offset=".7" stop-color="#2458df"/><stop offset="1" stop-color="#9878ff"/>
  </linearGradient>
  <radialGradient id="${id}-glass" cx=".23" cy=".12" r=".83">
    <stop stop-color="white" stop-opacity=".76"/><stop offset=".25" stop-color="#8cedff" stop-opacity=".18"/><stop offset=".6" stop-color="#0734b3" stop-opacity=".08"/><stop offset=".9" stop-color="#5149ea" stop-opacity=".28"/><stop offset="1" stop-color="#cfbdff" stop-opacity=".6"/>
  </radialGradient>
  <linearGradient id="${id}-rim" x1="4" y1="1" x2="15" y2="17" gradientUnits="userSpaceOnUse">
    <stop stop-color="#e7ffff"/><stop offset=".45" stop-color="#6fe9ff" stop-opacity=".58"/><stop offset="1" stop-color="#c4b7ff"/>
  </linearGradient>
  <linearGradient id="${id}-trail"><stop stop-color="#5778ff" stop-opacity="0"/><stop offset=".6" stop-color="#a590ff"/><stop offset="1" stop-color="#85f3ff"/></linearGradient>
  <filter id="${id}-glow" x="-40%" y="-50%" width="180%" height="200%"><feGaussianBlur stdDeviation=".38"/></filter>
</defs>
<g class="omd-whale-orbit" opacity="0">
  <ellipse cx="11.7" cy="8.5" rx="13.4" ry="10.7" transform="rotate(-28 11.7 8.5)" stroke="#657eff" stroke-width=".12" opacity=".25"/>
  <g class="omd-whale-rotor">
    <ellipse cx="11.7" cy="8.5" rx="13.4" ry="10.7" transform="rotate(-28 11.7 8.5)" stroke="url(#${id}-trail)" stroke-width=".24" pathLength="100" stroke-dasharray="29 71"/>
    <g transform="rotate(-28 11.7 8.5)"><circle cx="25.1" cy="8.5" r=".7" fill="#48cfff" filter="url(#${id}-glow)"/><circle cx="25.1" cy="8.5" r=".32" fill="#d3fbff"/></g>
  </g>
</g>
<g class="omd-whale-body">
  <use href="#${id}-shape" fill="url(#${id}-body)"/>
  <use href="#${id}-shape" fill="url(#${id}-glass)"/>
  <use href="#${id}-shape" stroke="url(#${id}-rim)" stroke-width=".23"/>
  <path d="M2.1 5.2C3.7 1.5 7.6 .9 10.5 2" stroke="#d3ffff" stroke-width=".2" stroke-linecap="round" opacity=".65"/>
  <path d="M3.2 12.8C5.7 16.4 9.3 17 12.2 15.4" stroke="#b4a5ff" stroke-width=".22" stroke-linecap="round" opacity=".65"/>
</g>
</svg>`;
}
var whaleCss = `
.tx-brand-mark { display: inline-grid; place-items: center; position: relative; isolation: isolate; flex-shrink: 0; overflow: visible; background: transparent; border-radius: 0; color: #67ccff; }
.omd-whale { width: 100%; height: 100%; overflow: visible; display: block; }
.omd-whale-body { transform-origin: 11.7px 8.5px; filter: drop-shadow(0 .35px .4px #1d5fc347); transition: filter .3s ease; }
.omd-whale-orbit { opacity: 0; transition: opacity .35s ease; pointer-events: none; }
.omd-whale-rotor { transform-origin: 11.7px 8.5px; }
.tx-brand-mark:is(:hover,[data-omd-state="hover"],[data-omd-state="running"]) .omd-whale-body,
button:is(:hover,:focus-visible) .tx-brand-mark .omd-whale-body { filter: drop-shadow(0 .35px .55px #397fff80) drop-shadow(0 0 .45px #6edbff55); }
.trisoul-shell[data-omd-running] .tx-brand-mark .omd-whale-orbit,
.tx-brand-mark[data-omd-state="running"] .omd-whale-orbit { opacity: 1; }
@media (prefers-color-scheme: dark) {
  .omd-whale-body { filter: drop-shadow(0 .4px .65px #206cff88); }
}
@media (prefers-reduced-motion: no-preference) {
  .tx-brand-mark:is(:hover,[data-omd-state="hover"]) .omd-whale-contour,
  button:is(:hover,:focus-visible) .tx-brand-mark .omd-whale-contour { animation: omd-whale-tail 1.65s ease-in-out infinite; }
  .tx-brand-mark:is(:hover,[data-omd-state="hover"]) .omd-whale-body,
  button:is(:hover,:focus-visible) .tx-brand-mark .omd-whale-body { animation: omd-whale-swim 1.65s ease-in-out infinite; }
  .trisoul-shell[data-omd-running] .tx-brand-mark .omd-whale-rotor,
  .tx-brand-mark[data-omd-state="running"] .omd-whale-rotor { animation: omd-whale-orbit 2.6s linear infinite; }
}
@keyframes omd-whale-tail { 0%,100% { d: path("${DOWN}"); } 45% { d: path("${UP}"); } }
@keyframes omd-whale-swim { 0%,100% { transform: rotate(0); } 45% { transform: translateY(-.2px) rotate(-2.5deg); } }
@keyframes omd-whale-orbit { to { transform: rotate(360deg); } }
@media (forced-colors: active) {
  .omd-whale-body { filter: none !important; }
  .omd-whale-body use { fill: CanvasText; stroke: none; }
  .omd-whale-body > path { display: none; }
  .omd-whale-orbit { display: none; }
}
`;

// src/client/brand.jsx
function BrandMark({ size = 32, className = "" }) {
  const instance = (0, import_react18.useId)().replace(/[^a-zA-Z0-9_-]/g, "");
  const artwork = (0, import_react18.useMemo)(() => ({ __html: whaleSvg("omd-" + instance) }), [instance]);
  const edge = Math.max(32, size);
  return /* @__PURE__ */ import_react18.default.createElement("span", { className: "tx-brand-mark " + className, style: { width: edge, height: edge }, "aria-hidden": "true", dangerouslySetInnerHTML: artwork });
}

// src/client/index.jsx
var api2 = async (path, value) => {
  const response = await fetch(`/trisoul-x/api${path}`, value === void 0 ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
var suffix = (id) => `?${id ? `session=${encodeURIComponent(id)}` : ""}`;
var fmt = (n) => Number(n || 0).toLocaleString();
var kindName = { main: "\u4E3B\u6267\u884C", subagent: "\u5B50\u4EE3\u7406", background: "\u8BB0\u5FC6\u6D88\u5316", recall: "\u8BB0\u5FC6\u68C0\u7D22", state: "\u72B6\u6001\u63D0\u70BC", curation: "\u8BB0\u5FC6\u6574\u7406", surgeon: "\u4E0A\u4E0B\u6587\u6574\u7406", probeAsk: "\u63A2\u9488\u51FA\u9898", probeAnswer: "\u63A2\u9488\u4F5C\u7B54" };
var scopeName = { global: "\u5168\u5C40", cross: "\u8DE8\u9879\u76EE", project: "\u672C\u9879\u76EE" };
var projectLabel = (p) => p?.startsWith("session:") ? `\u4F1A\u8BDD ${p.slice(-8)}` : p;
function MemoryScopeChip({ sessionId, useSessions }) {
  const [state, setState] = (0, import_react19.useState)(null), [open, setOpen] = (0, import_react19.useState)(false), [error, setError] = (0, import_react19.useState)("");
  const current = useSessions((s) => s.byId[sessionId]);
  const load = (0, import_react19.useCallback)(async () => {
    try {
      setState(await api2("/scope" + suffix(sessionId)));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [sessionId]);
  (0, import_react19.useEffect)(() => {
    void load();
    setOpen(false);
  }, [load, current?.blank, current?.running]);
  const labels = { full: "\u5B8C\u5168\u7248", project: "\u9879\u76EE\u7EA7", session: "\u4F1A\u8BDD\u7EA7" };
  const pick = async (scope) => {
    setOpen(false);
    try {
      setState(await api2("/scope" + suffix(sessionId), { scope }));
      setError("");
    } catch (e) {
      setError(e.message);
      await load();
    }
  };
  if (!state) return null;
  const locked = state.locked || current?.blank === false;
  const chip = /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", className: "tx-scope-chip", title: error || (locked ? "\u672C\u4F1A\u8BDD\u5DF2\u7ED1\u5B9A\u8BB0\u5FC6\u8303\u56F4" : "\u9009\u62E9\u65B0\u4F1A\u8BDD\u7684\u8BB0\u5FC6\u8303\u56F4"), "aria-label": "\u8BB0\u5FC6\u8303\u56F4\uFF1A" + labels[state.scope], "aria-haspopup": locked ? void 0 : "menu", "aria-expanded": locked ? void 0 : open, onClick: () => {
    if (!locked) {
      void load();
      setOpen(!open);
    }
  } }, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "memory", size: 13 }), /* @__PURE__ */ import_react19.default.createElement("strong", null, labels[state.scope]), !locked && /* @__PURE__ */ import_react19.default.createElement("span", null, "\u25BE"));
  return locked ? chip : /* @__PURE__ */ import_react19.default.createElement(import_dsh_client_ui_primitives2.Menu, { open, anchor: chip, compact: true, portal: true, side: "top", selectedId: state.scope, items: Object.entries(labels).map(([id, label]) => ({ id, label })), onSelect: pick, onClose: () => setOpen(false) });
}
function BetterTodoChip({ sessionId, useSessions }) {
  const [state, setState] = (0, import_react19.useState)(null), [open, setOpen] = (0, import_react19.useState)(false), [saving, setSaving] = (0, import_react19.useState)(false), [error, setError] = (0, import_react19.useState)("");
  const [notice, setNotice] = (0, import_react19.useState)(false), dialog = (0, import_react19.useRef)(null), noticeId = (0, import_react19.useId)();
  const current = useSessions((s) => s.byId[sessionId]), active = (0, import_react19.useRef)(sessionId), revision = (0, import_react19.useRef)(0), writing = (0, import_react19.useRef)(null);
  active.current = sessionId;
  const load = (0, import_react19.useCallback)(async () => {
    if (writing.current?.sessionId === sessionId) return;
    const ticket = ++revision.current;
    try {
      const next = await api2("/better-todo" + suffix(sessionId));
      if (active.current === sessionId && revision.current === ticket) {
        setState({ sessionId, ...next });
        setError("");
      }
    } catch (e) {
      if (active.current === sessionId && revision.current === ticket) setError(e.message);
    }
  }, [sessionId]);
  (0, import_react19.useEffect)(() => {
    setOpen(false);
    setSaving(false);
    setError("");
    setNotice(false);
  }, [sessionId]);
  (0, import_react19.useEffect)(() => {
    if (notice && !dialog.current?.open) dialog.current?.showModal();
    else if (!notice) dialog.current?.close();
  }, [notice]);
  (0, import_react19.useEffect)(() => {
    void load();
  }, [load, current?.running]);
  const ready = state?.sessionId === sessionId;
  const toggle = async (key) => {
    if (!ready || saving) return;
    const write = { sessionId };
    writing.current = write;
    ++revision.current;
    setSaving(true);
    setError("");
    try {
      const next = await api2("/better-todo" + suffix(sessionId), { [key]: !state[key] });
      if (active.current === sessionId) {
        setState({ sessionId, ...next });
        if (key === "verification" && !state.verification && next.verification) {
          setOpen(false);
          setNotice(true);
        }
      }
    } catch (e) {
      if (active.current === sessionId) setError(e.message);
    } finally {
      if (writing.current === write) writing.current = null;
      if (active.current === sessionId) setSaving(false);
    }
  };
  const chip = /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", className: cx("tx-scope-chip", "tx-bt-chip", ready && !state.todo && !state.verification && "tx-bt-off"), "aria-label": "BT \xB7 Better Todo", "aria-haspopup": "menu", "aria-expanded": open, title: "Better Todo \xB7 \u6536\u5C3E\u63D0\u9192", onClick: () => {
    void load();
    setOpen(!open);
  } }, /* @__PURE__ */ import_react19.default.createElement("strong", null, "BT"), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u25BE"));
  const items = [{ type: "label", id: "title", text: "Better Todo" }, ...[
    ["todo", "\u5F85\u529E\u5B8C\u6210\u63D0\u9192", "\u4ECD\u6709\u672A\u5B8C\u6210\u5F85\u529E\u65F6\u63D0\u9192\u7EE7\u7EED"],
    ["verification", "\u9A8C\u8BC1\u5B8C\u6210\u63D0\u9192", "\u7F3A\u5C11\u9A8C\u8BC1\u8BC1\u636E\u65F6\u63D0\u9192\uFF0C\u542B\u6587\u5B57\u8BC1\u636E\u590D\u6838"]
  ].map(([id, label, hint]) => ({ id, disabled: !ready || saving, label: /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-bt-option" }, /* @__PURE__ */ import_react19.default.createElement("span", null, /* @__PURE__ */ import_react19.default.createElement("strong", null, label), /* @__PURE__ */ import_react19.default.createElement("small", null, hint)), /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-bt-state" }, /* @__PURE__ */ import_react19.default.createElement("small", null, ready ? state[id] ? "\u5F00" : "\u5173" : "\u2026"), /* @__PURE__ */ import_react19.default.createElement("i", { className: cx("tx-bt-toggle", ready && state[id] && "tx-on"), "aria-hidden": "true" }))) }))];
  return /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement(import_dsh_client_ui_primitives2.Menu, { open, anchor: chip, items, footer: [{ type: "label", id: "status", text: error || "\u4EC5\u672C\u4F1A\u8BDD \xB7 \u53EF\u968F\u65F6\u66F4\u6539" }], onSelect: toggle, onClose: () => setOpen(false), portal: true, side: "top", align: "end", compact: true, autoFocus: true }), /* @__PURE__ */ import_react19.default.createElement("dialog", { ref: dialog, className: "tx-bt-notice", "aria-labelledby": noticeId, "aria-describedby": noticeId + "-body", onCancel: () => setNotice(false), onClose: () => setNotice(false) }, /* @__PURE__ */ import_react19.default.createElement("h2", { id: noticeId }, "\u9A8C\u8BC1\u5B8C\u6210\u63D0\u9192"), /* @__PURE__ */ import_react19.default.createElement("p", { id: noticeId + "-body" }, "\u6B64\u9009\u9879\u5C06\u4F1A\u5E26\u6765\u66F4\u9AD8\u7684\u4EFB\u52A1\u5B8C\u6210\u7387\uFF0C\u540C\u65F6\u4E5F\u4F1A\u6D88\u8017\u66F4\u591A\u65F6\u95F4\u548C token\u3002"), /* @__PURE__ */ import_react19.default.createElement("div", null, /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", autoFocus: true, onClick: () => setNotice(false) }, "\u77E5\u9053\u4E86"))));
}
function useSnapshot(id, visible = true, range = "session") {
  const [data, setData] = (0, import_react19.useState)(null), [error, setError] = (0, import_react19.useState)("");
  const key = `${id}:${range}`, current = (0, import_react19.useRef)(key);
  current.current = key;
  const reload = (0, import_react19.useCallback)(async () => {
    try {
      const next = await api2(`/state${suffix(id)}&range=${range}`);
      if (current.current === key) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (current.current === key) setError(e.message);
    }
  }, [id, range, key]);
  (0, import_react19.useEffect)(() => {
    if (!visible) return;
    let active = true, timer;
    const tick = async () => {
      await reload();
      if (active) timer = setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [reload, visible]);
  return { data, error, reload };
}
var compactNumber = (n) => Number(n || 0) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Number(n || 0) >= 1e3 ? (n / 1e3).toFixed(1) + "k" : fmt(n);
var duration = (ms) => !ms ? "\u2014" : ms >= 6e4 ? `${Math.floor(ms / 6e4)}m ${Math.round(ms % 6e4 / 1e3)}s` : `${(ms / 1e3).toFixed(1)}s`;
var shortDate = (at) => at ? new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "\u2014";
var inputTokens = (m) => (m?.inputTokens || 0) + (m?.cacheReadTokens || 0) + (m?.cacheWriteTokens || 0);
var cx = (...parts) => parts.filter(Boolean).join(" ");
function Icon2({ name, size = 16 }) {
  const paths = {
    settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
    memory: "M8 3h8l4 4v10l-4 4H8l-4-4V7l4-4ZM9 8h6v8H9z",
    context: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5",
    monitor: "M3 17h4l3-10 4 14 3-10h4",
    search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    plus: "M12 5v14M5 12h14",
    arrow: "M14 5l-7 7 7 7",
    check: "M5 12l4 4L19 6",
    close: "M6 6l12 12M6 18L18 6",
    filter: "M4 7h16M7 12h10M10 17h4",
    pin: "M9 3h6l-1 5 4 4v2H6v-2l4-4-1-5ZM12 14v7",
    refresh: "M20 7v5h-5M4 17v-5h5M5 8a7 7 0 0 1 12-3l3 3M19 16A7 7 0 0 1 7 19l-3-3",
    chevron: "M9 5l7 7-7 7",
    clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    edit: "M15 5l4 4M4 20l5-1L20 8l-4-4L5 15l-1 5Z",
    layers: "M12 3l10 6-10 6L2 9l10-6ZM2 13l10 6 10-6M2 17l10 6 10-6"
  };
  return /* @__PURE__ */ import_react19.default.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ import_react19.default.createElement("path", { d: paths[name] || paths.context }));
}
function Action({ children, icon, primary, quiet, className, ...props }) {
  return /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", className: cx("tx-button", primary && "tx-primary", quiet && "tx-quiet", !children && "tx-icon-button", className), ...props }, icon && /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: icon }), " ", children);
}
function Tabs({ value, onChange, items, label }) {
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-tabs", role: "tablist", "aria-label": label }, items.map(([id, title, count]) => /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", role: "tab", "aria-selected": value === id, key: id, onClick: () => onChange(id) }, title, count != null && /* @__PURE__ */ import_react19.default.createElement("span", null, count))));
}
function Segments({ value, onChange, items, label }) {
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-segments", role: "group", "aria-label": label }, items.map(([id, title]) => /* @__PURE__ */ import_react19.default.createElement("button", { key: id, type: "button", "aria-pressed": value === id, onClick: () => onChange(id) }, title)));
}
function Header({ icon, title, subtitle, actions }) {
  return /* @__PURE__ */ import_react19.default.createElement("header", { className: "tx-page-head" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-title-line" }, /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-page-icon" }, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: icon, size: 20 })), /* @__PURE__ */ import_react19.default.createElement("div", null, /* @__PURE__ */ import_react19.default.createElement("h2", null, title), subtitle && /* @__PURE__ */ import_react19.default.createElement("p", null, subtitle))), actions && /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-head-actions" }, actions));
}
function Empty({ icon = "layers", title, children }) {
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-empty" }, /* @__PURE__ */ import_react19.default.createElement("span", null, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: icon, size: 24 })), /* @__PURE__ */ import_react19.default.createElement("h3", null, title), children && /* @__PURE__ */ import_react19.default.createElement("p", null, children));
}
function Badge({ children, tone }) {
  return /* @__PURE__ */ import_react19.default.createElement("span", { className: cx("tx-badge", tone && "tx-" + tone) }, children);
}
function Alert({ children, error }) {
  return children ? /* @__PURE__ */ import_react19.default.createElement("div", { className: cx("tx-alert", error && "tx-alert-error"), role: error ? "alert" : "status" }, children) : null;
}
function Fold({ title, subtitle, children, count, open = false }) {
  return /* @__PURE__ */ import_react19.default.createElement("details", { className: "tx-fold", open: open || void 0 }, /* @__PURE__ */ import_react19.default.createElement("summary", null, /* @__PURE__ */ import_react19.default.createElement("div", null, /* @__PURE__ */ import_react19.default.createElement("strong", null, title), subtitle && /* @__PURE__ */ import_react19.default.createElement("small", null, subtitle)), count != null && /* @__PURE__ */ import_react19.default.createElement(Badge, null, count), /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "chevron" })), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-fold-body" }, children));
}
function Toggle({ label, hint, checked, onChange }) {
  return /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-toggle-row" }, /* @__PURE__ */ import_react19.default.createElement("span", null, /* @__PURE__ */ import_react19.default.createElement("strong", null, label), hint && /* @__PURE__ */ import_react19.default.createElement("small", null, hint)), /* @__PURE__ */ import_react19.default.createElement("input", { type: "checkbox", role: "switch", checked, onChange: (e) => onChange(e.target.checked) }));
}
function Numbers({ fields, config, onChange }) {
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-form-grid" }, fields.map(([key, label, min = 0, step = 1, max]) => /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field", key }, /* @__PURE__ */ import_react19.default.createElement("span", null, label), /* @__PURE__ */ import_react19.default.createElement("input", { type: "number", min, step, max, value: config[key] ?? 0, onChange: (e) => onChange(key, Number(e.target.value)) }))));
}
function RouteFields({ route, directory, onChange }) {
  const list = import_react19.default.useId();
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-form-grid" }, /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u63D0\u4F9B\u65B9"), /* @__PURE__ */ import_react19.default.createElement("select", { value: route.provider, onChange: (e) => onChange({ ...route, provider: e.target.value, model: "" }) }, /* @__PURE__ */ import_react19.default.createElement("option", { value: "" }, "\u8DDF\u968F\u4E3B\u6A21\u578B"), directory.map((p) => /* @__PURE__ */ import_react19.default.createElement("option", { key: p.id, value: p.id }, p.name || p.id)))), /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u6A21\u578B"), /* @__PURE__ */ import_react19.default.createElement("input", { list, value: route.model, placeholder: "\u8DDF\u968F\u4E3B\u6A21\u578B", onChange: (e) => onChange({ ...route, model: e.target.value }) }), /* @__PURE__ */ import_react19.default.createElement("datalist", { id: list }, (directory.find((p) => p.id === route.provider)?.models || []).map((m) => /* @__PURE__ */ import_react19.default.createElement("option", { key: m.id, value: m.id })))), /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u63A8\u7406\u5F3A\u5EA6"), /* @__PURE__ */ import_react19.default.createElement("select", { value: route.effort || "off", onChange: (e) => onChange({ ...route, effort: e.target.value }) }, /* @__PURE__ */ import_react19.default.createElement("option", { value: "off" }, "\u5173\u95ED\uFF08\u6A21\u578B\u652F\u6301\u65F6\uFF09"), /* @__PURE__ */ import_react19.default.createElement("option", { value: "inherit" }, "\u63D0\u4F9B\u65B9\u9ED8\u8BA4"))), /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u6E29\u5EA6"), /* @__PURE__ */ import_react19.default.createElement("input", { type: "number", min: "0", max: "2", step: "0.1", value: route.temperature, onChange: (e) => onChange({ ...route, temperature: Number(e.target.value) }) })));
}
var routeModeOf = (c) => (c.backgroundMode === "unified" ? [c.unifiedBackground] : [c.background, c.canvas, c.surgeon]).every((r) => !r?.provider && !r?.model && (!r?.effort || r.effort === "off") && (r?.temperature ?? 0.7) === 0.7) ? "follow" : c.backgroundMode;
var advancedGroups = [
  ["\u8BB0\u5FC6\u6D88\u5316\u4E0E\u6574\u7406", "\u4F55\u65F6\u63D0\u53D6\u8BB0\u5FC6\u3001\u6574\u7406\u91CD\u590D\u5185\u5BB9", [["digestEvery", "\u6BCF\u6279\u6D88\u5316\u4E8B\u4EF6\u6570", 1], ["flushIdleMs", "\u7A7A\u95F2\u95F4\u9694 \xB7 \u6BEB\u79D2\uFF080 \u5173\u95ED\uFF09"], ["curateMinGapMs", "\u6574\u7406\u6700\u77ED\u95F4\u9694 \xB7 \u6BEB\u79D2"], ["curateEvery", "\u6BCF\u51E0\u6279\u6574\u7406\u4E00\u6B21\uFF080 \u81EA\u52A8\uFF09"]], [["digestBatchMax", "\u6279\u6B21\u4E8B\u4EF6\u4E0A\u9650"], ["digestEventChars", "\u5355\u4E8B\u4EF6\u5B57\u7B26\u4E0A\u9650"], ["digestMaxTokens", "\u6D88\u5316\u8F93\u51FA Token \u4E0A\u9650"], ["catchupMax", "\u6062\u590D\u65F6\u8865\u6D88\u5316\u4E8B\u4EF6\u4E0A\u9650"], ["contextMemories", "\u8BB0\u5FC6\u8868\u6761\u76EE\u4E0A\u9650"], ["recallMaxTokens", "\u68C0\u7D22\u8F93\u51FA Token \u4E0A\u9650"], ["curateLimit", "\u6574\u7406\u6BCF\u8F6E\u6761\u76EE\u4E0A\u9650"], ["curateOpsMax", "\u6BCF\u8F6E\u64CD\u4F5C\u6570\u4E0A\u9650"], ["curateMaxTokens", "\u6574\u7406\u8F93\u51FA Token \u4E0A\u9650"]]],
  ["\u4EFB\u52A1\u8BB0\u5FC6", "\u8865\u6CE8\u6570\u91CF\u3001\u6587\u6863\u66F4\u65B0\u65B9\u5F0F\u4E0E\u9891\u7387", [["injectLimit", "\u5F00\u573A\u6761\u76EE\u6570\uFF080 \u4E0D\u9650\uFF09"], ["injectBatch", "\u6BCF\u6B21\u8865\u6CE8\u6761\u76EE\u6570", 1], ["injectMaxPerSession", "\u6BCF\u4F1A\u8BDD\u6CE8\u5165\u6B21\u6570"], ["injectPickTimeoutMs", "\u9996\u6B21\u68C0\u7D22\u7B49\u5F85 \xB7 \u6BEB\u79D2"], ["supplementMinSteps", "\u6587\u6863\u66F4\u65B0\u6700\u77ED\u6B65\u6570"]]],
  ["\u5DE5\u4F5C\u72B6\u6001", "\u72B6\u6001\u63D0\u70BC\u7684\u91CD\u8BD5\u4E0E\u8D44\u6E90\u4E0A\u9650", [["stateFailCooldownSteps", "\u5931\u8D25\u540E\u95F4\u9694\u6B65\u6570"], ["stateFailLimit", "\u8FDE\u7EED\u5931\u8D25\u6682\u505C\u538B\u7F29\uFF080 \u5173\u95ED\uFF09"]], [["stateBatchMax", "\u6279\u6B21\u4E8B\u4EF6\u4E0A\u9650"], ["statePinnedMax", "\u56FA\u5B9A\u7EA6\u675F\u6761\u76EE\u4E0A\u9650"], ["stateEventChars", "\u5355\u4E8B\u4EF6\u5B57\u7B26\u4E0A\u9650"], ["stateMaxTokens", "\u8F93\u51FA Token \u4E0A\u9650"]]],
  ["\u4E0A\u4E0B\u6587\u6574\u7406", "\u4FDD\u7559\u8303\u56F4\u3001\u538B\u7F29\u6761\u4EF6\u4E0E\u5931\u8D25\u91CD\u8BD5", [["keepTailEvents", "\u4FDD\u7559\u6700\u8FD1\u4E8B\u4EF6\u6570", 2], ["minRegionEvents", "\u533A\u95F4\u6700\u5C11\u4E8B\u4EF6\u6570", 1], ["surgeryFailCooldownSteps", "\u5931\u8D25\u540E\u95F4\u9694\u6B65\u6570"], ["shadowStale", "\u65E7\u5FEB\u7167\u6E05\u7406\u6570\u91CF\uFF080 \u5173\u95ED\uFF09"], ["thresholdRatio", "\u7A97\u53E3\u538B\u529B\u6BD4\u4F8B", 0.1, 0.05, 0.95]], [["thresholdChars", "\u56FA\u5B9A\u5B57\u7B26\u9608\u503C\uFF080 \u4F7F\u7528\u6BD4\u4F8B\uFF09"], ["thresholdFallbackChars", "\u7A97\u53E3\u672A\u77E5\u65F6\u7684\u5B57\u7B26\u9608\u503C"], ["surgeonMaxTokens", "\u8F93\u51FA Token \u4E0A\u9650"]]],
  ["\u538B\u7F29\u68C0\u67E5", "\u9057\u6F0F\u4E8B\u5B9E\u7684\u68C0\u67E5\u4E0E\u8865\u8BB0\u65B9\u5F0F", [], [["probeSourceChars", "\u53C2\u8003\u6750\u6599\u5B57\u7B26\u4E0A\u9650"], ["probeMaxTokens", "\u8F93\u51FA Token \u4E0A\u9650"], ["probePatchChars", "\u6750\u6599\u8865\u8BB0\u5B57\u7B26\u4E0A\u9650"]]]
];
function Settings() {
  const [config, setConfig] = (0, import_react19.useState)(null), [directory, setDirectory] = (0, import_react19.useState)([]), [status, setStatus] = (0, import_react19.useState)(""), [failed, setFailed] = (0, import_react19.useState)(false);
  const [page, setPage] = (0, import_react19.useState)("basic"), [routing, setRouting] = (0, import_react19.useState)("follow"), [custom, setCustom] = (0, import_react19.useState)(false), [saving, setSaving] = (0, import_react19.useState)(false);
  const saved = (0, import_react19.useRef)(null);
  (0, import_react19.useEffect)(() => {
    api2("/state").then((s) => {
      saved.current = s.config;
      setConfig(s.config);
      setRouting(routeModeOf(s.config));
      setDirectory(s.directory);
    }).catch((e) => {
      setStatus(e.message);
      setFailed(true);
    });
  }, []);
  const field = (key, value) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setStatus("");
  };
  if (!config) return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-app" }, /* @__PURE__ */ import_react19.default.createElement(Header, { icon: "settings", title: "\u504F\u597D\u8BBE\u7F6E" }), /* @__PURE__ */ import_react19.default.createElement(Empty, { title: failed ? "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u8BBE\u7F6E" : "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E" }, status));
  const dirty = JSON.stringify(config) !== JSON.stringify(saved.current);
  const selectedPreset = Object.entries(FREQUENCY_PRESETS).find(([, values]) => Object.entries(values).every(([key, value]) => config[key] === value))?.[0];
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFailed(false);
    try {
      const patch = Object.fromEntries(Object.entries(config).filter(([key, value]) => key !== "dataDir" && JSON.stringify(value) !== JSON.stringify(saved.current[key])));
      const next = await api2("/settings", patch);
      saved.current = next;
      setConfig(next);
      setStatus("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58");
    } catch (e2) {
      setFailed(true);
      setStatus(e2.message);
    } finally {
      setSaving(false);
    }
  };
  const selectRoute = (mode) => {
    setRouting(mode);
    if (mode === "follow") {
      field("backgroundMode", "unified");
      field("unifiedBackground", { provider: "", model: "", temperature: 0.7, effort: "off" });
    } else field("backgroundMode", mode);
  };
  return /* @__PURE__ */ import_react19.default.createElement("form", { className: "tx-app tx-settings", onSubmit: save }, /* @__PURE__ */ import_react19.default.createElement(Header, { icon: "settings", title: "\u504F\u597D\u8BBE\u7F6E", subtitle: "\u6A21\u578B\u3001\u8BB0\u5FC6\u4E0E\u4E0A\u4E0B\u6587" }), /* @__PURE__ */ import_react19.default.createElement(Tabs, { label: "\u8BBE\u7F6E\u5206\u7C7B", value: page, onChange: setPage, items: [["basic", "\u5E38\u7528"], ["advanced", "\u9AD8\u7EA7"]] }), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-body" }, page === "basic" ? /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u540E\u53F0\u6A21\u578B"), /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-muted" }, "\u4E3B\u6A21\u578B\u5728 DSH \u4E2D\u8BBE\u7F6E")), /* @__PURE__ */ import_react19.default.createElement(Segments, { label: "\u540E\u53F0\u6A21\u578B\u914D\u7F6E\u65B9\u5F0F", value: routing, onChange: selectRoute, items: [["follow", "\u8DDF\u968F\u4E3B\u6A21\u578B"], ["unified", "\u7EDF\u4E00\u914D\u7F6E"], ["separate", "\u5206\u522B\u914D\u7F6E"]] }), routing === "follow" ? /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-inline-note" }, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "layers" }), "\u8BB0\u5FC6\u3001\u72B6\u6001\u4E0E\u6574\u7406\u4F7F\u7528\u5F53\u524D\u5BF9\u8BDD\u7684\u6A21\u578B\u3002") : routing === "unified" ? /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-route-fields" }, /* @__PURE__ */ import_react19.default.createElement(RouteFields, { route: config.unifiedBackground, directory, onChange: (r) => field("unifiedBackground", r) })) : /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-route-list" }, [["background", "\u8BB0\u5FC6"], ["canvas", "\u72B6\u6001\u4E0E\u68C0\u67E5"], ["surgeon", "\u4E0A\u4E0B\u6587\u6574\u7406"]].map(([key, label]) => /* @__PURE__ */ import_react19.default.createElement(Fold, { key, title: label, subtitle: config[key].model || "\u8DDF\u968F\u4E3B\u6A21\u578B" }, /* @__PURE__ */ import_react19.default.createElement(RouteFields, { route: config[key], directory, onChange: (r) => field(key, r) }))))), /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u9ED8\u8BA4\u8BB0\u5FC6\u8303\u56F4"), /* @__PURE__ */ import_react19.default.createElement(Badge, null, "\u65B0\u4F1A\u8BDD")), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-choice-grid", role: "group", "aria-label": "\u9ED8\u8BA4\u8BB0\u5FC6\u8303\u56F4" }, [["full", "\u5B8C\u5168\u7248", "\u5168\u5C40\u4E0E\u9879\u76EE\u8BB0\u5FC6"], ["project", "\u9879\u76EE\u7EA7", "\u4EC5\u4F7F\u7528\u672C\u9879\u76EE\u8BB0\u5FC6"], ["session", "\u4F1A\u8BDD\u7EA7", "\u4EC5\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u4F7F\u7528"]].map(([id, title, hint]) => /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", key: id, "aria-pressed": config.memoryScope === id, onClick: () => field("memoryScope", id) }, /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-choice-mark" }, config.memoryScope === id ? /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "check", size: 13 }) : null), /* @__PURE__ */ import_react19.default.createElement("strong", null, title), /* @__PURE__ */ import_react19.default.createElement("small", null, hint)))), /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u4E5F\u53EF\u5728\u8F93\u5165\u533A\u9009\u62E9\uFF0C\u5F00\u59CB\u5BF9\u8BDD\u540E\u7ED1\u5B9A\u5230\u8BE5\u4F1A\u8BDD\u3002")), /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u72B6\u6001\u3001\u8BB0\u5FC6\u4E0E\u6574\u7406\u9891\u7387")), /* @__PURE__ */ import_react19.default.createElement(Segments, { label: "\u66F4\u65B0\u9891\u7387", value: custom || !selectedPreset ? "custom" : selectedPreset, onChange: (id) => {
    setCustom(id === "custom");
    if (FREQUENCY_PRESETS[id]) {
      setConfig((c) => ({ ...c, ...FREQUENCY_PRESETS[id] }));
      setStatus("");
    }
  }, items: [["always", "\u9891\u7E41"], ["medium", "\u9002\u4E2D"], ["slow", "\u8F83\u5C11"], ["custom", "\u81EA\u5B9A\u4E49"]] }), custom || !selectedPreset ? /* @__PURE__ */ import_react19.default.createElement(Numbers, { config, onChange: field, fields: [["stateEvery", "\u72B6\u6001\u63D0\u70BC \xB7 \u4E8B\u4EF6\u6570", 1], ["digestEvery", "\u8BB0\u5FC6\u6D88\u5316 \xB7 \u4E8B\u4EF6\u6570", 1], ["supplementMinSteps", "\u8BB0\u5FC6\u6587\u6863 \xB7 \u6700\u77ED\u6B65\u6570"], ["surgeryCooldownSteps", "\u4E0A\u4E0B\u6587\u6574\u7406 \xB7 \u95F4\u9694\u6B65\u6570"], ["minRegionTokens", "\u6700\u5C0F\u6574\u7406\u533A\u95F4 \xB7 Token", 1]] }) : /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u72B6\u6001\u6BCF ", config.stateEvery, " \u6761\u4E8B\u4EF6\u63D0\u70BC\uFF0C\u8BB0\u5FC6\u6587\u6863\u81F3\u5C11\u95F4\u9694 ", config.supplementMinSteps, " \u6B65\u66F4\u65B0\u3002", { always: "\u66F4\u53CA\u65F6\u5730\u8DDF\u8FDB\u8FDB\u5C55\u3002", medium: "\u79EF\u7D2F\u4E00\u6BB5\u8FDB\u5C55\u540E\u518D\u66F4\u65B0\u3002", slow: "\u51CF\u5C11\u540E\u53F0\u8C03\u7528\u4E0E\u6587\u6863\u66F4\u65B0\u3002" }[selectedPreset]), /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u4E00\u6761\u7528\u6237\u6D88\u606F\u3001\u6A21\u578B\u56DE\u590D\u6216\u5DE5\u5177\u7ED3\u679C\u5404\u7B97\u4E00\u6761\u4E8B\u4EF6\uFF1B\u4E00\u6B65\u6307\u4E00\u6B21\u4E3B\u6A21\u578B\u8C03\u7528\u3002\u6863\u4F4D\u540C\u65F6\u8C03\u6574\u8BB0\u5FC6\u6D88\u5316\u3001\u72B6\u6001\u63D0\u70BC\u3001\u6587\u6863\u66F4\u65B0\u548C\u4E0A\u4E0B\u6587\u6574\u7406\u3002")), /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section tx-switches" }, /* @__PURE__ */ import_react19.default.createElement(Toggle, { label: "\u6301\u7EED\u66F4\u65B0\u5DE5\u4F5C\u72B6\u6001", hint: "\u8BB0\u5F55\u7528\u6237\u7EA6\u675F\u4E0E\u5F53\u524D\u4EFB\u52A1\u8FDB\u5C55", checked: config.stateEnabled, onChange: (v) => field("stateEnabled", v) }), /* @__PURE__ */ import_react19.default.createElement(Toggle, { label: "\u68C0\u67E5\u538B\u7F29\u540E\u7684\u4E8B\u5B9E", hint: "\u53D1\u73B0\u9057\u6F0F\u65F6\u4FDD\u7559\u8865\u8BB0\uFF0C\u4F9B\u540E\u7EED\u6574\u7406\u4F7F\u7528", checked: config.probeEnabled, onChange: (v) => field("probeEnabled", v) }))) : /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help tx-advanced-intro" }, "\u901A\u5E38\u4FDD\u7559\u9ED8\u8BA4\u503C\u5373\u53EF\u3002\u5C55\u5F00\u67D0\u4E00\u9879\uFF0C\u518D\u8C03\u6574\u5BF9\u5E94\u53C2\u6570\u3002"), advancedGroups.map(([title, hint, fields, limits]) => /* @__PURE__ */ import_react19.default.createElement(Fold, { key: title, title, subtitle: hint }, title === "\u4EFB\u52A1\u8BB0\u5FC6" && /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u6587\u6863\u66F4\u65B0\u65B9\u5F0F"), /* @__PURE__ */ import_react19.default.createElement("select", { value: config.supplementMode, onChange: (e) => field("supplementMode", e.target.value) }, /* @__PURE__ */ import_react19.default.createElement("option", { value: "renew" }, "\u6309\u7248\u672C\u8FFD\u52A0"), /* @__PURE__ */ import_react19.default.createElement("option", { value: "rewrite" }, "\u539F\u4F4D\u66F4\u65B0"), /* @__PURE__ */ import_react19.default.createElement("option", { value: "append" }, "\u9010\u6279\u8FFD\u52A0"))), title === "\u538B\u7F29\u68C0\u67E5" && /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u9057\u6F0F\u4E8B\u5B9E\u5982\u4F55\u8865\u8BB0"), /* @__PURE__ */ import_react19.default.createElement("select", { value: config.probePatch, onChange: (e) => field("probePatch", e.target.value) }, /* @__PURE__ */ import_react19.default.createElement("option", { value: "ride" }, "\u968F\u4E0B\u6B21\u6574\u7406\u5199\u5165"), /* @__PURE__ */ import_react19.default.createElement("option", { value: "qa" }, "\u7ACB\u5373\u8865\u5165\u95EE\u7B54"), /* @__PURE__ */ import_react19.default.createElement("option", { value: "material" }, "\u7ACB\u5373\u8865\u5165\u53C2\u8003\u6750\u6599"))), /* @__PURE__ */ import_react19.default.createElement(Numbers, { fields, config, onChange: field }), title === "\u4E0A\u4E0B\u6587\u6574\u7406" && /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-switches" }, [["semanticCompaction", "\u6309\u6D88\u5316\u7ED3\u679C\u9009\u62E9\u533A\u95F4"], ["mergeCheckpoints", "\u5408\u5E76\u8F83\u65E9\u5DE5\u4F5C\u7EAA\u8981"], ["requireShorter", "\u6574\u7406\u540E\u5E94\u77ED\u4E8E\u539F\u6750\u6599"], ["userRetirement", "\u5141\u8BB8\u538B\u7F29\u8F83\u65E9\u7528\u6237\u6D88\u606F"]].map(([key, label]) => /* @__PURE__ */ import_react19.default.createElement(Toggle, { key, label, checked: config[key], onChange: (v) => field(key, v) }))), limits && /* @__PURE__ */ import_react19.default.createElement("details", { className: "tx-subfold" }, /* @__PURE__ */ import_react19.default.createElement("summary", null, "\u53EF\u9009\u8D44\u6E90\u4E0A\u9650"), /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u957F\u5EA6\u3001\u6761\u76EE\u548C\u8F93\u51FA\u4E0A\u9650\u4E3A 0 \u65F6\u4E0D\u9650\u5236\u3002"), /* @__PURE__ */ import_react19.default.createElement(Numbers, { fields: limits, config, onChange: field })))), /* @__PURE__ */ import_react19.default.createElement(Fold, { title: "\u540E\u53F0\u4F5C\u4E1A\u8D85\u65F6", subtitle: "\u63A7\u5236\u5355\u6B21\u540E\u53F0\u8C03\u7528\u7684\u6700\u957F\u7B49\u5F85\u65F6\u95F4" }, /* @__PURE__ */ import_react19.default.createElement(Numbers, { fields: [["jobTimeoutMs", "\u8D85\u65F6 \xB7 \u6BEB\u79D2\uFF080 \u4E0D\u9650\u5236\uFF09"]], config, onChange: field })))), /* @__PURE__ */ import_react19.default.createElement("footer", { className: "tx-savebar" }, /* @__PURE__ */ import_react19.default.createElement("span", { className: failed ? "tx-error" : "tx-muted", role: "status" }, status || (dirty ? "\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539" : "\u66F4\u6539\u540E\u4FDD\u5B58\u5373\u53EF\u751F\u6548")), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-actions" }, /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, disabled: !dirty || saving, onClick: () => {
    setConfig(saved.current);
    setRouting(routeModeOf(saved.current));
    setStatus("");
  } }, "\u64A4\u9500"), /* @__PURE__ */ import_react19.default.createElement(Action, { type: "submit", primary: true, disabled: !dirty || saving, icon: saving ? "clock" : "check" }, saving ? "\u4FDD\u5B58\u4E2D" : "\u4FDD\u5B58\u8BBE\u7F6E"))));
}
function Evidence({ link }) {
  const verdict = link.kind === "test" ? link.lastRun ? link.lastRun.timedOut ? "\u8D85\u65F6" : link.lastRun.pass ? "\u901A\u8FC7" : "\u672A\u901A\u8FC7" : "\u672A\u8FD0\u884C" : "\u6587\u5B57\u8BC1\u636E";
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-evidence" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-row-between" }, /* @__PURE__ */ import_react19.default.createElement("strong", null, link.path || (link.kind === "test" ? "\u6D4B\u8BD5\u9A8C\u8BC1" : "\u6587\u5B57\u8BB0\u5F55")), /* @__PURE__ */ import_react19.default.createElement(Badge, { tone: link.lastRun?.pass ? "good" : link.lastRun ? "warn" : void 0 }, verdict)), link.cmd && /* @__PURE__ */ import_react19.default.createElement("pre", null, link.cmd), link.note && /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-prose" }, link.note), link.reason && /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u539F\u56E0\uFF1A", link.reason), link.lastRun?.tail && /* @__PURE__ */ import_react19.default.createElement("details", { className: "tx-subfold" }, /* @__PURE__ */ import_react19.default.createElement("summary", null, "\u67E5\u770B\u8FD0\u884C\u8F93\u51FA"), /* @__PURE__ */ import_react19.default.createElement("pre", null, link.lastRun.tail)));
}
function ContextPanel({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo(), { data, error, reload } = useSnapshot(sessionId, tab.visible);
  const [page, setPage] = (0, import_react19.useState)("tasks"), [status, setStatus] = (0, import_react19.useState)(""), [compacting, setCompacting] = (0, import_react19.useState)(false), [failed, setFailed] = (0, import_react19.useState)(false);
  const context = data?.context, tasks = data?.tasks || [], done = tasks.filter((t) => t.status === "completed").length;
  const compact = async () => {
    setCompacting(true);
    setStatus("");
    setFailed(false);
    try {
      const r = await api2("/compact" + suffix(sessionId), {});
      setStatus(r.changed ? "\u5DF2\u6574\u7406\u8F83\u65E9\u4E0A\u4E0B\u6587\uFF0C\u539F\u6587\u4ECD\u53EF\u56DE\u635E\u3002" : "\u76EE\u524D\u6CA1\u6709\u9002\u5408\u6574\u7406\u7684\u8F83\u65E9\u5185\u5BB9\u3002");
      await reload();
    } catch (e) {
      setFailed(true);
      setStatus(e.message);
    } finally {
      setCompacting(false);
    }
  };
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-app" }, /* @__PURE__ */ import_react19.default.createElement(Header, { icon: "context", title: "\u5DE5\u4F5C\u4E0A\u4E0B\u6587", subtitle: "\u4EFB\u52A1\u3001\u72B6\u6001\u4E0E\u6B63\u5728\u4F7F\u7528\u7684\u8BB0\u5FC6", actions: /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, icon: compacting ? "clock" : "layers", disabled: data?.running !== "idle" || compacting, onClick: compact }, compacting ? "\u6574\u7406\u4E2D" : "\u6574\u7406") }), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-context-summary" }, /* @__PURE__ */ import_react19.default.createElement("div", null, /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-status-dot" }), /* @__PURE__ */ import_react19.default.createElement("span", null, data?.running !== "idle" && data?.running ? "\u6B63\u5728\u6267\u884C" : tasks.length && done === tasks.length ? "\u4EFB\u52A1\u5DF2\u5B8C\u6210" : tasks.length ? "\u4EFB\u52A1\u5F85\u7EE7\u7EED" : "\u7B49\u5F85\u65B0\u4EFB\u52A1")), tasks.length > 0 && /* @__PURE__ */ import_react19.default.createElement("span", null, /* @__PURE__ */ import_react19.default.createElement("strong", null, done), " / ", tasks.length, " \u5B8C\u6210")), tasks.length > 0 && /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-progress", role: "progressbar", "aria-label": "\u4EFB\u52A1\u5B8C\u6210\u8FDB\u5EA6", "aria-valuenow": done, "aria-valuemin": 0, "aria-valuemax": tasks.length }, /* @__PURE__ */ import_react19.default.createElement("i", { style: { width: `${done / tasks.length * 100}%` } })), /* @__PURE__ */ import_react19.default.createElement(Tabs, { label: "\u4E0A\u4E0B\u6587\u5206\u7C7B", value: page, onChange: setPage, items: [["tasks", "\u4EFB\u52A1", tasks.length || void 0], ["state", "\u5DE5\u4F5C\u72B6\u6001"], ["memory", "\u8BB0\u5FC6\u6587\u6863"]] }), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-body" }, /* @__PURE__ */ import_react19.default.createElement(Alert, { error: true }, error), /* @__PURE__ */ import_react19.default.createElement(Alert, { error: failed }, status), page === "tasks" && /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, tasks.length ? /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-task-list" }, tasks.map((task, i) => /* @__PURE__ */ import_react19.default.createElement("article", { className: "tx-task", key: task.id || i }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-task-title" }, /* @__PURE__ */ import_react19.default.createElement("span", { className: cx("tx-task-check", task.status === "completed" && "is-done") }, task.status === "completed" ? /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "check", size: 13 }) : /* @__PURE__ */ import_react19.default.createElement("span", null)), /* @__PURE__ */ import_react19.default.createElement("strong", null, task.content), /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-task-id" }, task.id)), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-task-badges" }, /* @__PURE__ */ import_react19.default.createElement(Badge, { tone: task.status === "completed" ? "good" : void 0 }, task.status === "completed" ? "\u5DF2\u5B8C\u6210" : "\u5F85\u5B8C\u6210"), task.links?.some((l) => l.lastRun?.pass) ? /* @__PURE__ */ import_react19.default.createElement(Badge, { tone: "good" }, "\u6D4B\u8BD5\u901A\u8FC7") : /* @__PURE__ */ import_react19.default.createElement(Badge, null, task.links?.length ? "\u5DF2\u6709\u8BC1\u636E" : "\u5F85\u9A8C\u8BC1")), /* @__PURE__ */ import_react19.default.createElement("details", { className: "tx-task-detail" }, /* @__PURE__ */ import_react19.default.createElement("summary", null, "\u9700\u6C42\u539F\u6587\u4E0E\u9A8C\u8BC1 ", /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "chevron", size: 13 })), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-quote" }, task.source || "\u5C1A\u672A\u7ED1\u5B9A\u539F\u6587\u951A\u70B9", task.anchor && /* @__PURE__ */ import_react19.default.createElement("small", null, "\u6D88\u606F ", task.sourceMessage, " \xB7 \u6458\u5F55 ", task.sourceExcerpt)), task.links?.length ? task.links.map((link) => /* @__PURE__ */ import_react19.default.createElement(Evidence, { key: link.id, link })) : /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u5B8C\u6210\u4EFB\u52A1\u540E\uFF0C\u5173\u8054\u5B9E\u9645\u9A8C\u8BC1\u8BC1\u636E\u3002"), task.verification && /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-prose" }, task.verification.method, /* @__PURE__ */ import_react19.default.createElement("br", null), task.verification.result))))) : /* @__PURE__ */ import_react19.default.createElement(Empty, { icon: "check", title: "\u4EFB\u52A1\u4F1A\u5728\u8FD9\u91CC\u5C55\u5F00" }, "\u591A\u6B65\u9AA4\u5DE5\u4F5C\u5F00\u59CB\u540E\uFF0C\u53EF\u4EE5\u67E5\u770B\u9700\u6C42\u3001\u8FDB\u5C55\u4E0E\u9A8C\u8BC1\u7ED3\u679C\u3002"), data?.taskRelease?.total > 0 && /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-footnote" }, "\u6700\u8FD1\u6536\u5C3E \xB7 ", data.taskRelease.done, "/", data.taskRelease.total, " \u5B8C\u6210 \xB7 \u6D4B\u8BD5\u578B ", data.taskRelease.tested, " \xB7 \u6587\u5B57\u578B ", data.taskRelease.textOnly)), page === "state" && /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u5F53\u524D\u72B6\u6001"), /* @__PURE__ */ import_react19.default.createElement(Badge, null, fmt(context?.digestCount), " \u4E2A\u5DF2\u6D88\u5316\u533A\u95F4")), context?.status ? /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-prose tx-state-text" }, context.status) : /* @__PURE__ */ import_react19.default.createElement(Empty, { icon: "context", title: "\u72B6\u6001\u5C1A\u672A\u5F62\u6210" }, "\u5BF9\u8BDD\u63A8\u8FDB\u540E\uFF0C\u8FD9\u91CC\u4F1A\u66F4\u65B0\u8BA1\u5212\u3001\u8FDB\u5EA6\u548C\u7ED3\u8BBA\u3002"), context?.stateFailures > 0 && /* @__PURE__ */ import_react19.default.createElement(Alert, { error: true }, "\u72B6\u6001\u63D0\u70BC\u8FDE\u7EED\u5931\u8D25 ", context.stateFailures, " \u6B21\u3002")), /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u7EA6\u675F\u4E0E\u51B3\u5B9A"), /* @__PURE__ */ import_react19.default.createElement(Badge, null, context?.pins?.length || 0)), context?.pins?.length ? context.pins.map((pin, i) => /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-pin", key: i }, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "pin" }), /* @__PURE__ */ import_react19.default.createElement("span", null, pin))) : /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u7528\u6237\u786E\u5B9A\u7684\u7EA6\u675F\u548C\u51B3\u5B9A\u4F1A\u4FDD\u7559\u5728\u8FD9\u91CC\u3002")), context?.notes?.length > 0 && /* @__PURE__ */ import_react19.default.createElement(Fold, { title: "\u5DE5\u4F5C\u7B14\u8BB0", count: context.notes.length }, context.notes.map((note, i) => /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-note-line", key: i }, /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-prose" }, note.text), /* @__PURE__ */ import_react19.default.createElement("small", null, shortDate(note.at)))))), page === "memory" && /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u4EFB\u52A1\u8BB0\u5FC6\u6587\u6863"), context?.workdocVersion > 0 && /* @__PURE__ */ import_react19.default.createElement(Badge, null, "v", context.workdocVersion)), context?.workdoc ? /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-prose tx-document" }, context.workdoc) : /* @__PURE__ */ import_react19.default.createElement(Empty, { icon: "memory", title: "\u8FD8\u6CA1\u6709\u4EFB\u52A1\u8BB0\u5FC6" }, "\u627E\u5230\u4E0E\u5F53\u524D\u5DE5\u4F5C\u76F8\u5173\u7684\u8BB0\u5FC6\u540E\uFF0C\u4F1A\u5728\u8FD9\u91CC\u6C47\u96C6\u4E0E\u66F4\u65B0\u3002"), context?.supplementPending > 0 && /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u53E6\u6709 ", context.supplementPending, " \u6761\u8BB0\u5FC6\u7B49\u5F85\u8865\u5165\u3002")), context?.checkpoint && /* @__PURE__ */ import_react19.default.createElement(Fold, { title: "\u8F83\u65E9\u5DE5\u4F5C\u7684\u7EAA\u8981", subtitle: shortDate(context.checkpoint.at) }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-prose tx-document" }, context.checkpoint.text)), context?.probe && /* @__PURE__ */ import_react19.default.createElement(Fold, { title: "\u6700\u8FD1\u538B\u7F29\u68C0\u67E5", subtitle: context.probe.error ? "\u8C03\u7528\u5931\u8D25" : context.probe.ok ? "\u4E8B\u5B9E\u68C0\u67E5\u901A\u8FC7" : "\u53D1\u73B0\u9057\u6F0F\uFF0C\u5DF2\u8BB0\u5F55\u8865\u8BB0" }, /* @__PURE__ */ import_react19.default.createElement("p", null, context.probe.question), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-detail-grid" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u53C2\u8003\u7B54\u6848"), /* @__PURE__ */ import_react19.default.createElement("strong", null, context.probe.expected || "\u2014"), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5B9E\u9645\u56DE\u7B54"), /* @__PURE__ */ import_react19.default.createElement("strong", null, context.probe.got || "\u2014")), /* @__PURE__ */ import_react19.default.createElement(Alert, { error: true }, context.probe.error)), context?.probeNotes?.length > 0 && /* @__PURE__ */ import_react19.default.createElement(Fold, { title: "\u5F85\u5199\u5165\u7EAA\u8981\u7684\u8865\u8BB0", count: context.probeNotes.length }, context.probeNotes.map((line, i) => /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-note-line", key: i }, line))))));
}
var actionNames = { injections: "\u8BB0\u5FC6\u6CE8\u5165", recalls: "\u8BB0\u5FC6\u53EC\u56DE", rawRecalls: "\u539F\u6587\u56DE\u635E", digests: "\u8BB0\u5FC6\u6D88\u5316", digestErrors: "\u6D88\u5316\u5931\u8D25", digestDeferred: "\u5931\u8D25\u6279\u6B21\u6682\u5B58", curations: "\u8BB0\u5FC6\u6574\u7406", curationErrors: "\u6574\u7406\u5931\u8D25", workdocVersions: "\u6587\u6863\u66F4\u65B0", states: "\u72B6\u6001\u66F4\u65B0", stateErrors: "\u72B6\u6001\u5931\u8D25", surgeries: "\u4E0A\u4E0B\u6587\u6574\u7406", surgeryErrors: "\u538B\u7F29\u5931\u8D25", retrievalFallbacks: "\u68C0\u7D22\u56DE\u9000", injectionErrors: "\u8865\u6CE8\u5931\u8D25", probePassed: "\u4E8B\u5B9E\u68C0\u67E5\u901A\u8FC7", probeFailed: "\u4E8B\u5B9E\u5F85\u8865\u8BB0", probeErrors: "\u68C0\u67E5\u8C03\u7528\u5931\u8D25", staleVersions: "\u65E7\u5FEB\u7167\u6E05\u7406", digestFallbacks: "\u91C7\u7528\u6D88\u5316\u5E95\u7A3F" };
function MemoryPanel({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo();
  const [data, setData] = (0, import_react19.useState)({ items: [], projects: [], trace: [] }), [edit, setEdit] = (0, import_react19.useState)(null), [error, setError] = (0, import_react19.useState)(""), [notice, setNotice] = (0, import_react19.useState)(""), [busy, setBusy] = (0, import_react19.useState)(false);
  const [view, setView] = (0, import_react19.useState)("session"), [query, setQuery] = (0, import_react19.useState)(""), [scope, setScope] = (0, import_react19.useState)("all"), [project, setProject] = (0, import_react19.useState)("");
  const [filters, setFilters] = (0, import_react19.useState)(false), [history, setHistory] = (0, import_react19.useState)(false), [touched, setTouched] = (0, import_react19.useState)(false), [selecting, setSelecting] = (0, import_react19.useState)(false), [selected, setSelected] = (0, import_react19.useState)([]), [expanded, setExpanded] = (0, import_react19.useState)([]);
  const key = `${sessionId}:${view}`, current = (0, import_react19.useRef)(key);
  current.current = key;
  const load = (0, import_react19.useCallback)(async () => {
    try {
      const d = await api2("/memories" + suffix(sessionId) + "&view=" + view);
      if (current.current === key) {
        setData(d);
        setError("");
      }
    } catch (e) {
      if (current.current === key) setError(e.message);
    }
  }, [sessionId, view, key]);
  (0, import_react19.useEffect)(() => {
    setEdit(null);
    setSelected([]);
    setSelecting(false);
    setProject("");
  }, [sessionId]);
  (0, import_react19.useEffect)(() => {
    if (!tab.visible) return;
    let active2 = true, timer;
    const tick = async () => {
      await load();
      if (active2) timer = setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      active2 = false;
      clearTimeout(timer);
    };
  }, [load, tab.visible]);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api2("/memories" + suffix(sessionId), { ...edit, key: edit.key.trim() || edit.text.trim().replace(/\s+/g, " ").slice(0, 40), op: edit.id ? "update" : "add", target: edit.id || "", project: edit.project || data.scope.project });
      setEdit(null);
      await load();
      setNotice("\u8BB0\u5FC6\u5DF2\u4FDD\u5B58");
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };
  const change = async (op, ids) => {
    setBusy(true);
    try {
      for (const id of ids) await api2("/memories" + suffix(sessionId), { op, target: id, text: "\u7528\u6237\u5728\u8BB0\u5FC6\u9762\u677F\u79FB\u5165\u5386\u53F2" });
      setSelected([]);
      await load();
      setNotice(op === "restore" ? "\u5DF2\u6062\u590D\u6240\u9009\u8BB0\u5FC6" : op === "delete" ? "\u5DF2\u6C38\u4E45\u5220\u9664\u6240\u9009\u7248\u672C" : "\u5DF2\u79FB\u5165\u5386\u53F2\uFF0C\u53EF\u968F\u65F6\u6062\u590D");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const curate = async () => {
    setBusy(true);
    try {
      const r = await api2("/curate" + suffix(sessionId), {});
      setNotice(r.queued ? "\u6574\u7406\u5DF2\u5B89\u6392\uFF0C\u7ED3\u679C\u4F1A\u81EA\u52A8\u66F4\u65B0" : "\u5F53\u524D\u6CA1\u6709\u5F85\u6574\u7406\u7684\u8BB0\u5FC6");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const visible = data.items.filter((m) => (history || !m.retired && !m.supersededBy) && (!touched || m.touched) && (scope === "all" || m.scope === scope) && (!project || m.project === project) && (!query || [m.text, m.key, m.project].join(" ").toLowerCase().includes(query.toLowerCase())));
  const active = data.items.filter((m) => !m.retired && !m.supersededBy), filterCount = Number(history) + Number(touched) + Number(scope !== "all") + Number(Boolean(project));
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-app" }, /* @__PURE__ */ import_react19.default.createElement(Header, { icon: "memory", title: "\u8BB0\u5FC6", subtitle: "\u4FDD\u7559\u503C\u5F97\u5E26\u5230\u4E0B\u4E00\u6B21\u5DE5\u4F5C\u7684\u5185\u5BB9", actions: /* @__PURE__ */ import_react19.default.createElement(Action, { primary: true, icon: "plus", disabled: !data.scope, onClick: () => {
    setError("");
    setEdit({ scope: "project", project: data.scope.project, key: "", text: "" });
  } }, "\u65B0\u589E") }), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-memory-tools" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-search" }, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "search" }), /* @__PURE__ */ import_react19.default.createElement("input", { "aria-label": "\u641C\u7D22\u8BB0\u5FC6", placeholder: "\u641C\u7D22\u8BB0\u5FC6\u2026", value: query, onChange: (e) => setQuery(e.target.value) }), query && /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, icon: "close", "aria-label": "\u6E05\u9664\u641C\u7D22", onClick: () => setQuery("") })), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-row-between" }, /* @__PURE__ */ import_react19.default.createElement(Segments, { label: "\u8BB0\u5FC6\u67E5\u770B\u8303\u56F4", value: view, onChange: (v) => {
    setView(v);
    setSelected([]);
    setProject("");
  }, items: [["session", "\u5F53\u524D\u8303\u56F4"], ["all", "\u6574\u4E2A\u8BB0\u5FC6\u5E93"]] }), /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, icon: "filter", "aria-expanded": filters, onClick: () => setFilters(!filters) }, "\u7B5B\u9009", filterCount ? ` ${filterCount}` : "")), filters && /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-filter-box" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-form-grid" }, /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5C42\u7EA7"), /* @__PURE__ */ import_react19.default.createElement("select", { value: scope, onChange: (e) => setScope(e.target.value) }, /* @__PURE__ */ import_react19.default.createElement("option", { value: "all" }, "\u5168\u90E8\u5C42\u7EA7"), Object.entries(scopeName).map(([id, label]) => /* @__PURE__ */ import_react19.default.createElement("option", { key: id, value: id }, label)))), view === "all" && /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u6240\u5C5E\u9879\u76EE"), /* @__PURE__ */ import_react19.default.createElement("select", { value: project, onChange: (e) => setProject(e.target.value) }, /* @__PURE__ */ import_react19.default.createElement("option", { value: "" }, "\u5168\u90E8\u9879\u76EE"), data.projects.map((p) => /* @__PURE__ */ import_react19.default.createElement("option", { key: p, value: p }, projectLabel(p)))))), /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-check" }, /* @__PURE__ */ import_react19.default.createElement("input", { type: "checkbox", checked: history, onChange: (e) => setHistory(e.target.checked) }), "\u5305\u542B\u5386\u53F2\u7248\u672C"), /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-check" }, /* @__PURE__ */ import_react19.default.createElement("input", { type: "checkbox", checked: touched, onChange: (e) => setTouched(e.target.checked) }), "\u4EC5\u672C\u4F1A\u8BDD\u4F7F\u7528\u8FC7")), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-list-toolbar" }, /* @__PURE__ */ import_react19.default.createElement("span", null, query || filterCount ? `${visible.length} \u6761\u5339\u914D` : `${active.length} \u6761\u6709\u6548\u8BB0\u5FC6`), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-actions" }, /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, onClick: () => {
    setSelecting(!selecting);
    setSelected([]);
  } }, selecting ? "\u53D6\u6D88\u9009\u62E9" : "\u9009\u62E9"), /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, icon: "refresh", "aria-label": "\u5237\u65B0\u8BB0\u5FC6", onClick: load }), /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, disabled: !sessionId || data.scope?.mode === "session" || busy, onClick: curate }, "\u6574\u7406")))), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-body tx-memory-body" }, /* @__PURE__ */ import_react19.default.createElement(Alert, { error: true }, error), /* @__PURE__ */ import_react19.default.createElement(Alert, null, notice), !visible.length && /* @__PURE__ */ import_react19.default.createElement(Empty, { icon: "memory", title: query || filterCount ? "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u8BB0\u5FC6" : "\u4ECE\u4E00\u6761\u503C\u5F97\u8BB0\u4F4F\u7684\u4E8B\u5F00\u59CB" }, query || filterCount ? "\u8BD5\u8BD5\u5176\u4ED6\u5173\u952E\u8BCD\uFF0C\u6216\u8C03\u6574\u7B5B\u9009\u6761\u4EF6\u3002" : "\u5DE5\u4F5C\u4E2D\u5F62\u6210\u7684\u7A33\u5B9A\u4E8B\u5B9E\u4F1A\u9010\u6E10\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u4E5F\u53EF\u4EE5\u624B\u52A8\u6DFB\u52A0\u3002"), visible.map((m) => {
    const archived = m.retired || m.supersededBy, open = expanded.includes(m.id);
    return /* @__PURE__ */ import_react19.default.createElement("article", { className: cx("tx-memory-item", archived && "tx-archived", selected.includes(m.id) && "tx-selected-item"), key: m.id }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-memory-meta" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-actions" }, selecting && /* @__PURE__ */ import_react19.default.createElement("input", { type: "checkbox", "aria-label": "\u9009\u62E9 " + m.key, checked: selected.includes(m.id), onChange: (e) => setSelected(e.target.checked ? [...selected, m.id] : selected.filter((id) => id !== m.id)) }), /* @__PURE__ */ import_react19.default.createElement(Badge, { tone: archived ? void 0 : "soft" }, m.project?.startsWith("session:") ? "\u4F1A\u8BDD" : scopeName[m.scope]), /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-memory-key", title: m.key }, m.key)), archived && /* @__PURE__ */ import_react19.default.createElement(Badge, null, m.retired ? "\u5DF2\u9000\u5F79" : "\u65E7\u7248\u672C")), /* @__PURE__ */ import_react19.default.createElement("p", { className: cx("tx-memory-text", m.text.length > 240 && !open && "tx-clamped") }, m.text), m.text.length > 240 && /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", className: "tx-text-button", onClick: () => setExpanded(open ? expanded.filter((id) => id !== m.id) : [...expanded, m.id]) }, open ? "\u6536\u8D77" : "\u5C55\u5F00\u5168\u6587"), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-memory-bottom" }, /* @__PURE__ */ import_react19.default.createElement("span", null, m.source === "user" ? "\u624B\u52A8\u8BB0\u5F55" : m.source === "curate" ? "\u6574\u7406\u66F4\u65B0" : "\u81EA\u52A8\u8BB0\u5FC6", " \xB7 ", shortDate(m.at)), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-actions" }, !archived ? /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, "aria-label": "\u7F16\u8F91 " + m.key, icon: "edit", onClick: () => {
      setError("");
      setEdit(m);
    } }), /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, disabled: busy, onClick: () => change("retire", [m.id]) }, "\u79FB\u5165\u5386\u53F2")) : /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, disabled: busy, onClick: () => change("restore", [m.id]) }, "\u6062\u590D"))), /* @__PURE__ */ import_react19.default.createElement("details", { className: "tx-memory-details" }, /* @__PURE__ */ import_react19.default.createElement("summary", null, "\u4F7F\u7528\u4E0E\u7248\u672C"), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-detail-grid" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u6CE8\u5165 / \u53EC\u56DE"), /* @__PURE__ */ import_react19.default.createElement("strong", null, m.usage?.injected || 0, " / ", m.usage?.recalled || 0), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5F53\u524D\u8303\u56F4\u53EF\u89C1"), /* @__PURE__ */ import_react19.default.createElement("strong", null, m.visible ? "\u662F" : "\u5426")), m.project && /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-path tx-help" }, projectLabel(m.project)), m.previous && /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u5305\u542B\u4E0A\u4E00\u7248\u672C\u8BB0\u5F55\uFF0C\u53EF\u5728\u5386\u53F2\u7248\u672C\u4E2D\u67E5\u770B\u3002"), archived && /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, className: "tx-danger", disabled: busy, onClick: () => change("delete", [m.id]) }, "\u6C38\u4E45\u5220\u9664\u6B64\u7248\u672C")));
  }), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-memory-footer" }, /* @__PURE__ */ import_react19.default.createElement(Fold, { title: "\u8BB0\u5FC6\u5E93\u8BE6\u60C5", subtitle: "\u4F7F\u7528\u60C5\u51B5\u4E0E\u5206\u7247\u6574\u7406\u8BB0\u5F55" }, data.health && /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-detail-grid" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u6709\u6548 / \u5DF2\u9000\u5F79"), /* @__PURE__ */ import_react19.default.createElement("strong", null, data.health.active, " / ", data.health.retired), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5386\u53F2\u7248\u672C"), /* @__PURE__ */ import_react19.default.createElement("strong", null, data.health.versions), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5C1A\u672A\u4F7F\u7528"), /* @__PURE__ */ import_react19.default.createElement("strong", null, data.health.unused), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5F53\u524D\u53EF\u89C1\u5B57\u7B26"), /* @__PURE__ */ import_react19.default.createElement("strong", null, fmt(data.health.chars)), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u8DE8\u9879\u76EE\u5019\u9009\u7EC4"), /* @__PURE__ */ import_react19.default.createElement("strong", null, data.health.promotionGroups)), Object.entries(data.health.shards.lastAt).map(([shard, at]) => /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-shard", key: shard }, /* @__PURE__ */ import_react19.default.createElement("strong", null, shard.startsWith("project:") ? projectLabel(shard.slice(8)) : scopeName[shard]), /* @__PURE__ */ import_react19.default.createElement("span", null, shortDate(at), " \xB7 \u6E38\u6807 ", data.health.shards.cursors[shard] || 0))))), /* @__PURE__ */ import_react19.default.createElement(Fold, { title: "\u672C\u4F1A\u8BDD\u7684\u8BB0\u5FC6\u6D3B\u52A8", count: data.trace.length }, data.trace.slice().reverse().map((e, i) => /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-trace-row", key: i }, /* @__PURE__ */ import_react19.default.createElement("div", null, /* @__PURE__ */ import_react19.default.createElement("strong", null, actionNames[e.name] || e.name), /* @__PURE__ */ import_react19.default.createElement("span", null, shortDate(e.at), e.items != null ? ` \xB7 ${e.items} \u6761` : "")), e.query && /* @__PURE__ */ import_react19.default.createElement("p", null, e.query), e.error && /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-error" }, e.error)))))), selecting && selected.length > 0 && /* @__PURE__ */ import_react19.default.createElement("footer", { className: "tx-batchbar" }, /* @__PURE__ */ import_react19.default.createElement("strong", null, "\u5DF2\u9009 ", selected.length, " \u6761"), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-actions" }, /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, disabled: busy, onClick: () => change("restore", selected) }, "\u6062\u590D"), /* @__PURE__ */ import_react19.default.createElement(Action, { disabled: busy, onClick: () => change("retire", selected) }, "\u79FB\u5165\u5386\u53F2"))), edit && /* @__PURE__ */ import_react19.default.createElement("form", { className: "tx-editor", onSubmit: save }, /* @__PURE__ */ import_react19.default.createElement(Header, { icon: "memory", title: edit.id ? "\u7F16\u8F91\u8BB0\u5FC6" : "\u65B0\u589E\u8BB0\u5FC6", subtitle: "\u8BB0\u5F55\u6E05\u695A\u3001\u7A33\u5B9A\u3001\u53EF\u590D\u7528\u7684\u4E8B\u5B9E", actions: /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, icon: "close", "aria-label": "\u5173\u95ED\u8BB0\u5FC6\u7F16\u8F91", disabled: busy, onClick: () => setEdit(null) }) }), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-body" }, /* @__PURE__ */ import_react19.default.createElement(Alert, { error: true }, error), /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u8BB0\u5FC6\u5185\u5BB9"), /* @__PURE__ */ import_react19.default.createElement("textarea", { rows: "8", required: true, autoFocus: true, placeholder: "\u9700\u8981\u8BB0\u4F4F\u4EC0\u4E48\uFF1F", value: edit.text, onChange: (e) => setEdit({ ...edit, text: e.target.value }) })), /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u8BB0\u5FC6\u8303\u56F4"), /* @__PURE__ */ import_react19.default.createElement("select", { value: edit.scope, onChange: (e) => setEdit({ ...edit, scope: e.target.value }) }, Object.entries(scopeName).map(([id, label]) => /* @__PURE__ */ import_react19.default.createElement("option", { key: id, value: id }, label)))), /* @__PURE__ */ import_react19.default.createElement(Fold, { title: "\u66F4\u591A\u5C5E\u6027", subtitle: "\u540D\u79F0\u4E0E\u6240\u5C5E\u9879\u76EE" }, /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u540D\u79F0\uFF08\u53EF\u9009\uFF09"), /* @__PURE__ */ import_react19.default.createElement("input", { value: edit.key, placeholder: "\u9ED8\u8BA4\u4F7F\u7528\u5185\u5BB9\u5F00\u5934", onChange: (e) => setEdit({ ...edit, key: e.target.value }) })), edit.scope === "project" && (edit.project?.startsWith("session:") ? /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u6240\u5C5E\uFF1A", projectLabel(edit.project)) : /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u6240\u5C5E\u9879\u76EE"), /* @__PURE__ */ import_react19.default.createElement("input", { required: true, value: edit.project || "", onChange: (e) => setEdit({ ...edit, project: e.target.value }) }))))), /* @__PURE__ */ import_react19.default.createElement("footer", { className: "tx-savebar" }, /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-muted" }, "\u4FDD\u5B58\u540E\u5373\u53EF\u7528\u4E8E\u540E\u7EED\u5DE5\u4F5C"), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-actions" }, /* @__PURE__ */ import_react19.default.createElement(Action, { quiet: true, disabled: busy, onClick: () => setEdit(null) }, "\u53D6\u6D88"), /* @__PURE__ */ import_react19.default.createElement(Action, { primary: true, type: "submit", disabled: busy, icon: "check" }, busy ? "\u4FDD\u5B58\u4E2D" : "\u4FDD\u5B58\u8BB0\u5FC6")))));
}
var frameKind = (kind) => kind === "checkpoint" ? "\u7EAA\u8981" : kind.includes("state") ? "\u72B6\u6001" : kind.includes("memory") ? "\u8BB0\u5FC6" : kind.includes("task") || kind.includes("todo") ? "\u4EFB\u52A1" : kind === "model" ? "\u6A21\u578B" : kind === "user" ? "\u7528\u6237" : kind === "tool" || kind.includes("tool") ? "\u5DE5\u5177" : "\u7CFB\u7EDF";
var frameColor = (kind) => ({ \u7EAA\u8981: "#3476e6", \u72B6\u6001: "#759be4", \u8BB0\u5FC6: "#82bfe4", \u4EFB\u52A1: "#8490bf", \u6A21\u578B: "#476fad", \u7528\u6237: "#a0bcdf", \u5DE5\u5177: "#669aaf", \u7CFB\u7EDF: "#a2aaba" })[frameKind(kind)];
var callId = (call) => `${call.sessionId}:${call.kind}:${call.at}`;
function FrameBar({ nodes = [] }) {
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-frame-bar" }, nodes.map((n) => /* @__PURE__ */ import_react19.default.createElement("i", { key: n.seq, style: { flex: n.tokens || 0, background: frameColor(n.kind) }, title: `#${n.seq} ${frameKind(n.kind)} \xB7 \u7EA6 ${fmt(n.tokens)} tokens` })));
}
function FrameLegend() {
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-legend" }, ["checkpoint", "state", "memory", "tasks", "model", "user", "tool", "system"].map((kind) => /* @__PURE__ */ import_react19.default.createElement("span", { key: kind }, /* @__PURE__ */ import_react19.default.createElement("i", { style: { background: frameColor(kind) } }), frameKind(kind))));
}
function ContextHistory({ data }) {
  const frames = data.contextHistory || [], [selected, setSelected] = (0, import_react19.useState)(null);
  const selectedFrame = frames.find((f) => f.at === selected) || frames.at(-1), rows = contextHistoryLayout(frames);
  if (!frames.length) return /* @__PURE__ */ import_react19.default.createElement(Empty, { icon: "layers", title: "\u7B49\u5F85\u4E0B\u4E00\u6B21\u8BF7\u6C42" }, "\u8BF7\u6C42\u53D1\u51FA\u540E\uFF0C\u53EF\u4EE5\u5728\u8FD9\u91CC\u67E5\u770B\u4E0A\u4E0B\u6587\u4E0E\u7F13\u5B58\u7684\u53D8\u5316\u3002");
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-context-history" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u4E0A\u4E0B\u6587\u6F14\u53D8"), /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-muted" }, "\u6700\u8FD1 ", frames.length, " \u6B21\u8BF7\u6C42")), /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, "\u8272\u5757\u6309\u8BB0\u5F55\u4F30\u7B97\uFF0C\u6240\u6709\u884C\u5171\u7528\u523B\u5EA6\u3002\u4E0B\u65B9\u7EC6\u8F68\u4E3A\u5B9E\u9645\u8F93\u5165\uFF0C\u84DD\u8272\u90E8\u5206\u4E3A\u7F13\u5B58\u8BFB\u53D6\u91CF\u3002"), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-history-chart" }, rows.map(({ frame, tokens, width, inputWidth, cacheWidth }, i) => /* @__PURE__ */ import_react19.default.createElement("button", { key: frame.at + ":" + i, type: "button", className: cx("tx-history-row", selectedFrame === frame && "tx-selected"), onClick: () => setSelected(frame.at), title: `\u7B2C ${frame.turn} \u56DE\u5408 \xB7 \u7B2C ${frame.step} \u6B65 \xB7 \u8BB0\u5F55\u4F30\u7B97 ${fmt(tokens)} tokens` }, /* @__PURE__ */ import_react19.default.createElement("span", null, frame.turn, ".", frame.step), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-history-scale" }, /* @__PURE__ */ import_react19.default.createElement("div", { style: { width: `${width}%` } }, /* @__PURE__ */ import_react19.default.createElement(FrameBar, { nodes: frame.nodes })), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-history-usage" }, /* @__PURE__ */ import_react19.default.createElement("i", { style: { width: `${inputWidth}%` } }), /* @__PURE__ */ import_react19.default.createElement("b", { style: { width: `${cacheWidth}%` } }))), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u2248", compactNumber(tokens))))), /* @__PURE__ */ import_react19.default.createElement(FrameLegend, null), selectedFrame && /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-selected-frame" }, /* @__PURE__ */ import_react19.default.createElement(Badge, null, "\u7B2C ", selectedFrame.turn, " \u56DE\u5408 \xB7 \u7B2C ", selectedFrame.step, " \u6B65"), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-detail-grid" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u8BB0\u5F55\u4F30\u7B97 Token"), /* @__PURE__ */ import_react19.default.createElement("strong", null, "\u2248", fmt(frameTokens(selectedFrame.nodes))), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5B9E\u9645\u8F93\u5165 Token"), /* @__PURE__ */ import_react19.default.createElement("strong", null, selectedFrame.inputTokens === void 0 ? "\u672A\u8BB0\u5F55" : fmt(selectedFrame.inputTokens)), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u7F13\u5B58\u8BFB\u53D6 Token"), /* @__PURE__ */ import_react19.default.createElement("strong", null, fmt(selectedFrame.cacheReadTokens)))));
}
function Timeline({ calls, onSelect }) {
  const ordered = calls.slice().reverse();
  if (!ordered.length) return /* @__PURE__ */ import_react19.default.createElement(Empty, { icon: "monitor", title: "\u7B49\u5F85\u7B2C\u4E00\u6B21\u6267\u884C" }, "\u5F00\u59CB\u5BF9\u8BDD\u540E\uFF0C\u5404\u7EC4\u4EF6\u7684\u8C03\u7528\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002");
  return /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u8C03\u7528\u8F68\u8FF9"), /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-muted" }, "\u4ECE\u5DE6\u5230\u53F3 \xB7 \u70B9\u51FB\u67E5\u770B")), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-timeline" }, Object.entries(kindName).filter(([kind]) => ordered.some((c) => c.kind === kind)).map(([kind, label]) => /* @__PURE__ */ import_react19.default.createElement("div", { key: kind, className: "tx-timeline-row" }, /* @__PURE__ */ import_react19.default.createElement("span", null, label), /* @__PURE__ */ import_react19.default.createElement("div", null, ordered.map((call, i) => call.kind === kind ? /* @__PURE__ */ import_react19.default.createElement("button", { key: i, type: "button", className: call.error ? "tx-call-error" : "tx-call", onClick: () => onSelect(call), "aria-label": `${label} \xB7 ${shortDate(call.at)} \xB7 ${duration(call.durationMs)}`, title: `${label} \xB7 ${call.turn ?? "\u2014"}.${call.step ?? "\u2014"} \xB7 ${duration(call.durationMs)}${call.error ? " \xB7 " + call.error : ""}` }) : /* @__PURE__ */ import_react19.default.createElement("i", { key: i })))))), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-legend" }, /* @__PURE__ */ import_react19.default.createElement("span", null, /* @__PURE__ */ import_react19.default.createElement("i", { style: { background: "var(--tx-blue)" } }), "\u5B8C\u6210\u8C03\u7528"), /* @__PURE__ */ import_react19.default.createElement("span", null, /* @__PURE__ */ import_react19.default.createElement("i", { style: { background: "var(--tx-danger)" } }), "\u8C03\u7528\u5931\u8D25")));
}
function Monitor({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo(), [range, setRange] = (0, import_react19.useState)("session"), [page, setPage] = (0, import_react19.useState)("overview"), [stage, setStage] = (0, import_react19.useState)("all"), [failures, setFailures] = (0, import_react19.useState)(false), [selected, setSelected] = (0, import_react19.useState)(null);
  const { data, error } = useSnapshot(sessionId, tab.visible, range), actions = data?.actions || {}, live = data?.liveCalls || [], metrics = data?.metrics || {};
  const totals = Object.values(metrics).reduce((out, m) => ({ calls: out.calls + (m.calls || 0), errors: out.errors + (m.errors || 0), input: out.input + inputTokens(m), output: out.output + (m.outputTokens || 0), cache: out.cache + (m.cacheReadTokens || 0), ms: out.ms + (m.durationMs || 0) }), { calls: 0, errors: 0, input: 0, output: 0, cache: 0, ms: 0 });
  const activity = (data?.activity || []).filter((a) => (stage === "all" || a.kind === stage) && (!failures || a.error));
  const choose = (call) => {
    setPage("calls");
    setStage("all");
    setFailures(false);
    setSelected(callId(call));
  };
  const running = data?.running && data.running !== "idle";
  return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-app" }, /* @__PURE__ */ import_react19.default.createElement(Header, { icon: "monitor", title: "\u6267\u884C\u76D1\u63A7", subtitle: "\u770B\u6E05\u6BCF\u6B21\u8C03\u7528\u4E0E\u4E0A\u4E0B\u6587\u53D8\u5316" }), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-monitor-top" }, /* @__PURE__ */ import_react19.default.createElement(Segments, { label: "\u76D1\u63A7\u7EDF\u8BA1\u8303\u56F4", value: range, onChange: setRange, items: [["session", "\u5F53\u524D\u4F1A\u8BDD"], ["all", "\u5168\u90E8\u4F1A\u8BDD"]] }), /* @__PURE__ */ import_react19.default.createElement("div", { className: cx("tx-running-label", (running || live.length > 0) && "is-running") }, /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-status-dot" }), running ? "\u6267\u884C\u4E2D" : live.length ? "\u540E\u53F0\u8FD0\u884C\u4E2D" : "\u7A7A\u95F2")), /* @__PURE__ */ import_react19.default.createElement(Tabs, { label: "\u76D1\u63A7\u5206\u7C7B", value: page, onChange: setPage, items: [["overview", "\u6982\u89C8"], ["calls", "\u8C03\u7528\u8BB0\u5F55"], ["context", "\u4E0A\u4E0B\u6587"]] }), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-body" }, /* @__PURE__ */ import_react19.default.createElement(Alert, { error: true }, error), page === "overview" && /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-stats-grid" }, [["\u603B\u7528\u91CF", compactNumber(totals.input + totals.output), "tokens"], ["\u7F13\u5B58\u547D\u4E2D", totals.input ? (totals.cache / totals.input * 100).toFixed(1) + "%" : "\u2014", "\u8F93\u5165\u7F13\u5B58"], ["\u6A21\u578B\u8C03\u7528", fmt(totals.calls), `${totals.errors} \u6B21\u5931\u8D25`], ["\u7D2F\u8BA1\u7528\u65F6", duration(totals.ms), "\u5404\u7EC4\u4EF6\u5408\u8BA1"]].map(([label, value, hint]) => /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-stat", key: label }, /* @__PURE__ */ import_react19.default.createElement("span", null, label), /* @__PURE__ */ import_react19.default.createElement("strong", null, value), /* @__PURE__ */ import_react19.default.createElement("small", null, hint)))), live.length > 0 && /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-live-list" }, live.map((call, i) => /* @__PURE__ */ import_react19.default.createElement("div", { key: i }, /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-pulse" }), /* @__PURE__ */ import_react19.default.createElement("div", null, /* @__PURE__ */ import_react19.default.createElement("strong", null, kindName[call.kind] || call.kind), /* @__PURE__ */ import_react19.default.createElement("small", null, call.model)), /* @__PURE__ */ import_react19.default.createElement("span", null, duration(Date.now() - call.startedAt))))), /* @__PURE__ */ import_react19.default.createElement(Timeline, { calls: data?.activity || [], onSelect: choose }), Object.keys(metrics).length > 0 && /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u7EC4\u4EF6\u7528\u91CF"), /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-muted" }, "\u8C03\u7528 / Token")), Object.entries(kindName).filter(([kind]) => metrics[kind]?.calls).map(([kind, label]) => {
    const m = metrics[kind], last = data?.activity?.find((a) => a.kind === kind), total = inputTokens(m) + (m.outputTokens || 0);
    return /* @__PURE__ */ import_react19.default.createElement("details", { className: "tx-component", key: kind }, /* @__PURE__ */ import_react19.default.createElement("summary", null, /* @__PURE__ */ import_react19.default.createElement("span", null, /* @__PURE__ */ import_react19.default.createElement("i", { className: cx("tx-component-dot", m.errors > 0 && "has-error") }), label), /* @__PURE__ */ import_react19.default.createElement("span", null, /* @__PURE__ */ import_react19.default.createElement("strong", null, fmt(m.calls)), /* @__PURE__ */ import_react19.default.createElement("small", null, compactNumber(total), " tok"), /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "chevron", size: 13 }))), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-component-details" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-detail-grid" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u8F93\u5165 / \u8F93\u51FA"), /* @__PURE__ */ import_react19.default.createElement("strong", null, fmt(inputTokens(m)), " / ", fmt(m.outputTokens)), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u7F13\u5B58\u547D\u4E2D"), /* @__PURE__ */ import_react19.default.createElement("strong", null, inputTokens(m) ? ((m.cacheReadTokens || 0) / inputTokens(m) * 100).toFixed(1) + "%" : "\u2014"), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u63A8\u7406 Token"), /* @__PURE__ */ import_react19.default.createElement("strong", null, m.reasoningTokens == null ? "\u2014" : fmt(m.reasoningTokens)), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5CF0\u503C\u8F93\u5165 / \u7D2F\u8BA1\u7528\u65F6"), /* @__PURE__ */ import_react19.default.createElement("strong", null, compactNumber(m.peakContext), " / ", duration(m.durationMs)), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5931\u8D25"), /* @__PURE__ */ import_react19.default.createElement("strong", null, fmt(m.errors))), last && /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help tx-path" }, last.provider, " / ", last.model), m.unmetered > 0 && /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help" }, m.unmetered, " \u6B21\u8C03\u7528\u672A\u8FD4\u56DE\u7528\u91CF")));
  })), /* @__PURE__ */ import_react19.default.createElement(Fold, { title: "\u8BB0\u5FC6\u4E0E\u538B\u7F29\u7EDF\u8BA1", subtitle: "\u540E\u53F0\u6D41\u7A0B\u7684\u7D2F\u8BA1\u6267\u884C\u7ED3\u679C" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-detail-grid" }, [["\u8BB0\u5FC6\u6D88\u5316 / \u5931\u8D25", `${fmt(actions.digests)} / ${fmt(actions.digestErrors)}`], ["\u8BB0\u5FC6\u6574\u7406 / \u5931\u8D25", `${fmt(actions.curations)} / ${fmt(actions.curationErrors)}`], ["\u6CE8\u5165 / \u6587\u6863\u66F4\u65B0", `${fmt(actions.injections)} / ${fmt(actions.workdocVersions)}`], ["\u72B6\u6001\u63D0\u70BC / \u5931\u8D25", `${fmt(actions.states)} / ${fmt(actions.stateErrors)}`], ["\u53EC\u56DE / \u547D\u4E2D\u6761\u6570", `${fmt(actions.recalls)} / ${fmt(actions.recallHits)}`], ["\u68C0\u7D22\u56DE\u9000", fmt(actions.retrievalFallbacks)], ["\u538B\u7F29 / \u5931\u8D25", `${fmt(actions.surgeries)} / ${fmt(actions.surgeryErrors)}`], ["\u4E8B\u5B9E\u68C0\u67E5\uFF1A\u901A\u8FC7 / \u9057\u6F0F", `${fmt(actions.probePassed)} / ${fmt(actions.probeFailed)}`], ["\u68C0\u67E5\u8C03\u7528\u5931\u8D25", fmt(actions.probeErrors)], ["\u539F\u6587\u56DE\u635E / \u65E7\u5FEB\u7167\u6E05\u7406", `${fmt(actions.rawRecalls)} / ${fmt(actions.staleVersions)}`], ["\u538B\u7F29\u540E\u5B57\u7B26\u5360\u6BD4", actions.compactInputChars ? (actions.compactOutputChars / actions.compactInputChars * 100).toFixed(1) + "%" : "\u2014"]].map(([label, value]) => /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, { key: label }, /* @__PURE__ */ import_react19.default.createElement("span", null, label), /* @__PURE__ */ import_react19.default.createElement("strong", null, value)))))), page === "calls" && /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-call-filters" }, /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-field" }, /* @__PURE__ */ import_react19.default.createElement("select", { "aria-label": "\u8C03\u7528\u7EC4\u4EF6", value: stage, onChange: (e) => setStage(e.target.value) }, /* @__PURE__ */ import_react19.default.createElement("option", { value: "all" }, "\u5168\u90E8\u7EC4\u4EF6"), Object.entries(kindName).map(([id, label]) => /* @__PURE__ */ import_react19.default.createElement("option", { key: id, value: id }, label)))), /* @__PURE__ */ import_react19.default.createElement("label", { className: "tx-check" }, /* @__PURE__ */ import_react19.default.createElement("input", { type: "checkbox", checked: failures, onChange: (e) => setFailures(e.target.checked) }), "\u4EC5\u5931\u8D25")), activity.length ? activity.map((call) => /* @__PURE__ */ import_react19.default.createElement("details", { key: callId(call), className: cx("tx-call-row", call.error && "tx-failed-call"), open: selected === callId(call) || void 0 }, /* @__PURE__ */ import_react19.default.createElement("summary", null, /* @__PURE__ */ import_react19.default.createElement("span", { className: "tx-call-icon" }, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: call.error ? "close" : "check", size: 14 })), /* @__PURE__ */ import_react19.default.createElement("div", null, /* @__PURE__ */ import_react19.default.createElement("strong", null, kindName[call.kind] || call.kind), /* @__PURE__ */ import_react19.default.createElement("small", null, shortDate(call.at), call.step != null ? ` \xB7 \u7B2C ${call.step} \u6B65` : "")), /* @__PURE__ */ import_react19.default.createElement("span", null, duration(call.durationMs)), /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "chevron", size: 13 })), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-call-detail" }, /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help tx-path" }, call.provider, " / ", call.model), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-detail-grid" }, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u8F93\u5165 / \u8F93\u51FA"), /* @__PURE__ */ import_react19.default.createElement("strong", null, fmt(inputTokens(call.usage)), " / ", fmt(call.usage?.outputTokens)), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u7F13\u5B58\u8BFB\u53D6"), /* @__PURE__ */ import_react19.default.createElement("strong", null, fmt(call.usage?.cacheReadTokens)), call.effort && /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, /* @__PURE__ */ import_react19.default.createElement("span", null, "\u63A8\u7406\u5F3A\u5EA6"), /* @__PURE__ */ import_react19.default.createElement("strong", null, call.effort))), /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-help tx-path" }, "\u4F1A\u8BDD ", call.sessionId), /* @__PURE__ */ import_react19.default.createElement(Alert, { error: true }, call.error)))) : /* @__PURE__ */ import_react19.default.createElement(Empty, { icon: "clock", title: "\u8FD9\u91CC\u8FD8\u6CA1\u6709\u8C03\u7528\u8BB0\u5F55" }, failures ? "\u5F53\u524D\u7B5B\u9009\u8303\u56F4\u5185\u6CA1\u6709\u5931\u8D25\u8C03\u7528\u3002" : "\u6A21\u578B\u8C03\u7528\u5B8C\u6210\u540E\uFF0C\u4F1A\u6309\u65F6\u95F4\u5217\u5728\u8FD9\u91CC\u3002"), /* @__PURE__ */ import_react19.default.createElement("p", { className: "tx-footnote" }, "\u5B8C\u6574\u6D88\u606F\u4E0E\u5DE5\u5177\u5F80\u8FD4\u53EF\u5728 DSH\u300C\u8F68\u8FF9\u300D\u4E2D\u67E5\u770B\u3002")), page === "context" && /* @__PURE__ */ import_react19.default.createElement(import_react19.default.Fragment, null, data?.meter ? /* @__PURE__ */ import_react19.default.createElement("section", { className: "tx-section" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-section-heading" }, /* @__PURE__ */ import_react19.default.createElement("h3", null, "\u5F53\u524D\u4F1A\u8BDD"), /* @__PURE__ */ import_react19.default.createElement(Badge, null, fmt(data.frame?.length), " \u6761\u8BB0\u5F55")), /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-context-number" }, compactNumber(data.meter.totalTokens), /* @__PURE__ */ import_react19.default.createElement("span", null, "tokens")), /* @__PURE__ */ import_react19.default.createElement(FrameBar, { nodes: (data.frame || []).map((n) => ({ ...n, kind: n.checkpoint ? "checkpoint" : n.kind })) }), /* @__PURE__ */ import_react19.default.createElement(FrameLegend, null), /* @__PURE__ */ import_react19.default.createElement("details", { className: "tx-subfold" }, /* @__PURE__ */ import_react19.default.createElement("summary", null, "\u67E5\u770B\u5404\u6761\u8BB0\u5F55"), data.frame?.map((n) => /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-frame-row", key: n.seq }, /* @__PURE__ */ import_react19.default.createElement("span", null, "#", n.seq, " \xB7 ", frameKind(n.checkpoint ? "checkpoint" : n.kind)), /* @__PURE__ */ import_react19.default.createElement("span", null, compactNumber(n.tokens), " tok"))))) : /* @__PURE__ */ import_react19.default.createElement(Empty, { icon: "layers", title: "\u5C1A\u65E0\u4E0A\u4E0B\u6587\u8BFB\u6570" }, "\u7EE7\u7EED\u4E00\u6B21\u5BF9\u8BDD\u540E\u5373\u53EF\u67E5\u770B\u3002"), data && /* @__PURE__ */ import_react19.default.createElement(ContextHistory, { data }))));
}
function StatsLine({ sessionId, onOpen }) {
  const { data } = useSnapshot(sessionId, Boolean(sessionId));
  if (!data?.metrics?.main?.calls) return null;
  const m = data.metrics.main, total = inputTokens(m);
  return /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", className: "tx-stats-line", "aria-label": "\u67E5\u770B\u8FD0\u884C\u7EDF\u8BA1", title: `\u4E0A\u4E0B\u6587 ${fmt(data.meter?.totalTokens)} tokens \xB7 \u7F13\u5B58\u547D\u4E2D ${total ? Math.round((m.cacheReadTokens || 0) / total * 100) : 0}% \xB7 \u5DF2\u6574\u7406 ${fmt(data.actions?.surgeries)} \u6B21`, onClick: onOpen }, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "layers", size: 12 }), /* @__PURE__ */ import_react19.default.createElement("span", null, compactNumber(data.meter?.totalTokens), " \u4E0A\u4E0B\u6587"), data.liveCalls?.length > 0 && /* @__PURE__ */ import_react19.default.createElement("i", { className: "tx-stats-running", "aria-label": "\u540E\u53F0\u8FD0\u884C\u4E2D" }));
}
var inject = ["slots", "sidebarRightTabs", "sidebarRight"];
function apply(ctx) {
  const openPanel = (section) => ctx.sidebarRight.openTab("trisoul-x-workbench", { params: { section } });
  const sections = [
    ["tasks", "\u4EFB\u52A1", "context", ContextPanel],
    ["memory", "\u8BB0\u5FC6", "memory", MemoryPanel],
    ["computer", "\u7535\u8111", "computer", ComputerPane],
    ["monitor", "\u76D1\u63A7", "monitor", Monitor]
  ];
  function Workbench({ initialSection = "tasks", ...props }) {
    const { tab } = props.useTabInfo();
    const section = sections.some(([id]) => id === tab.navigation?.params?.section) ? tab.navigation.params.section : initialSection;
    return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-workbench" }, /* @__PURE__ */ import_react19.default.createElement("nav", { className: "tx-workbench-nav", "aria-label": "\u5DE5\u4F5C\u53F0\u5BFC\u822A" }, sections.map(([id, label, icon]) => /* @__PURE__ */ import_react19.default.createElement("button", { key: id, type: "button", "aria-current": section === id ? "page" : void 0, onClick: () => tab.actions.openTab("trisoul-x-workbench", { params: { section: id }, replaceTab: tab.kind !== "trisoul-x-workbench" }) }, icon === "computer" ? /* @__PURE__ */ import_react19.default.createElement(ComputerIcon, { size: 15 }) : /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: icon, size: 15 }), /* @__PURE__ */ import_react19.default.createElement("span", null, label)))), sections.map(([id, , , Component]) => /* @__PURE__ */ import_react19.default.createElement("section", { key: id, className: "tx-workbench-page", hidden: section !== id, "aria-label": sections.find(([key]) => key === id)[1] }, /* @__PURE__ */ import_react19.default.createElement(Component, { ...props, useTabInfo: () => {
      const info = props.useTabInfo();
      return { ...info, tab: { ...info.tab, visible: info.tab.visible && section === id } };
    }, conversation: ctx.get("conversation") }))));
  }
  const { ComputerEntry } = applyComputerUseClient(ctx, { integrated: true, openPanel, renderPane: (props) => /* @__PURE__ */ import_react19.default.createElement(Workbench, { ...props, initialSection: "computer" }) });
  function ComposerDock(props) {
    const running = props.useSessions((s) => Boolean(s.byId[props.sessionId]?.running));
    const [usageOpen, setUsageOpen] = (0, import_react19.useState)(false);
    (0, import_react19.useEffect)(() => {
      setUsageOpen(false);
    }, [props.sessionId]);
    (0, import_react19.useEffect)(() => {
      document.documentElement.toggleAttribute("data-omd-usage-expanded", usageOpen);
      return () => document.documentElement.removeAttribute("data-omd-usage-expanded");
    }, [usageOpen]);
    (0, import_react19.useEffect)(() => {
      document.documentElement.toggleAttribute("data-omd-running", running);
      return () => document.documentElement.removeAttribute("data-omd-running");
    }, [running]);
    return /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-composer-dock" }, /* @__PURE__ */ import_react19.default.createElement("div", { className: "tx-composer-tools" }, /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", className: "tx-workbench-entry", "aria-label": "\u6253\u5F00\u5DE5\u4F5C\u53F0", onClick: () => openPanel("tasks") }, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "context", size: 15 }), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u5DE5\u4F5C\u53F0")), /* @__PURE__ */ import_react19.default.createElement(ComputerEntry, { ...props })), /* @__PURE__ */ import_react19.default.createElement("button", { type: "button", className: "tx-usage-toggle", "aria-label": "\u7528\u91CF\u8BE6\u60C5", "aria-expanded": usageOpen, onClick: () => setUsageOpen((value) => !value) }, /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "monitor", size: 14 }), /* @__PURE__ */ import_react19.default.createElement("span", null, "\u7528\u91CF"), /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "chevron", size: 12 })), /* @__PURE__ */ import_react19.default.createElement(StatsLine, { ...props, onOpen: () => openPanel("monitor") }));
  }
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "trisoul_x";
    tag.textContent = style_default + "\n" + shell_default + "\n" + whaleCss;
    document.head.appendChild(tag);
    document.documentElement.classList.add("trisoul-shell");
    let hostTitle = document.title, brandedTitle;
    const updateTitle = () => {
      const title = document.title;
      if (title === "DeepSeek Harness" || title.endsWith(" \u2014 DeepSeek Harness")) {
        hostTitle = title;
        brandedTitle = title.replace(/DeepSeek Harness$/, "Oh My DSH");
        document.title = brandedTitle;
      }
    };
    const titleObserver = new MutationObserver(updateTitle);
    titleObserver.observe(document.querySelector("title"), { childList: true, subtree: true, characterData: true });
    updateTitle();
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/svg+xml";
    icon.href = "data:image/svg+xml," + encodeURIComponent(whaleSvg("omd-favicon"));
    document.head.append(icon);
    return () => {
      titleObserver.disconnect();
      if (document.title === brandedTitle) document.title = hostTitle;
      icon.remove();
      tag.remove();
      document.documentElement.classList.remove("trisoul-shell");
    };
  });
  for (const [seat, Component] of [["sidebar.brand.mark", BrandMark], ["sidebar.brand.name", () => /* @__PURE__ */ import_react19.default.createElement("strong", { className: "tx-wordmark" }, "Oh My ", /* @__PURE__ */ import_react19.default.createElement("span", null, "DSH"))], ["conversation.hero.brand.mark", () => /* @__PURE__ */ import_react19.default.createElement(BrandMark, { size: 64 })]]) ctx.slots.inject(seat, () => ctx.slots.register({ name: seat }, Component));
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "trisoul-x", order: 16, label: () => "Oh My DSH" }, Settings));
  ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({ name: "conversation.composer.dock", id: "trisoul-x-tools", order: 25 }, ComposerDock));
  ctx.slots.inject("conversation.input.left", () => ctx.slots.register({ name: "conversation.input.left", id: "trisoul-memory-scope", order: 50 }, MemoryScopeChip));
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({ name: "conversation.input.right", id: "trisoul-better-todo", order: 100 }, BetterTodoChip));
  const workbenchId = "trisoul_x/trisoul-x-workbench";
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: workbenchId, kind: "trisoul-x-workbench", title: () => "\u5DE5\u4F5C\u53F0", guide: [{ order: 5, title: () => "\u5DE5\u4F5C\u53F0", description: () => "\u4EFB\u52A1\u3001\u8BB0\u5FC6\u3001\u7535\u8111\u4E0E\u8FD0\u884C\u76D1\u63A7", icon: (props) => /* @__PURE__ */ import_react19.default.createElement(Icon2, { name: "context", ...props }) }] }));
  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: workbenchId }, Workbench));
  for (const [kind, title, initialSection] of [
    ["trisoul-x-context", "\u5DE5\u4F5C\u4E0A\u4E0B\u6587", "tasks"],
    ["trisoul-x-memory", "\u8BB0\u5FC6", "memory"],
    ["trisoul-x-monitor", "\u6267\u884C\u76D1\u63A7", "monitor"]
  ]) {
    const id = `trisoul_x/${kind}`;
    ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind, title: () => title, guide: [] }));
    ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: id }, (props) => /* @__PURE__ */ import_react19.default.createElement(Workbench, { ...props, initialSection })));
  }
}
return module.exports;}});
