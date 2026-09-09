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
var import_react = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/style.css
var style_default = ".tx-panel { padding: 24px; color: var(--dsw-alias-text-primary); font-size: 14px; line-height: 1.65; overflow: auto; height: 100%; box-sizing: border-box; }\n.tx-settings { max-width: 850px; margin: 0 auto; }\n.tx-panel h2 { font-size: 21px; margin: 0 0 12px; font-weight: 600; }\n.tx-panel h3 { font-size: 14px; margin: 24px 0 10px; font-weight: 600; }\n.tx-heading, .tx-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }\n.tx-heading { margin-bottom: 24px; gap: 18px; }\n.tx-mark { font-family: Georgia, serif; font-style: italic; font-weight: 600; line-height: 1; color: var(--dsw-alias-text-primary); }\n.tx-muted, .tx-meta, .tx-activity small { color: var(--dsw-alias-text-secondary); font-size: 12px; }\n.tx-fieldset { margin: 18px 0; padding: 18px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 12px; }\n.tx-fieldset legend { padding: 0 6px; font-weight: 600; }\n.tx-panel label { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; flex: 1 1 200px; }\n.tx-panel input, .tx-panel select, .tx-panel textarea { background: transparent; border: 0.5px solid var(--dsw-alias-border-l3); color: inherit; border-radius: 7px; padding: 8px 10px; font: inherit; width: 100%; min-width: 0; box-sizing: border-box; }\n.tx-panel textarea { resize: vertical; }\n.tx-panel .tx-check { flex-direction: row; align-items: center; }\n.tx-check input { width: auto; }\n.tx-prose, .tx-note p { white-space: pre-wrap; overflow-wrap: anywhere; }\n.tx-note { border-bottom: 0.5px solid var(--dsw-alias-border-l3); padding: 14px 0; }\n.tx-note p { margin: 8px 0; }\n.tx-history { opacity: 0.55; }\n.tx-panel input.tx-select { width: 15px; flex: 0 0 15px; }\n.tx-path { overflow-wrap: anywhere; }\n.tx-scope-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-text-secondary); font-size: 12px; cursor: pointer; }\n.tx-scope-chip strong { font-weight: 500; color: var(--dsw-alias-text-primary); }\n.tx-scope-chip:hover { background: var(--dsw-alias-bg-layer-2); }\n.tx-footer { margin-top: 28px; }\n.tx-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 20px; }\n.tx-metric { border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 10px; padding: 16px; }\n.tx-metric h3 { margin: 0 0 10px; }\n.tx-metric strong { font-size: 24px; font-weight: 500; }\n.tx-metric small { font-size: 12px; font-weight: 400; }\n.tx-metric dl { display: grid; grid-template-columns: 1fr auto; gap: 7px; font-size: 12px; margin-bottom: 0; }\n.tx-metric dd { margin: 0; }\n.tx-activity { padding: 10px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l3); }\n.tx-error { color: var(--dsw-alias-text-danger, #b34848); overflow-wrap: anywhere; }\n@media (max-width: 600px) { .tx-panel { padding: 16px; } .tx-row { gap: 8px; } }\n\n.tx-frame { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 12px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }\n.tx-frame span:first-child { overflow-wrap: anywhere; }\n.tx-live { font-weight: 400; color: var(--dsw-alias-text-secondary); }\n.tx-panel summary { cursor: pointer; }\n\n.tx-evidence { margin: 12px 0 0; border-left: 2px solid var(--dsw-alias-border-l3); padding-left: 12px; }\n.tx-evidence pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }\n";

// src/client/index.jsx
var api = async (path, value) => {
  const response = await fetch(`/trisoul-x/api${path}`, value === void 0 ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
var suffix = (id) => `?${id ? `session=${encodeURIComponent(id)}` : ""}`;
var fmt = (n) => Number(n || 0).toLocaleString();
var kindName = { main: "\u4E3B\u6267\u884C", subagent: "\u5B50\u4EE3\u7406", background: "\u8BB0\u5FC6\u4E0E\u72B6\u6001", surgeon: "\u4E0A\u4E0B\u6587\u6574\u7406" };
var scopeName = { global: "\u5168\u5C40", cross: "\u8DE8\u9879\u76EE", project: "\u672C\u9879\u76EE" };
var projectLabel = (p) => p?.startsWith("session:") ? `\u4F1A\u8BDD ${p.slice(-8)}` : p;
function MemoryScopeChip({ sessionId, useSessions }) {
  const [state, setState] = (0, import_react.useState)(null), [open, setOpen] = (0, import_react.useState)(false), [error, setError] = (0, import_react.useState)("");
  const current = useSessions((s) => s.byId[sessionId]);
  const load = (0, import_react.useCallback)(async () => {
    try {
      setState(await api("/scope" + suffix(sessionId)));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [sessionId]);
  (0, import_react.useEffect)(() => {
    void load();
    setOpen(false);
  }, [load, current?.blank, current?.running]);
  const labels = { full: "\u5B8C\u5168\u7248", project: "\u9879\u76EE\u7EA7", session: "\u4F1A\u8BDD\u7EA7" };
  const pick = async (scope) => {
    setOpen(false);
    try {
      setState(await api("/scope" + suffix(sessionId), { scope }));
      setError("");
    } catch (e) {
      setError(e.message);
      await load();
    }
  };
  if (!state) return null;
  const locked = state.locked || current?.blank === false;
  const chip = /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "tx-scope-chip", title: error || (locked ? "\u672C\u4F1A\u8BDD\u5DF2\u7ED1\u5B9A\u8BB0\u5FC6\u8303\u56F4" : "\u9009\u62E9\u65B0\u4F1A\u8BDD\u7684\u8BB0\u5FC6\u8303\u56F4"), "aria-label": "\u8BB0\u5FC6\u8303\u56F4\uFF1A" + labels[state.scope], "aria-haspopup": locked ? void 0 : "menu", "aria-expanded": locked ? void 0 : open, onClick: () => {
    if (!locked) {
      void load();
      setOpen(!open);
    }
  } }, /* @__PURE__ */ import_react.default.createElement("span", null, "\u8BB0\u5FC6"), /* @__PURE__ */ import_react.default.createElement("strong", null, labels[state.scope]), !locked && /* @__PURE__ */ import_react.default.createElement("span", null, "\u25BE"));
  return locked ? chip : /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Menu, { open, anchor: chip, compact: true, portal: true, side: "top", selectedId: state.scope, items: Object.entries(labels).map(([id, label]) => ({ id, label })), onSelect: pick, onClose: () => setOpen(false) });
}
function useSnapshot(id, visible = true, range = "session") {
  const [data, setData] = (0, import_react.useState)(null), [error, setError] = (0, import_react.useState)("");
  const key = `${id}:${range}`, current = (0, import_react.useRef)(key);
  current.current = key;
  const reload = (0, import_react.useCallback)(async () => {
    try {
      const next = await api(`/state${suffix(id)}&range=${range}`);
      if (current.current === key) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (current.current === key) setError(e.message);
    }
  }, [id, range, key]);
  (0, import_react.useEffect)(() => {
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
function RouteFields({ label, route, directory, onChange }) {
  return /* @__PURE__ */ import_react.default.createElement("fieldset", { className: "tx-fieldset" }, /* @__PURE__ */ import_react.default.createElement("legend", null, label), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u7559\u7A7A\u65F6\u8DDF\u968F\u5F53\u524D\u5BF9\u8BDD\u7684\u4E3B\u6A21\u578B\u3002"), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement("label", null, "\u63D0\u4F9B\u65B9", /* @__PURE__ */ import_react.default.createElement("select", { value: route.provider, onChange: (e) => onChange({ ...route, provider: e.target.value, model: "" }) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "" }, "\u8DDF\u968F\u4E3B\u6A21\u578B"), directory.map((p) => /* @__PURE__ */ import_react.default.createElement("option", { key: p.id, value: p.id }, p.name || p.id)))), /* @__PURE__ */ import_react.default.createElement("label", null, "\u6A21\u578B", /* @__PURE__ */ import_react.default.createElement("input", { list: `tx-models-${label}`, value: route.model, placeholder: "\u8DDF\u968F\u4E3B\u6A21\u578B", onChange: (e) => onChange({ ...route, model: e.target.value }) }), /* @__PURE__ */ import_react.default.createElement("datalist", { id: `tx-models-${label}` }, (directory.find((p) => p.id === route.provider)?.models || []).map((m) => /* @__PURE__ */ import_react.default.createElement("option", { key: m.id, value: m.id }))))), /* @__PURE__ */ import_react.default.createElement("label", null, "\u6E29\u5EA6", /* @__PURE__ */ import_react.default.createElement("input", { type: "number", min: "0", max: "2", step: "0.1", value: route.temperature, onChange: (e) => onChange({ ...route, temperature: Number(e.target.value) }) })));
}
function Settings() {
  const [config, setConfig] = (0, import_react.useState)(null), [directory, setDirectory] = (0, import_react.useState)([]), [status, setStatus] = (0, import_react.useState)("");
  const saved = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    api("/state").then((s) => {
      saved.current = s.config;
      setConfig(s.config);
      setDirectory(s.directory);
    }).catch((e) => setStatus(e.message));
  }, []);
  if (!config) return /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-panel" }, status || "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026");
  const save = async (e) => {
    e.preventDefault();
    setStatus("\u6B63\u5728\u4FDD\u5B58\u2026");
    try {
      const patch = Object.fromEntries(Object.entries(config).filter(([key, value]) => key !== "dataDir" && JSON.stringify(value) !== JSON.stringify(saved.current[key])));
      const next = await api("/settings", patch);
      saved.current = next;
      setConfig(next);
      setStatus("\u5DF2\u4FDD\u5B58");
    } catch (error) {
      setStatus(error.message);
    }
  };
  return /* @__PURE__ */ import_react.default.createElement("form", { className: "tx-panel tx-settings", onSubmit: save }, /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-heading" }, /* @__PURE__ */ import_react.default.createElement("span", { className: "tx-mark" }, "x"), /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("h2", null, "trisoul_x"), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u4E3B\u6A21\u578B\u5728 DSH \u6A21\u578B\u8BBE\u7F6E\u4E0E\u5BF9\u8BDD\u9009\u9879\u4E2D\u914D\u7F6E\u3002"))), /* @__PURE__ */ import_react.default.createElement(RouteFields, { label: "\u8BB0\u5FC6\u4E0E\u72B6\u6001", route: config.background, directory, onChange: (background) => setConfig({ ...config, background }) }), /* @__PURE__ */ import_react.default.createElement(RouteFields, { label: "\u4E0A\u4E0B\u6587\u6574\u7406", route: config.surgeon, directory, onChange: (surgeon) => setConfig({ ...config, surgeon }) }), /* @__PURE__ */ import_react.default.createElement("fieldset", { className: "tx-fieldset" }, /* @__PURE__ */ import_react.default.createElement("legend", null, "\u65B0\u4F1A\u8BDD\u9ED8\u8BA4\u8BB0\u5FC6\u8303\u56F4"), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u4E5F\u53EF\u5728\u5BF9\u8BDD\u8F93\u5165\u533A\u9009\u62E9\uFF1B\u5F00\u59CB\u5BF9\u8BDD\u540E\u6CBF\u7528\u5DF2\u7ED1\u5B9A\u7684\u8303\u56F4\u3002"), /* @__PURE__ */ import_react.default.createElement("select", { "aria-label": "\u9ED8\u8BA4\u8BB0\u5FC6\u8303\u56F4", value: config.memoryScope, onChange: (e) => setConfig({ ...config, memoryScope: e.target.value }) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "full" }, "\u5168\u5C40 + \u8DE8\u9879\u76EE + \u672C\u9879\u76EE"), /* @__PURE__ */ import_react.default.createElement("option", { value: "project" }, "\u4EC5\u672C\u9879\u76EE"), /* @__PURE__ */ import_react.default.createElement("option", { value: "session" }, "\u4EC5\u5F53\u524D\u4F1A\u8BDD"))), /* @__PURE__ */ import_react.default.createElement("fieldset", { className: "tx-fieldset" }, /* @__PURE__ */ import_react.default.createElement("legend", null, "\u753B\u5E03\u4E0E\u4E0A\u4E0B\u6587"), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, [
    ["stateEvery", "\u6BCF\u6279\u6574\u7406\u7684\u6D88\u606F\u6570", 1, 1],
    ["minRegionTokens", "\u533A\u95F4\u6700\u5C0F Token \u6570", 1, 500],
    ["keepTailEvents", "\u4FDD\u7559\u6700\u8FD1\u6D88\u606F\u6570", 2, 1],
    ["surgeryCooldownSteps", "\u6574\u7406\u95F4\u9694\u6B65\u6570", 0, 1],
    ["thresholdRatio", "\u7A97\u53E3\u538B\u529B\u6BD4\u4F8B", 0.1, 0.05]
  ].map(([key, label, min, step]) => /* @__PURE__ */ import_react.default.createElement("label", { key }, label, /* @__PURE__ */ import_react.default.createElement("input", { type: "number", min, step, max: key === "thresholdRatio" ? 0.95 : void 0, value: config[key], onChange: (e) => setConfig({ ...config, [key]: Number(e.target.value) }) }))))), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { type: "submit" }, "\u4FDD\u5B58\u8BBE\u7F6E"), /* @__PURE__ */ import_react.default.createElement("span", { role: "status", className: "tx-muted" }, status)));
}
function ContextPanel({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo();
  const { data, error, reload } = useSnapshot(sessionId, tab.visible);
  const [status, setStatus] = (0, import_react.useState)("");
  const context = data?.context;
  const compact = async () => {
    setStatus("\u6B63\u5728\u6574\u7406\u2026");
    try {
      const r = await api(`/compact${suffix(sessionId)}`, {});
      setStatus(r.changed ? "\u5DF2\u6574\u7406\uFF0C\u539F\u6587\u4ECD\u53EF\u56DE\u635E" : "\u76EE\u524D\u6CA1\u6709\u9002\u5408\u6574\u7406\u7684\u8F83\u65E9\u533A\u95F4");
      await reload();
    } catch (e) {
      setStatus(e.message);
    }
  };
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-panel" }, /* @__PURE__ */ import_react.default.createElement("h2", null, "\u5DE5\u4F5C\u4E0A\u4E0B\u6587"), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, data?.live ? `${kindName[data.live.kind]}\u6B63\u5728\u66F4\u65B0\u2026` : `\u5DF2\u6D88\u5316 ${fmt(context?.digestCount)} \u4E2A\u533A\u95F4`), error && /* @__PURE__ */ import_react.default.createElement("p", { role: "alert", className: "tx-error" }, error), /* @__PURE__ */ import_react.default.createElement("h3", null, "\u4EFB\u52A1\u4E0E\u9A8C\u8BC1"), data?.tasks?.length ? data.tasks.map((task, i) => /* @__PURE__ */ import_react.default.createElement("article", { className: "tx-note", key: task.id || i }, /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-meta" }, task.id, " \xB7 ", task.status === "completed" ? "\u5DF2\u5B8C\u6210" : "\u672A\u5B8C\u6210"), /* @__PURE__ */ import_react.default.createElement("strong", null, task.content), task.anchor ? /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u9700\u6C42\u539F\u6587 [", task.sourceMessage, "] \xB7 ", task.sourceExcerpt, "\uFF1A", task.source) : /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u65E7\u7248\u4EFB\u52A1\u5C1A\u672A\u7ED1\u5B9A\u539F\u6587\u951A\u70B9\u3002", task.source && "\u539F\u5907\u6CE8\uFF1A" + task.source), task.links?.length ? task.links.map((link) => /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-evidence", key: link.id }, /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-meta" }, link.id, " \xB7 ", link.kind === "test" ? "\u6D4B\u8BD5" : "\u6587\u5B57\u8BC1\u636E", link.kind === "test" && " \xB7 " + (link.lastRun ? link.lastRun.timedOut ? "TIMEOUT" : link.lastRun.pass ? "PASS" : "FAIL" : "\u5C1A\u672A\u8FD0\u884C")), link.path && /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-path" }, link.path), link.cmd && /* @__PURE__ */ import_react.default.createElement("pre", null, link.cmd), link.note && /* @__PURE__ */ import_react.default.createElement("p", null, link.note), link.reason && /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u539F\u56E0\uFF1A", link.reason), link.lastRun?.tail && /* @__PURE__ */ import_react.default.createElement("details", null, /* @__PURE__ */ import_react.default.createElement("summary", null, "\u5B9E\u9645\u8FD0\u884C\u8F93\u51FA"), /* @__PURE__ */ import_react.default.createElement("pre", null, link.lastRun.tail)))) : /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u5C1A\u672A\u5173\u8054\u9A8C\u8BC1\u8BC1\u636E\u3002"), task.verification && /* @__PURE__ */ import_react.default.createElement("details", null, /* @__PURE__ */ import_react.default.createElement("summary", null, "\u65E7\u7248\u9A8C\u8BC1\u6587\u5B57\u8BB0\u5F55"), /* @__PURE__ */ import_react.default.createElement("p", null, task.verification.method), /* @__PURE__ */ import_react.default.createElement("p", null, task.verification.result)))) : /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u591A\u6B65\u9AA4\u4EFB\u52A1\u4F1A\u5728\u8FD9\u91CC\u5217\u51FA\u9700\u6C42\u539F\u6587\u3001\u8FDB\u5C55\u4E0E\u9A8C\u8BC1\u8BC1\u636E\u3002"), /* @__PURE__ */ import_react.default.createElement("h3", null, "\u7EA6\u675F\u4E0E\u51B3\u5B9A"), context?.pins?.length ? /* @__PURE__ */ import_react.default.createElement("ul", null, context.pins.map((p, i) => /* @__PURE__ */ import_react.default.createElement("li", { key: i }, p))) : /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u968F\u5BF9\u8BDD\u9010\u6B65\u79EF\u7D2F\u3002"), /* @__PURE__ */ import_react.default.createElement("h3", null, "\u5F53\u524D\u72B6\u6001"), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-prose" }, context?.status || "\u5C1A\u672A\u5F62\u6210\u72B6\u6001\u8BB0\u5F55\u3002"), context?.notes?.length > 0 && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("h3", null, "\u5DE5\u4F5C\u7B14\u8BB0"), context.notes.map((note, i) => /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-note", key: i }, note.text))), context?.checkpoint && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("h3", null, "\u5DE5\u4F5C\u7EAA\u8981"), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-prose" }, context.checkpoint.text)), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-footer" }, /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { onClick: compact, disabled: data?.running !== "idle" || status === "\u6B63\u5728\u6574\u7406\u2026" }, "\u6574\u7406\u8F83\u65E9\u4E0A\u4E0B\u6587"), /* @__PURE__ */ import_react.default.createElement("p", { role: "status", className: "tx-muted" }, status)));
}
function MemoryPanel({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo();
  const [data, setData] = (0, import_react.useState)({ items: [], projects: [], trace: [] }), [edit, setEdit] = (0, import_react.useState)(null), [error, setError] = (0, import_react.useState)("");
  const [view, setView] = (0, import_react.useState)("session"), [query, setQuery] = (0, import_react.useState)(""), [scope, setScope] = (0, import_react.useState)("all"), [project, setProject] = (0, import_react.useState)("");
  const [history, setHistory] = (0, import_react.useState)(false), [touched, setTouched] = (0, import_react.useState)(false), [selected, setSelected] = (0, import_react.useState)([]);
  const load = (0, import_react.useCallback)(async () => {
    try {
      setData(await api("/memories" + suffix(sessionId) + "&view=" + view));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [sessionId, view]);
  (0, import_react.useEffect)(() => {
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
    try {
      await api("/memories" + suffix(sessionId), { ...edit, op: edit.id ? "update" : "add", target: edit.id || "", project: edit.project || data.scope.project });
      setEdit(null);
      await load();
    } catch (e2) {
      setError(e2.message);
    }
  };
  const change = async (op, ids) => {
    try {
      for (const id of ids) await api("/memories" + suffix(sessionId), { op, target: id, text: "\u7528\u6237\u5728\u8BB0\u5FC6\u9762\u677F\u5220\u9664" });
      setSelected([]);
      await load();
    } catch (e) {
      setError(e.message);
      await load();
    }
  };
  const visible = data.items.filter((m) => (history || !m.retired && !m.supersededBy) && (!touched || m.touched) && (scope === "all" || m.scope === scope) && (!project || m.project === project) && (!query || [m.text, m.key, m.project].join(" ").toLowerCase().includes(query.toLowerCase())));
  const active = data.items.filter((m) => !m.retired && !m.supersededBy);
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-panel" }, /* @__PURE__ */ import_react.default.createElement("h2", null, "\u8BB0\u5FC6"), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u6709\u6548 ", active.length, " \xB7 \u5F53\u524D\u53EF\u89C1 ", active.filter((m) => m.visible).length, " \xB7 \u672C\u4F1A\u8BDD\u4F7F\u7528 ", data.items.filter((m) => m.touched).length), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { disabled: !data.scope, onClick: () => setEdit({ scope: "project", project: data.scope.project, key: "note." + Date.now(), text: "" }) }, "\u65B0\u589E\u8BB0\u5FC6"), /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { variant: "outline", onClick: load }, "\u5237\u65B0")), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement("label", null, "\u67E5\u770B\u8303\u56F4", /* @__PURE__ */ import_react.default.createElement("select", { value: view, onChange: (e) => {
    setView(e.target.value);
    setSelected([]);
  } }, /* @__PURE__ */ import_react.default.createElement("option", { value: "session" }, "\u672C\u4F1A\u8BDD\u53EF\u7528"), /* @__PURE__ */ import_react.default.createElement("option", { value: "all" }, "\u6574\u4E2A\u8BB0\u5FC6\u5E93"))), /* @__PURE__ */ import_react.default.createElement("label", null, "\u5C42\u7EA7", /* @__PURE__ */ import_react.default.createElement("select", { value: scope, onChange: (e) => setScope(e.target.value) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "all" }, "\u5168\u90E8\u5C42\u7EA7"), Object.entries(scopeName).map(([id, text]) => /* @__PURE__ */ import_react.default.createElement("option", { key: id, value: id }, text))))), view === "all" && /* @__PURE__ */ import_react.default.createElement("label", null, "\u9879\u76EE", /* @__PURE__ */ import_react.default.createElement("select", { value: project, onChange: (e) => setProject(e.target.value) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "" }, "\u5168\u90E8\u9879\u76EE"), data.projects.map((p) => /* @__PURE__ */ import_react.default.createElement("option", { key: p, value: p }, projectLabel(p))))), /* @__PURE__ */ import_react.default.createElement("input", { "aria-label": "\u641C\u7D22\u8BB0\u5FC6", placeholder: "\u641C\u7D22\u5185\u5BB9\u3001\u540D\u79F0\u6216\u9879\u76EE\u2026", value: query, onChange: (e) => setQuery(e.target.value) }), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement("label", { className: "tx-check" }, /* @__PURE__ */ import_react.default.createElement("input", { type: "checkbox", checked: history, onChange: (e) => setHistory(e.target.checked) }), "\u542B\u5DF2\u5220\u9664\u548C\u65E7\u7248\u672C"), /* @__PURE__ */ import_react.default.createElement("label", { className: "tx-check" }, /* @__PURE__ */ import_react.default.createElement("input", { type: "checkbox", checked: touched, onChange: (e) => setTouched(e.target.checked) }), "\u4EC5\u672C\u4F1A\u8BDD\u4F7F\u7528\u8FC7")), selected.length > 0 && /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement("span", null, "\u5DF2\u9009 ", selected.length, " \u6761"), /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { size: "sm", onClick: () => change("retire", selected) }, "\u6279\u91CF\u5220\u9664"), /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { size: "sm", variant: "outline", onClick: () => change("restore", selected) }, "\u6279\u91CF\u6062\u590D")), error && /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-error", role: "alert" }, error), edit && /* @__PURE__ */ import_react.default.createElement("form", { className: "tx-fieldset", onSubmit: save }, /* @__PURE__ */ import_react.default.createElement("label", null, "\u5C42\u7EA7", /* @__PURE__ */ import_react.default.createElement("select", { value: edit.scope, onChange: (e) => setEdit({ ...edit, scope: e.target.value }) }, Object.entries(scopeName).map(([id, text]) => /* @__PURE__ */ import_react.default.createElement("option", { key: id, value: id }, text)))), edit.scope === "project" && (edit.project?.startsWith("session:") ? /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u6240\u5C5E\uFF1A", edit.project === data.scope.project ? "\u5F53\u524D\u4F1A\u8BDD" : projectLabel(edit.project)) : /* @__PURE__ */ import_react.default.createElement("label", null, "\u6240\u5C5E\u9879\u76EE", /* @__PURE__ */ import_react.default.createElement("input", { value: edit.project || "", required: true, onChange: (e) => setEdit({ ...edit, project: e.target.value }) }))), /* @__PURE__ */ import_react.default.createElement("label", null, "\u540D\u79F0", /* @__PURE__ */ import_react.default.createElement("input", { value: edit.key, required: true, onChange: (e) => setEdit({ ...edit, key: e.target.value }) })), /* @__PURE__ */ import_react.default.createElement("label", null, "\u5185\u5BB9", /* @__PURE__ */ import_react.default.createElement("textarea", { value: edit.text, required: true, rows: "5", onChange: (e) => setEdit({ ...edit, text: e.target.value }) })), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { type: "submit" }, "\u4FDD\u5B58"), /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { type: "button", variant: "outline", onClick: () => setEdit(null) }, "\u53D6\u6D88"))), !visible.length && /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u6CA1\u6709\u7B26\u5408\u5F53\u524D\u6761\u4EF6\u7684\u8BB0\u5FC6\u3002"), visible.map((m) => /* @__PURE__ */ import_react.default.createElement("article", { key: m.id, className: "tx-note" + (m.retired || m.supersededBy ? " tx-history" : "") }, /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement("input", { className: "tx-select", type: "checkbox", "aria-label": "\u9009\u62E9 " + m.key, checked: selected.includes(m.id), onChange: (e) => setSelected(e.target.checked ? [...selected, m.id] : selected.filter((id) => id !== m.id)) }), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-meta" }, m.project?.startsWith("session:") ? "\u4F1A\u8BDD" : scopeName[m.scope], " \xB7 ", m.key, m.retired ? " \xB7 \u5DF2\u5220\u9664" : m.supersededBy ? " \xB7 \u65E7\u7248\u672C" : "")), /* @__PURE__ */ import_react.default.createElement("p", null, m.text), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-meta" }, "\u6765\u6E90 ", m.source === "user" ? "\u624B\u52A8" : "\u8BB0\u5FC6\u4E2D\u67A2", " \xB7 ", new Date(m.at).toLocaleString(), " \xB7 \u6CE8\u5165 ", m.usage?.injected || 0, " \xB7 \u53EC\u56DE ", m.usage?.recalled || 0), m.project && /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-meta tx-path" }, m.project === data.scope.project && m.project.startsWith("session:") ? "\u5F53\u524D\u4F1A\u8BDD" : projectLabel(m.project)), !m.retired && !m.supersededBy ? /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", onClick: () => setEdit(m) }, "\u7F16\u8F91"), /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", onClick: () => change("retire", [m.id]) }, "\u5220\u9664")) : /* @__PURE__ */ import_react.default.createElement(import_dsh_client_ui_primitives.Button, { variant: "ghost", size: "sm", onClick: () => change("restore", [m.id]) }, "\u6062\u590D\u6B64\u7248\u672C"))), /* @__PURE__ */ import_react.default.createElement("details", { className: "tx-footer" }, /* @__PURE__ */ import_react.default.createElement("summary", null, "\u672C\u4F1A\u8BDD\u7684\u6CE8\u5165\u4E0E\u53EC\u56DE\u8BB0\u5F55"), data.trace.slice().reverse().map((e, i) => /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-activity", key: i }, new Date(e.at).toLocaleTimeString(), " \xB7 ", { injections: "\u6CE8\u5165", recalls: "\u53EC\u56DE", rawRecalls: "\u56DE\u635E\u539F\u6587", digests: "\u6D88\u5316", digestErrors: "\u6D88\u5316\u5931\u8D25", surgeries: "\u4E0A\u4E0B\u6587\u6574\u7406", surgeryErrors: "\u6574\u7406\u5931\u8D25" }[e.name] || e.name, e.items !== void 0 ? " \xB7 " + e.items + " \u6761" : "", e.query && /* @__PURE__ */ import_react.default.createElement("p", null, e.query), e.error && /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-error" }, e.error)))));
}
function Monitor({ sessionId, useTabInfo }) {
  const { tab } = useTabInfo();
  const [range, setRange] = (0, import_react.useState)("session"), [stage, setStage] = (0, import_react.useState)("all"), [failures, setFailures] = (0, import_react.useState)(false);
  const { data, error } = useSnapshot(sessionId, tab.visible, range);
  const activity = (data?.activity || []).filter((a) => (stage === "all" || a.kind === stage) && (!failures || a.error));
  const actions = data?.actions || {};
  const input = (usage) => (usage?.inputTokens || 0) + (usage?.cacheReadTokens || 0) + (usage?.cacheWriteTokens || 0);
  const live = data?.liveCalls || [];
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-panel" }, /* @__PURE__ */ import_react.default.createElement("h2", null, "\u6267\u884C\u76D1\u63A7"), /* @__PURE__ */ import_react.default.createElement("label", null, "\u7EDF\u8BA1\u8303\u56F4", /* @__PURE__ */ import_react.default.createElement("select", { value: range, onChange: (e) => setRange(e.target.value) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "session" }, "\u5F53\u524D\u4F1A\u8BDD\u4E0E\u5B50\u4EE3\u7406"), /* @__PURE__ */ import_react.default.createElement("option", { value: "all" }, "\u5168\u90E8\u4F1A\u8BDD"))), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, fmt(data?.sessionCount), " \u4E2A\u4F1A\u8BDD \xB7 \u5F53\u524D\u5BF9\u8BDD ", { idle: "\u7A7A\u95F2", running: "\u6267\u884C\u4E2D", busy: "\u6267\u884C\u4E2D" }[data?.running] || data?.running || "\u7A7A\u95F2"), error && /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-error", role: "alert" }, error), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-metrics" }, Object.entries(kindName).map(([kind, label]) => {
    const m = data?.metrics?.[kind] || {}, last = data?.activity?.find((a) => a.kind === kind), active = live.find((a) => a.kind === kind);
    return /* @__PURE__ */ import_react.default.createElement("section", { className: "tx-metric", key: kind }, /* @__PURE__ */ import_react.default.createElement("h3", null, label, active && /* @__PURE__ */ import_react.default.createElement("span", { className: "tx-live" }, " \xB7 \u8FD0\u884C\u4E2D")), /* @__PURE__ */ import_react.default.createElement("strong", null, fmt(m.calls), " ", /* @__PURE__ */ import_react.default.createElement("small", null, "\u6B21\u8C03\u7528")), /* @__PURE__ */ import_react.default.createElement("dl", null, /* @__PURE__ */ import_react.default.createElement("dt", null, "\u8F93\u5165 / \u8F93\u51FA"), /* @__PURE__ */ import_react.default.createElement("dd", null, fmt(input(m)), " / ", fmt(m.outputTokens)), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u7F13\u5B58\u547D\u4E2D"), /* @__PURE__ */ import_react.default.createElement("dd", null, input(m) ? `${((m.cacheReadTokens || 0) / input(m) * 100).toFixed(1)}%` : "\u2014"), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u63A8\u7406 Token"), /* @__PURE__ */ import_react.default.createElement("dd", null, m.reasoningTokens == null ? "\u2014" : fmt(m.reasoningTokens)), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u5CF0\u503C\u8F93\u5165"), /* @__PURE__ */ import_react.default.createElement("dd", null, fmt(m.peakContext)), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u7D2F\u8BA1\u8017\u65F6"), /* @__PURE__ */ import_react.default.createElement("dd", null, m.durationMs ? `${(m.durationMs / 1e3).toFixed(1)} s` : "\u2014"), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u5931\u8D25"), /* @__PURE__ */ import_react.default.createElement("dd", null, fmt(m.errors))), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-meta tx-path" }, active ? `${active.provider} / ${active.model}` : last ? `${last.provider} / ${last.model}` : "\u5C1A\u65E0\u8C03\u7528"), m.unmetered > 0 && /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-meta" }, m.unmetered, " \u6B21\u8C03\u7528\u672A\u8FD4\u56DE\u7528\u91CF"), last?.error && /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-error" }, last.error));
  })), /* @__PURE__ */ import_react.default.createElement("h3", null, "\u8BB0\u5FC6\u4E0E\u753B\u5E03"), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-metric" }, /* @__PURE__ */ import_react.default.createElement("dl", null, /* @__PURE__ */ import_react.default.createElement("dt", null, "\u8BB0\u5FC6\u6D88\u5316 / \u5931\u8D25"), /* @__PURE__ */ import_react.default.createElement("dd", null, fmt(actions.digests), " / ", fmt(actions.digestErrors)), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u8BB0\u5FC6\u6CE8\u5165"), /* @__PURE__ */ import_react.default.createElement("dd", null, fmt(actions.injections)), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u53EC\u56DE / \u547D\u4E2D\u6761\u6570"), /* @__PURE__ */ import_react.default.createElement("dd", null, fmt(actions.recalls), " / ", fmt(actions.recallHits)), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u539F\u6587\u56DE\u635E"), /* @__PURE__ */ import_react.default.createElement("dd", null, fmt(actions.rawRecalls)), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u4E0A\u4E0B\u6587\u6574\u7406 / \u5931\u8D25"), /* @__PURE__ */ import_react.default.createElement("dd", null, fmt(actions.surgeries), " / ", fmt(actions.surgeryErrors)), /* @__PURE__ */ import_react.default.createElement("dt", null, "\u6574\u7406\u540E\u5B57\u7B26\u5360\u6BD4"), /* @__PURE__ */ import_react.default.createElement("dd", null, actions.compactInputChars ? `${(actions.compactOutputChars / actions.compactInputChars * 100).toFixed(1)}%` : "\u2014"))), /* @__PURE__ */ import_react.default.createElement("h3", null, "\u5F53\u524D\u4F1A\u8BDD\u7684\u4E0A\u4E0B\u6587"), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, data?.meter ? `\u7EA6 ${fmt(data.meter.totalTokens)} tokens \xB7 ${fmt(data.frame.length)} \u6761\u53EF\u89C1\u8BB0\u5F55` : "\u7EE7\u7EED\u4E00\u6B21\u5BF9\u8BDD\u540E\u53EF\u67E5\u770B\u4E0A\u4E0B\u6587\u8BFB\u6570"), /* @__PURE__ */ import_react.default.createElement("details", null, /* @__PURE__ */ import_react.default.createElement("summary", null, "\u4E0A\u4E0B\u6587\u7EC4\u6210"), data?.frame?.map((n) => /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-frame", key: n.seq }, /* @__PURE__ */ import_react.default.createElement("span", null, "#", n.seq, " ", n.checkpoint ? "\u5DE5\u4F5C\u7EAA\u8981" : n.kind), /* @__PURE__ */ import_react.default.createElement("span", null, fmt(n.tokens), " tok")))), /* @__PURE__ */ import_react.default.createElement("h3", null, "\u6700\u8FD1\u8C03\u7528"), /* @__PURE__ */ import_react.default.createElement("div", { className: "tx-row" }, /* @__PURE__ */ import_react.default.createElement("label", null, "\u7EC4\u4EF6", /* @__PURE__ */ import_react.default.createElement("select", { value: stage, onChange: (e) => setStage(e.target.value) }, /* @__PURE__ */ import_react.default.createElement("option", { value: "all" }, "\u5168\u90E8\u7EC4\u4EF6"), Object.entries(kindName).map(([id, label]) => /* @__PURE__ */ import_react.default.createElement("option", { key: id, value: id }, label)))), /* @__PURE__ */ import_react.default.createElement("label", { className: "tx-check" }, /* @__PURE__ */ import_react.default.createElement("input", { type: "checkbox", checked: failures, onChange: (e) => setFailures(e.target.checked) }), "\u4EC5\u5931\u8D25")), activity.map((a, i) => /* @__PURE__ */ import_react.default.createElement("details", { className: `tx-activity${a.error ? " tx-error" : ""}`, key: i }, /* @__PURE__ */ import_react.default.createElement("summary", null, kindName[a.kind], " \xB7 ", new Date(a.at).toLocaleTimeString(), a.durationMs ? ` \xB7 ${(a.durationMs / 1e3).toFixed(1)} s` : "", a.error ? " \xB7 \u5931\u8D25" : ""), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-meta tx-path" }, a.provider, " / ", a.model, /* @__PURE__ */ import_react.default.createElement("br", null), a.sessionId), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-meta" }, "\u8F93\u5165 ", fmt(input(a.usage)), " \xB7 \u8F93\u51FA ", fmt(a.usage?.outputTokens), " \xB7 \u7F13\u5B58\u8BFB\u53D6 ", fmt(a.usage?.cacheReadTokens), a.effort ? ` \xB7 \u63A8\u7406\u5F3A\u5EA6 ${a.effort}` : ""), a.error && /* @__PURE__ */ import_react.default.createElement("p", null, a.error))), !activity.length && /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted" }, "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u8C03\u7528\u8BB0\u5F55\u3002"), /* @__PURE__ */ import_react.default.createElement("p", { className: "tx-muted tx-footer" }, "\u8BE6\u7EC6\u6D88\u606F\u4E0E\u5DE5\u5177\u5F80\u8FD4\u53EF\u5728 DSH \u7684\u201C\u8F68\u8FF9\u201D\u4E2D\u67E5\u770B\u3002Token \u6309\u63D0\u4F9B\u65B9\u8FD4\u56DE\u7684\u7528\u91CF\u7EDF\u8BA1\u3002"));
}
var Mark = ({ size = 26 }) => /* @__PURE__ */ import_react.default.createElement("span", { className: "tx-mark", style: { fontSize: size } }, "x");
var inject = ["slots", "sidebarRightTabs"];
function apply(ctx) {
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.dataset.plugin = "trisoul_x";
    tag.textContent = style_default;
    document.head.appendChild(tag);
    return () => tag.remove();
  });
  for (const [seat, Component] of [["sidebar.brand.mark", Mark], ["sidebar.brand.name", () => /* @__PURE__ */ import_react.default.createElement("strong", null, "trisoul_x")], ["conversation.hero.brand.mark", () => /* @__PURE__ */ import_react.default.createElement(Mark, { size: 64 })]]) ctx.slots.inject(seat, () => ctx.slots.register({ name: seat }, Component));
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "trisoul-x", order: 16, label: () => "trisoul_x" }, Settings));
  ctx.slots.inject("conversation.input.left", () => ctx.slots.register({ name: "conversation.input.left", id: "trisoul-memory-scope", order: 50 }, MemoryScopeChip));
  for (const [kind, title, description, Component] of [
    ["trisoul-x-context", "\u5DE5\u4F5C\u4E0A\u4E0B\u6587", "\u4EFB\u52A1\u4E0E\u9A8C\u8BC1\u3001\u7EA6\u675F\u548C\u5DE5\u4F5C\u7EAA\u8981", ContextPanel],
    ["trisoul-x-memory", "\u8BB0\u5FC6", "\u67E5\u770B\u4E0E\u7F16\u8F91\u5206\u5C42\u8BB0\u5FC6", MemoryPanel],
    ["trisoul-x-monitor", "\u6267\u884C\u76D1\u63A7", "\u8C03\u7528\u3001\u7528\u91CF\u4E0E\u540E\u53F0\u4F5C\u4E1A", Monitor]
  ]) {
    const id = `trisoul_x/${kind}`;
    ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind, title: () => title, guide: [{ order: 5, title: () => title, description: () => description, icon: Mark }] }));
    ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: id }, Component));
  }
}
return module.exports;}});
