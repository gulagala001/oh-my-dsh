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

// lib/chat.factory.mjs
var registration = {
  id: "@deepseek-ai/dsh-client-ui-chat",
  factory: (require2) => {
    var module2 = { exports: {} };
    var exports = module2.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var __create2 = Object.create;
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __getProtoOf2 = Object.getPrototypeOf;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames2(from), i = 0, n = keys.length, key; i < n; i++) {
        key = keys[i];
        if (!__hasOwnProp2.call(to, key) && key !== except) __defProp2(to, key, {
          get: ((k) => from[k]).bind(null, key),
          enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable
        });
      }
      return to;
    };
    var __toESM2 = (mod, isNodeMode, target) => (target = mod != null ? __create2(__getProtoOf2(mod)) : {}, __copyProps2(isNodeMode || !mod || !mod.__esModule ? __defProp2(target, "default", {
      value: mod,
      enumerable: true
    }) : target, mod));
    let _deepseek_ai_dsh_client_store = require2("@deepseek-ai/dsh-client-store");
    let react = require2("react");
    react = __toESM2(react, 1);
    let _deepseek_ai_dsh_client_ui_primitives = require2("@deepseek-ai/dsh-client-ui-primitives");
    let react_jsx_runtime = require2("react/jsx-runtime");
    let react_dom = require2("react-dom");
    const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ":");
    }
    function encodePath(path) {
      return path.split("/").map(encodeSegment).join("/");
    }
    function sessionFileAddress(sessionId, path) {
      const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
      return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`;
    }
    function isWindowsStylePath(value) {
      return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
    }
    function isAbsoluteWorkspacePath(path) {
      return path.startsWith("/") || isWindowsStylePath(path);
    }
    function fileAddressFor(sessionId, cwd, path) {
      const normalized = path.replace(/\\/g, "/");
      if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized);
      const root = cwd === void 0 ? "" : cwd.replace(/\\/g, "/").replace(/\/+$/, "");
      if (root !== "" && normalized === root) return sessionFileAddress(sessionId, "");
      if (root !== "" && normalized.startsWith(`${root}/`)) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
      return sessionFileAddress(sessionId, normalized);
    }
    const EMPTY_LIST$1 = [];
    const EMPTY_TIMELINE = {
      turnOrder: EMPTY_LIST$1,
      turns: /* @__PURE__ */ new Map()
    };
    const EMPTY_NODE_SOURCE = {
      getSnapshot: () => void 0,
      subscribe: () => () => {
      }
    };
    const EMPTY_NODE_PROCESS_SOURCE = {
      getSnapshot: () => void 0,
      subscribe: () => () => {
      }
    };
    const EMPTY_TURN_NODE_SOURCE = {
      getSnapshot: () => EMPTY_LIST$1,
      subscribe: () => () => {
      }
    };
    const EMPTY_CHAT_SNAPSHOT = {
      order: EMPTY_LIST$1,
      nodes: {
        get: () => void 0,
        source: () => EMPTY_NODE_SOURCE,
        turnDataSource: () => EMPTY_TURN_NODE_SOURCE,
        processSource: () => EMPTY_NODE_PROCESS_SOURCE,
        values: () => EMPTY_LIST$1
      },
      locations: {
        getTurn: () => EMPTY_LIST$1,
        getStep: () => EMPTY_LIST$1
      },
      navigation: { items: () => EMPTY_LIST$1 },
      timeline: EMPTY_TIMELINE,
      legacy: {
        nodes: EMPTY_LIST$1,
        turnTimings: /* @__PURE__ */ new Map(),
        turnEnds: /* @__PURE__ */ new Map(),
        partial: null,
        runningCalls: EMPTY_LIST$1
      }
    };
    function commandOf(call) {
      if (call === void 0) return void 0;
      try {
        const args = JSON.parse(call.argsRaw);
        return typeof args.command === "string" ? args.command : void 0;
      } catch {
        return;
      }
    }
    function ApprovalCommand({ callId, useChat }) {
      return useChat((snapshot2) => {
        for (const node of snapshot2.nodes.values()) {
          const root = node.kind === "tool-call" ? node.data.root : void 0;
          if (root !== void 0 && root.callId === callId && !("kind" in root)) return commandOf(root);
        }
      }) ?? null;
    }
    function markdownLabels(t) {
      return {
        code: {
          copyLabel: t("copy"),
          copiedLabel: t("copied"),
          toolbarLabels: {
            codeLabel: t("codeBlock.title"),
            wrapLabel: t("codeBlock.wrap"),
            unwrapLabel: t("codeBlock.unwrap")
          }
        },
        footnotes: t("markdown.footnotes")
      };
    }
    const css$17 = '.Sixlwa_userRow{flex-direction:column;align-items:flex-end;gap:6px;display:flex}.Sixlwa_userStack{min-width:0;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702), 82%);flex-direction:column;align-items:flex-end;gap:8px;display:flex}.Sixlwa_bubble{background:var(--dsw-specific-bubble);max-width:100%;font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;border-radius:22px;padding:10px 16px}.Sixlwa_referenceSummary{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px))}.Sixlwa_contextRow{padding:2px 0}.Sixlwa_compactionRow{--dsh-compaction-header-height:calc(24px + var(--dsh-content-font-delta,0px));padding:2px 0}.Sixlwa_compactionButton{width:100%;height:var(--dsh-compaction-header-height);min-width:0;color:inherit;font:inherit;text-align:left;background:0 0;border:none;border-radius:6px;align-items:center;padding:0;display:flex}.Sixlwa_compactionRow:has(.Sixlwa_compactionBody) .Sixlwa_compactionButton{z-index:7;background:var(--dsw-alias-bg-base);border-radius:0;position:sticky;top:0}.Sixlwa_compactionBody :has(>[data-code-block-banner]){top:var(--dsh-compaction-header-height)}.Sixlwa_compactionRow:has(.Sixlwa_compactionBody) .Sixlwa_compactionButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}.Sixlwa_compactionButton:not(:disabled){cursor:pointer}.Sixlwa_compactionButton:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover)}.Sixlwa_compactionLeading{width:calc(16px + var(--dsh-content-font-delta,0px));height:calc(16px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-secondary);flex:none;place-items:center;margin-right:6px;display:inline-grid}.Sixlwa_compactionLeading svg{width:calc(14px + var(--dsh-content-font-delta,0px));height:calc(14px + var(--dsh-content-font-delta,0px))}.Sixlwa_compactionContextIcon,.Sixlwa_compactionDisclosureIcon{grid-area:1/1;justify-content:center;align-items:center;display:inline-flex}.Sixlwa_compactionDisclosureIcon,.Sixlwa_compactionButton:not(:disabled):hover .Sixlwa_compactionContextIcon,.Sixlwa_compactionButton:not(:disabled):focus-visible .Sixlwa_compactionContextIcon{opacity:0}.Sixlwa_compactionButton:not(:disabled):hover .Sixlwa_compactionDisclosureIcon,.Sixlwa_compactionButton:not(:disabled):focus-visible .Sixlwa_compactionDisclosureIcon{opacity:1}.Sixlwa_compactionTitle{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary-dimmed);flex:none}.Sixlwa_compactionSep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.Sixlwa_compactionSummary{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;flex:auto;overflow:hidden}.Sixlwa_compactionBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px))}.Sixlwa_retryRow{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}.Sixlwa_retrySummary{width:fit-content;color:inherit;cursor:pointer;user-select:none;border-radius:3px;align-items:center;gap:7px;padding:2px 0;list-style:none;display:inline-flex}.Sixlwa_retrySummary::-webkit-details-marker{display:none}.Sixlwa_retrySummary:after{content:"";opacity:.8;border-bottom:1.5px solid;border-right:1.5px solid;width:6px;height:6px;transition:transform .12s;transform:rotate(-45deg)}.Sixlwa_retrySummary:hover{color:var(--dsw-alias-label-secondary)}.Sixlwa_retrySummary:focus-visible{outline:1.5px solid var(--dsw-alias-button-info-fill);outline-offset:2px}.Sixlwa_retryText{color:inherit}.Sixlwa_retryRow[data-active] .Sixlwa_retryText{background:linear-gradient(90deg, var(--dsw-alias-label-tertiary) 0%, var(--dsw-alias-label-tertiary) 40%, var(--dsw-alias-label-secondary) 50%, var(--dsw-alias-label-tertiary) 60%, var(--dsw-alias-label-tertiary) 100%);color:#0000;background-position:100%;background-size:200% 100%;background-clip:text;animation:1.6s ease-in-out infinite Sixlwa_retry-shimmer}.Sixlwa_retryRow[open] .Sixlwa_retrySummary:after{transform:rotate(45deg)}.Sixlwa_retryDetails{overflow-wrap:anywhere;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px));gap:2px;margin-top:3px;padding-left:14px;display:grid}.Sixlwa_retryDetailLabel{color:var(--dsw-alias-label-secondary)}.Sixlwa_turnErrorRow{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));grid-template-columns:10px minmax(0,1fr) auto;align-items:start;gap:8px;padding:2px 0;display:grid}.Sixlwa_turnErrorDot{margin-top:5px}.Sixlwa_turnErrorCopy{overflow-wrap:anywhere;min-width:0}.Sixlwa_turnErrorTitle{color:var(--dsw-alias-state-error-primary);margin-right:6px;font-weight:600}.Sixlwa_turnErrorMessage{color:var(--dsw-alias-label-secondary)}.Sixlwa_turnErrorCode{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-markdown-code-block-small)}.Sixlwa_maxTokensTitle{color:var(--dsw-alias-state-warn-primary);margin-right:6px;font-weight:600}@keyframes Sixlwa_retry-shimmer{0%{background-position:100%}to{background-position:0}}@media (prefers-reduced-motion:reduce){.Sixlwa_retryRow[data-active] .Sixlwa_retryText{color:inherit;background:0 0;animation:none}}.Sixlwa_attachmentRow{flex-wrap:wrap;justify-content:flex-end;gap:8px;max-width:100%;display:flex}.Sixlwa_fileCard{border:.5px solid var(--dsw-alias-border-l2,#0000001f);background:var(--dsw-specific-input-major,transparent);box-sizing:border-box;border-radius:16px;flex:0 0 240px;align-items:center;gap:10px;width:240px;min-height:64px;padding:8px 12px;display:inline-flex}.Sixlwa_fileIcon{flex:none;width:28px;height:28px}.Sixlwa_fileContent{flex-direction:column;flex:1;min-width:0;display:flex}.Sixlwa_fileName{white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px;overflow:hidden}.Sixlwa_fileMeta{white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary,#00000073);font-size:12px;line-height:15px;overflow:hidden}';
    const tagId$17 = "@deepseek-ai/dsh-client-ui-chat/MessageItem.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$17) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$17;
      tag.textContent = css$17;
      document.head.appendChild(tag);
    }
    var MessageItem_module_css_default = {
      "attachmentRow": "Sixlwa_attachmentRow",
      "bubble": "Sixlwa_bubble",
      "compactionBody": "Sixlwa_compactionBody",
      "compactionButton": "Sixlwa_compactionButton",
      "compactionContextIcon": "Sixlwa_compactionContextIcon",
      "compactionDisclosureIcon": "Sixlwa_compactionDisclosureIcon",
      "compactionLeading": "Sixlwa_compactionLeading",
      "compactionRow": "Sixlwa_compactionRow",
      "compactionSep": "Sixlwa_compactionSep",
      "compactionSummary": "Sixlwa_compactionSummary",
      "compactionTitle": "Sixlwa_compactionTitle",
      "contextRow": "Sixlwa_contextRow",
      "fileCard": "Sixlwa_fileCard",
      "fileContent": "Sixlwa_fileContent",
      "fileIcon": "Sixlwa_fileIcon",
      "fileMeta": "Sixlwa_fileMeta",
      "fileName": "Sixlwa_fileName",
      "maxTokensTitle": "Sixlwa_maxTokensTitle",
      "referenceSummary": "Sixlwa_referenceSummary",
      "retry-shimmer": "Sixlwa_retry-shimmer",
      "retryDetailLabel": "Sixlwa_retryDetailLabel",
      "retryDetails": "Sixlwa_retryDetails",
      "retryRow": "Sixlwa_retryRow",
      "retrySummary": "Sixlwa_retrySummary",
      "retryText": "Sixlwa_retryText",
      "turnErrorCode": "Sixlwa_turnErrorCode",
      "turnErrorCopy": "Sixlwa_turnErrorCopy",
      "turnErrorDot": "Sixlwa_turnErrorDot",
      "turnErrorMessage": "Sixlwa_turnErrorMessage",
      "turnErrorRow": "Sixlwa_turnErrorRow",
      "turnErrorTitle": "Sixlwa_turnErrorTitle",
      "userRow": "Sixlwa_userRow",
      "userStack": "Sixlwa_userStack"
    };
    const CompactionItem = (0, react.memo)(function CompactionItem2({ node, title, fallbackSummary, t }) {
      const [expanded, setExpanded] = (0, react.useState)(false);
      const labels = (0, react.useMemo)(() => markdownLabels(t), [t]);
      const expandable = node.summary !== null;
      const open = expandable && expanded;
      const summary = node.shadowedItemCount !== null && node.shadowedTokenCount !== null ? t("message.compaction.completed", {
        items: node.shadowedItemCount,
        tokens: node.shadowedTokenCount
      }) : fallbackSummary ?? (expandable ? t("message.compaction.expand") : t("message.compaction.unavailable"));
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: MessageItem_module_css_default.compactionRow,
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
          type: "button",
          className: MessageItem_module_css_default.compactionButton,
          disabled: !expandable,
          "aria-expanded": expandable ? open : void 0,
          onClick: () => {
            setExpanded((value) => !value);
          },
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
              className: MessageItem_module_css_default.compactionLeading,
              "aria-hidden": true,
              children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
                className: MessageItem_module_css_default.compactionContextIcon,
                "data-compaction-icon": "context",
                children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutlineRegular, {})
              }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
                className: MessageItem_module_css_default.compactionDisclosureIcon,
                "data-compaction-disclosure": open ? "expanded" : "collapsed",
                children: open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {})
              })]
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: MessageItem_module_css_default.compactionTitle,
              children: title ?? t("message.compaction")
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: MessageItem_module_css_default.compactionSep,
              "aria-hidden": true
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: MessageItem_module_css_default.compactionSummary,
              children: summary
            })
          ]
        }), open && node.summary !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
          className: MessageItem_module_css_default.compactionBody,
          children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
            text: node.summary,
            labels
          })
        })]
      });
    });
    const css$16 = ".ZkiH0q_text{color:var(--dsw-alias-label-secondary);font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.ZkiH0q_fields{border-top:.5px solid var(--dsw-alias-border-l2);flex-direction:column;gap:2px;margin:8px 0 0;padding-top:8px;display:flex}.ZkiH0q_field{gap:8px;min-width:0;display:flex}.ZkiH0q_fieldKey{min-width:96px;color:var(--dsw-alias-label-caption);flex:none}.ZkiH0q_fieldValue{min-width:0;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;flex:auto;margin:0}.ZkiH0q_files{flex-wrap:wrap;gap:4px 12px;margin:0 0 8px;padding:0;list-style:none;display:flex}.ZkiH0q_file{align-items:baseline;gap:6px;min-width:0;display:flex}.ZkiH0q_filePath{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.ZkiH0q_fileAction{color:var(--dsw-alias-label-caption)}.ZkiH0q_catalogNotice{color:var(--dsw-alias-label-caption);margin:0 0 6px}.ZkiH0q_entries{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}.ZkiH0q_entry{gap:8px;min-width:0;display:flex}.ZkiH0q_entryName{color:var(--dsw-alias-label-secondary);flex:none}.ZkiH0q_entryDescription{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;overflow:hidden}.ZkiH0q_sections{flex-direction:column;gap:8px;margin:0;display:flex}.ZkiH0q_section{flex-direction:column;gap:2px;min-width:0;display:flex}.ZkiH0q_sectionName{color:var(--dsw-alias-label-caption)}.ZkiH0q_sectionText{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.ZkiH0q_relaySender{color:var(--dsw-alias-label-caption);overflow-wrap:anywhere;margin:0 0 6px}.ZkiH0q_recalls{flex-direction:column;gap:2px;margin:0 0 8px;padding:0;list-style:none;display:flex}.ZkiH0q_recall{gap:8px;min-width:0;display:flex}.ZkiH0q_recallLabel{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.ZkiH0q_recallCounts{color:var(--dsw-alias-label-caption);flex:none}";
    const tagId$16 = "@deepseek-ai/dsh-client-ui-chat/ContextBody.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$16) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$16;
      tag.textContent = css$16;
      document.head.appendChild(tag);
    }
    var ContextBody_module_css_default = {
      "catalogNotice": "ZkiH0q_catalogNotice",
      "entries": "ZkiH0q_entries",
      "entry": "ZkiH0q_entry",
      "entryDescription": "ZkiH0q_entryDescription",
      "entryName": "ZkiH0q_entryName",
      "field": "ZkiH0q_field",
      "fieldKey": "ZkiH0q_fieldKey",
      "fieldValue": "ZkiH0q_fieldValue",
      "fields": "ZkiH0q_fields",
      "file": "ZkiH0q_file",
      "fileAction": "ZkiH0q_fileAction",
      "filePath": "ZkiH0q_filePath",
      "files": "ZkiH0q_files",
      "recall": "ZkiH0q_recall",
      "recallCounts": "ZkiH0q_recallCounts",
      "recallLabel": "ZkiH0q_recallLabel",
      "recalls": "ZkiH0q_recalls",
      "relaySender": "ZkiH0q_relaySender",
      "section": "ZkiH0q_section",
      "sectionName": "ZkiH0q_sectionName",
      "sectionText": "ZkiH0q_sectionText",
      "sections": "ZkiH0q_sections",
      "text": "ZkiH0q_text"
    };
    const MAX_CHARS = 2e4;
    const MAX_ENTRIES = 200;
    function asRecord$1(value) {
      return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    }
    function contentRuns(content) {
      const runs = [];
      for (const block of content) {
        if (block.type !== "text") {
          runs.push({ block });
          continue;
        }
        const last = runs[runs.length - 1];
        if (last !== void 0 && "text" in last) last.text += block.text;
        else runs.push({ text: block.text });
      }
      return runs;
    }
    function unknownBlocks(content) {
      return contentRuns(content).flatMap((run) => "block" in run ? [run.block] : []);
    }
    function boundedText(text, t) {
      return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}
${t("json.truncated", { total: text.length })}` : text;
    }
    function fieldValue(value, t) {
      return boundedText(typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value), t);
    }
    function SourceFields({ source, formRendered, t }) {
      const record2 = asRecord$1(source);
      if (record2 === null) return null;
      const hidden = formRendered ? ["kind", "form"] : ["kind"];
      const rows = Object.entries(record2).filter(([key]) => !hidden.includes(key));
      if (rows.length === 0) return null;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", {
        className: ContextBody_module_css_default.fields,
        "data-context-fields": true,
        children: rows.map(([key, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          className: ContextBody_module_css_default.field,
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
            className: ContextBody_module_css_default.fieldKey,
            children: key
          }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
            className: ContextBody_module_css_default.fieldValue,
            children: fieldValue(value, t)
          })]
        }, key))
      });
    }
    function UnknownBlocks({ blocks, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: blocks.map((block, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
        label: t("message.unknownBlock"),
        payload: block,
        truncatedLabel: (total) => t("json.truncated", { total })
      }, index)) });
    }
    function ModelFacingContent({ content, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: contentRuns(content).map((run, index) => "text" in run ? run.text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
        className: ContextBody_module_css_default.text,
        "data-context-text": true,
        children: boundedText(run.text, t)
      }, index) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
        label: t("message.unknownBlock"),
        payload: run.block,
        truncatedLabel: (total) => t("json.truncated", { total })
      }, index)) });
    }
    function OpaqueBody({ content, source, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelFacingContent, {
        content,
        t
      }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceFields, {
        source,
        formRendered: false,
        t
      })] });
    }
    function instructionChanges(source) {
      const record2 = asRecord$1(source);
      const list = record2 === null ? void 0 : record2["changes"];
      if (!Array.isArray(list)) return null;
      const changes = [];
      const seen = /* @__PURE__ */ new Set();
      for (const entry of list) {
        const change = asRecord$1(entry);
        if (change === null) return null;
        const path = change["path"];
        if (typeof path !== "string" || path === "") return null;
        const action = change["action"];
        if (action !== "set" && action !== "replace" && action !== "remove") return null;
        const digest = change["digest"];
        if (seen.has(path)) continue;
        seen.add(path);
        changes.push({
          action,
          path,
          ...typeof digest === "string" ? { digest } : {}
        });
      }
      return changes.length === 0 ? null : changes;
    }
    function instructionAction(action, baseline) {
      if (action === "remove") return "message.context.instructions.removed";
      if (baseline) return "message.context.instructions.loaded";
      return action === "set" ? "message.context.instructions.added" : "message.context.instructions.updated";
    }
    function InstructionsBody({ content, source, t }) {
      const changes = instructionChanges(source);
      if (changes === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpaqueBody, {
        content,
        source,
        t
      });
      const baseline = asRecord$1(source)?.["baseline"] === true;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
        className: ContextBody_module_css_default.files,
        "data-context-files": true,
        children: changes.map((change) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
          className: ContextBody_module_css_default.file,
          title: change.digest,
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: ContextBody_module_css_default.filePath,
            children: change.path
          }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: ContextBody_module_css_default.fileAction,
            children: t(instructionAction(change.action, baseline))
          })]
        }, change.path))
      }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelFacingContent, {
        content,
        t
      })] });
    }
    function catalogEntries(source) {
      const record2 = asRecord$1(source);
      const list = record2 === null ? void 0 : record2["entries"];
      if (!Array.isArray(list)) return null;
      const entries = [];
      for (const item of list) {
        const entry = asRecord$1(item);
        if (entry === null) return null;
        const name = entry["name"];
        const description = entry["description"];
        if (typeof name !== "string" || name === "" || typeof description !== "string") return null;
        entries.push({
          name,
          description
        });
      }
      return entries;
    }
    function CatalogBody({ content, source, t }) {
      const entries = catalogEntries(source);
      if (entries === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpaqueBody, {
        content,
        source,
        t
      });
      const update = asRecord$1(source)?.["update"] === true;
      const shown = entries.slice(0, MAX_ENTRIES);
      const rest = unknownBlocks(content);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
        update && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
          className: ContextBody_module_css_default.catalogNotice,
          "data-context-catalog-update": true,
          children: t("message.context.catalog.replaced")
        }),
        /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
          className: ContextBody_module_css_default.entries,
          "data-context-entries": true,
          children: shown.map((entry, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
            className: ContextBody_module_css_default.entry,
            children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
              className: ContextBody_module_css_default.entryName,
              children: entry.name
            }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: ContextBody_module_css_default.entryDescription,
              children: entry.description
            })]
          }, index))
        }),
        shown.length < entries.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
          className: ContextBody_module_css_default.catalogNotice,
          "data-context-entries-truncated": true,
          children: t("message.context.catalog.more", { count: entries.length - shown.length })
        }),
        /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UnknownBlocks, {
          blocks: rest,
          t
        })
      ] });
    }
    function snapshotSections(source) {
      const record2 = asRecord$1(source);
      const list = record2 === null ? void 0 : record2["sections"];
      if (!Array.isArray(list)) return null;
      const sections = [];
      for (const item of list) {
        const section = asRecord$1(item);
        if (section === null) return null;
        const name = section["name"];
        const text = section["text"];
        if (typeof name !== "string" || name === "" || typeof text !== "string") return null;
        sections.push({
          name,
          text
        });
      }
      return sections.length === 0 ? null : sections;
    }
    function SnapshotBody({ content, source, t }) {
      const sections = snapshotSections(source);
      if (sections === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpaqueBody, {
        content,
        source,
        t
      });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
        className: ContextBody_module_css_default.catalogNotice,
        "data-context-snapshot-supersedes": true,
        children: t("message.context.snapshot.supersedes")
      }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", {
        className: ContextBody_module_css_default.sections,
        "data-context-sections": true,
        children: sections.map((section, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          className: ContextBody_module_css_default.section,
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", {
            className: ContextBody_module_css_default.sectionName,
            children: section.name
          }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
            className: ContextBody_module_css_default.sectionText,
            children: boundedText(section.text, t)
          })]
        }, index))
      })] });
    }
    function NoticeBody({ content, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelFacingContent, {
        content,
        t
      });
    }
    function RelayBody({ content, source, t }) {
      const sender = relaySender(source);
      if (sender === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpaqueBody, {
        content,
        source,
        t
      });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
        className: ContextBody_module_css_default.relaySender,
        "data-context-relay-sender": true,
        children: t("message.context.relay.from", { session: sender })
      }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelFacingContent, {
        content,
        t
      })] });
    }
    function relaySender(source) {
      const sender = asRecord$1(source)?.["senderSessionId"];
      return typeof sender === "string" && sender !== "" ? sender : null;
    }
    function recalledSessions(source) {
      const record2 = asRecord$1(source);
      const list = record2 === null ? void 0 : record2["references"];
      if (!Array.isArray(list)) return null;
      const sessions = [];
      for (const item of list) {
        const reference = asRecord$1(item);
        if (reference === null) return null;
        const label = reference["label"];
        const retained = reference["retainedMessages"];
        const omitted = reference["omittedMessages"];
        const truncated = reference["truncated"];
        if (typeof label !== "string" || label === "" || typeof retained !== "number" || typeof omitted !== "number" || typeof truncated !== "boolean") return null;
        sessions.push({
          label,
          retained,
          omitted,
          truncated
        });
      }
      return sessions.length === 0 ? null : sessions;
    }
    function RecallBody({ content, source, t }) {
      const sessions = recalledSessions(source);
      if (sessions === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpaqueBody, {
        content,
        source,
        t
      });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
        className: ContextBody_module_css_default.recalls,
        "data-context-recalls": true,
        children: sessions.map((session, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
          className: ContextBody_module_css_default.recall,
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: ContextBody_module_css_default.recallLabel,
              children: session.label
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: ContextBody_module_css_default.recallCounts,
              children: t("message.context.recall.counts", {
                retained: session.retained,
                omitted: session.omitted
              })
            }),
            session.truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: ContextBody_module_css_default.recallCounts,
              children: t("message.context.recall.truncated")
            })
          ]
        }, index))
      }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelFacingContent, {
        content,
        t
      })] });
    }
    function noticeSummary(source) {
      const summary = asRecord$1(source)?.["summary"];
      return typeof summary === "string" && summary !== "" ? summary : null;
    }
    function contextBody(form, props) {
      const opaque = {
        rendered: null,
        summary: null,
        body: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpaqueBody, { ...props })
      };
      switch (form) {
        case "instructions":
          return instructionChanges(props.source) === null ? opaque : {
            rendered: "instructions",
            summary: null,
            body: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstructionsBody, { ...props })
          };
        case "catalog":
          return catalogEntries(props.source) === null ? opaque : {
            rendered: "catalog",
            summary: null,
            body: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CatalogBody, { ...props })
          };
        case "snapshot":
          return snapshotSections(props.source) === null ? opaque : {
            rendered: "snapshot",
            summary: null,
            body: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SnapshotBody, { ...props })
          };
        case "notice": {
          const summary = noticeSummary(props.source);
          return summary === null ? opaque : {
            rendered: "notice",
            summary,
            body: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NoticeBody, { ...props })
          };
        }
        case "relay":
          return relaySender(props.source) === null ? opaque : {
            rendered: "relay",
            summary: null,
            body: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RelayBody, { ...props })
          };
        case "recall":
          return recalledSessions(props.source) === null ? opaque : {
            rendered: "recall",
            summary: null,
            body: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecallBody, { ...props })
          };
        case null:
          return opaque;
        /* v8 ignore next 4 -- closed-union backstop; the compiler rejects a new
        KnownContextForm here rather than letting it degrade to opaque silently. */
        default:
          throw new Error(`unreachable context form: ${String(form)}`);
      }
    }
    const css$15 = ".XrJvXW_root{min-width:0}.XrJvXW_root[data-open]{padding-bottom:4px}.XrJvXW_chevron{color:var(--dsw-alias-label-secondary)}.XrJvXW_sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.XrJvXW_source{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;flex:none;overflow:hidden}.XrJvXW_summary{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;flex:auto;overflow:hidden}.XrJvXW_body{box-sizing:border-box;width:calc(100% - 22px - var(--dsh-content-font-delta,0px));max-height:141px;margin:4px 0 0 calc(22px + var(--dsh-content-font-delta,0px));background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-tertiary);font:400 11px/16px var(--ds-font-family-code);border:none;border-radius:8px;padding:10px 16px 12px 12px;overflow:auto}";
    const tagId$15 = "@deepseek-ai/dsh-client-ui-chat/ContextInjectionRow.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$15) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$15;
      tag.textContent = css$15;
      document.head.appendChild(tag);
    }
    var ContextInjectionRow_module_css_default = {
      "body": "XrJvXW_body",
      "chevron": "XrJvXW_chevron",
      "root": "XrJvXW_root",
      "sep": "XrJvXW_sep",
      "source": "XrJvXW_source",
      "summary": "XrJvXW_summary"
    };
    function ContextInjectionRow({ content, source, producer, form, t }) {
      const [open, setOpen] = (0, react.useState)(false);
      const { rendered, summary, body } = contextBody(form, {
        content,
        source,
        t
      });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
        className: ContextInjectionRow_module_css_default.root,
        icon: producer.role === "recall" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
          "data-context-recall-icon": true,
          children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.ReferenceIconRegular, { kind: "session" })
        }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconContextInjectionOutlineRegular, { size: 14 }),
        chevronClassName: ContextInjectionRow_module_css_default.chevron,
        title: t(producer.role === "recall" ? "message.contextRecall" : "message.contextInjection"),
        collapsedContent: producer.label === null ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: ContextInjectionRow_module_css_default.sep,
            "aria-hidden": true
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: ContextInjectionRow_module_css_default.source,
            "data-context-source": true,
            children: producer.label
          }),
          summary !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: ContextInjectionRow_module_css_default.sep,
            "aria-hidden": true
          }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: ContextInjectionRow_module_css_default.summary,
            "data-context-summary": true,
            children: summary
          })] })
        ] }),
        keepContentWhenOpen: true,
        open,
        expandable: true,
        expandOnRowClick: true,
        onToggle: () => {
          setOpen((value) => !value);
        },
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
          className: ContextInjectionRow_module_css_default.body,
          "data-context-injection-body": true,
          "data-context-form": rendered ?? void 0,
          children: body
        })
      });
    }
    const LIVE_RUN_CLOCK_INTERVAL_MS = 1e3;
    function pad2(n) {
      return String(n).padStart(2, "0");
    }
    function startOfLocalDay(ms) {
      const d = new Date(ms);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    function msUntilNextLocalMidnight(ms) {
      const next = new Date(ms);
      next.setHours(24, 0, 0, 0);
      return Math.max(next.getTime() - ms, 1);
    }
    function formatRunDuration(ms, t) {
      const total = Math.max(0, Math.floor(ms / 1e3));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor(total / 60) % 60;
      const seconds = total % 60;
      if (hours > 0) return t("duration.hours", {
        hours,
        minutes: pad2(minutes),
        seconds: pad2(seconds)
      });
      return minutes > 0 ? t("duration.minutes", {
        minutes,
        seconds: pad2(seconds)
      }) : t("duration.seconds", { seconds });
    }
    function formatLiveRunDuration(ms, t) {
      const totalSeconds = Math.max(0, Math.floor(ms / 1e3));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor(totalSeconds / 60) % 60;
      const seconds = String(totalSeconds % 60);
      if (hours > 0) return t("duration.hours", {
        hours,
        minutes: pad2(minutes),
        seconds
      });
      return minutes > 0 ? t("duration.minutes", {
        minutes,
        seconds
      }) : t("duration.seconds", { seconds });
    }
    function formatTokensPerSecond(tps) {
      const clamped = Math.max(0, tps);
      return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
    }
    function formatMessageClock(time, t, now = Date.now()) {
      const d = new Date(time);
      const n = new Date(now);
      const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
      const params = {
        y: d.getFullYear(),
        m: d.getMonth() + 1,
        d: d.getDate()
      };
      return `${d.getFullYear() === n.getFullYear() ? t("clock.md", params) : t("clock.ymd", params)} ${clock}`;
    }
    function useCalendarDay() {
      const [day, setDay] = (0, react.useState)(() => startOfLocalDay(Date.now()));
      (0, react.useEffect)(() => {
        let timer;
        const arm = () => {
          const now = Date.now();
          setDay(startOfLocalDay(now));
          timer = setTimeout(arm, msUntilNextLocalMidnight(now));
        };
        timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()));
        return () => {
          clearTimeout(timer);
        };
      }, []);
      return day;
    }
    const css$14 = ".xzv4MW_actions{height:calc(28px + var(--dsh-content-font-delta,0px));align-items:center;gap:8px;display:flex}.xzv4MW_timeStart{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px}.xzv4MW_timeEnd{font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:inherit;white-space:nowrap}.xzv4MW_endInfo{min-width:0;color:var(--dsw-alias-label-tertiary);align-items:center;gap:8px;margin-left:8px;display:inline-flex}@media (hover:hover){[data-actions-reveal=hover] .xzv4MW_actions,:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])) .xzv4MW_actions{opacity:0;transition:opacity 80ms}[data-actions-reveal=hover]:hover .xzv4MW_actions,[data-actions-reveal=hover]:focus-within .xzv4MW_actions,:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):hover .xzv4MW_actions,:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):focus-within .xzv4MW_actions{opacity:1}}.xzv4MW_action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.xzv4MW_action svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}.xzv4MW_actions[data-clock=end] .xzv4MW_action svg{width:calc(17px + var(--dsh-content-font-delta,0px));height:calc(17px + var(--dsh-content-font-delta,0px))}.xzv4MW_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.xzv4MW_action[data-unavailable]{cursor:default;opacity:.4}.xzv4MW_action[data-unavailable]:hover{color:var(--dsw-alias-label-tertiary);background:0 0}.xzv4MW_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
    const tagId$14 = "@deepseek-ai/dsh-client-ui-chat/MessageIconActions.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$14) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$14;
      tag.textContent = css$14;
      document.head.appendChild(tag);
    }
    var MessageIconActions_module_css_default = {
      "action": "xzv4MW_action",
      "actions": "xzv4MW_actions",
      "endInfo": "xzv4MW_endInfo",
      "timeEnd": "xzv4MW_timeEnd",
      "timeStart": "xzv4MW_timeStart",
      "visuallyHidden": "xzv4MW_visuallyHidden"
    };
    function MessageIconActions({ text, time, clock, onBranch, branchUnavailable = false, className, extraActions, usageAction, t }) {
      const day = useCalendarDay();
      const reasonId = (0, react.useId)();
      const [copied, setCopied] = (0, react.useState)(false);
      const copyPending = (0, react.useRef)(false);
      const copyTimer = (0, react.useRef)(null);
      const copyEpoch = (0, react.useRef)(0);
      (0, react.useEffect)(() => () => {
        copyEpoch.current += 1;
        copyPending.current = false;
        if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      }, []);
      const onCopy = (0, react.useCallback)(() => {
        if (copied || copyPending.current) return;
        const epoch = copyEpoch.current;
        copyPending.current = true;
        (0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text).then((ok) => {
          if (epoch !== copyEpoch.current) return;
          copyPending.current = false;
          if (!ok) return;
          setCopied(true);
          copyTimer.current = window.setTimeout(() => {
            copyTimer.current = null;
            setCopied(false);
          }, 1e3);
        });
      }, [copied, text]);
      const clockEl = time === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
        className: clock === "start" ? MessageIconActions_module_css_default.timeStart : MessageIconActions_module_css_default.timeEnd,
        children: formatMessageClock(time, t, day)
      });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: className === void 0 ? MessageIconActions_module_css_default.actions : `${MessageIconActions_module_css_default.actions} ${className}`,
        "data-clock": clock,
        children: [
          clock === "start" ? clockEl : null,
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
            label: copied ? t("copied") : t("copy"),
            side: "bottom",
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
              type: "button",
              className: MessageIconActions_module_css_default.action,
              "aria-label": copied ? t("copied") : t("copy"),
              onClick: onCopy,
              children: copied ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular, {})
            })
          }),
          extraActions,
          onBranch !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
            label: branchUnavailable ? t("message.branchUnavailable") : t("message.branch"),
            side: "bottom",
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
              type: "button",
              className: MessageIconActions_module_css_default.action,
              "aria-label": t("message.branch"),
              "aria-disabled": branchUnavailable || void 0,
              "aria-describedby": branchUnavailable ? reasonId : void 0,
              "data-unavailable": branchUnavailable || void 0,
              onClick: branchUnavailable ? void 0 : onBranch,
              children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, {})
            })
          }),
          onBranch !== void 0 && branchUnavailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            id: reasonId,
            className: MessageIconActions_module_css_default.visuallyHidden,
            children: t("message.branchUnavailable")
          }),
          clock === "end" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
            className: MessageIconActions_module_css_default.endInfo,
            children: [usageAction, clockEl]
          }) : usageAction
        ]
      });
    }
    function contentParts(content) {
      const texts = [];
      const attachments = [];
      const rest = [];
      for (const block of content) {
        const b = block;
        if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
        else if (b.type === "image" && b.attachment !== void 0) attachments.push({
          type: "image",
          image: { attachment: b.attachment }
        });
        else if (b.type === "file" && b.attachment !== void 0) attachments.push({
          type: "file",
          file: b.attachment
        });
        else rest.push(block);
      }
      return {
        text: texts.join(""),
        attachments,
        rest
      };
    }
    function retrySeconds(milliseconds) {
      return Math.max(1, Math.ceil(milliseconds / 1e3));
    }
    function failureMessage(message, code, t) {
      return code === "AUTH" ? t("message.failure.auth") : message;
    }
    function ModelRetryItem({ node, active, t }) {
      const deadline = (0, react.useMemo)(() => Date.now() + node.delayMs, [node.delayMs, node.seq]);
      const scheduledSeconds = retrySeconds(node.delayMs);
      const maximum = node.mode === "normal" ? node.maxRetries : "\u221E";
      const [countdown, setCountdown] = (0, react.useState)(() => ({
        deadline,
        seconds: retrySeconds(deadline - Date.now())
      }));
      const remainingSeconds = countdown.deadline === deadline ? countdown.seconds : retrySeconds(deadline - Date.now());
      (0, react.useEffect)(() => {
        if (!active) return;
        const updateCountdown = () => {
          const next = retrySeconds(deadline - Date.now());
          setCountdown((current) => current.deadline === deadline && current.seconds === next ? current : {
            deadline,
            seconds: next
          });
          return next;
        };
        if (updateCountdown() === 1) return;
        const timer = window.setInterval(() => {
          if (updateCountdown() === 1) window.clearInterval(timer);
        }, 250);
        return () => {
          window.clearInterval(timer);
        };
      }, [active, deadline]);
      const label = active ? t("message.retry.active") : node.retryState === "cancelled" ? t("message.retry.cancelled") : node.retryState === "started" ? t("message.retry.started") : t("message.retry.scheduled");
      const seconds = active ? remainingSeconds : scheduledSeconds;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
        className: MessageItem_module_css_default.retryRow,
        "data-active": active || void 0,
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
          className: MessageItem_module_css_default.retrySummary,
          children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: MessageItem_module_css_default.retryText,
            role: "status",
            children: t("message.retry.status", {
              label,
              retry: node.retry,
              maximum,
              seconds
            })
          })
        }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          className: MessageItem_module_css_default.retryDetails,
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: MessageItem_module_css_default.retryDetailLabel,
            children: t("message.retry.delay")
          }), t("duration.milliseconds", { milliseconds: Math.round(node.delayMs) })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: MessageItem_module_css_default.retryDetailLabel,
            children: t("message.retry.failure")
          }), failureMessage(node.failure.message, node.failure.code, t)] })]
        })]
      });
    }
    function TurnErrorItem({ node, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: MessageItem_module_css_default.turnErrorRow,
        role: "status",
        children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
            state: "error",
            className: MessageItem_module_css_default.turnErrorDot
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
            className: MessageItem_module_css_default.turnErrorCopy,
            children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: MessageItem_module_css_default.turnErrorTitle,
              children: t("message.turnError")
            }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: MessageItem_module_css_default.turnErrorMessage,
              children: failureMessage(node.message, node.code, t)
            })]
          }),
          node.code !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
            className: MessageItem_module_css_default.turnErrorCode,
            children: node.code
          })
        ]
      });
    }
    function TurnMaxTokensItem({ t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: MessageItem_module_css_default.turnErrorRow,
        role: "status",
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
          state: "warning",
          className: MessageItem_module_css_default.turnErrorDot
        }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          className: MessageItem_module_css_default.turnErrorCopy,
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: MessageItem_module_css_default.maxTokensTitle,
            children: t("message.maxTokens")
          }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: MessageItem_module_css_default.turnErrorMessage,
            children: t("message.maxTokens.hint")
          })]
        })]
      });
    }
    function UserStyleBubble({ content, renderMessageImages, actions, pending = false, echo = false, referenceLabels = [], skillNames = [], previewAttachments, references, t }) {
      const { text, attachments: contentAttachments, rest } = contentParts(content);
      const attachments = previewAttachments ?? contentAttachments;
      const compactImages = attachments.length > 1;
      const truncated = (total) => t("json.truncated", { total });
      const showBubble = text !== "" || rest.length > 0;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: MessageItem_module_css_default.userRow,
        "data-pending-steering": pending || void 0,
        "data-submission-echo": echo || void 0,
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          className: MessageItem_module_css_default.userStack,
          children: [
            attachments.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              className: MessageItem_module_css_default.attachmentRow,
              "data-message-attachments": true,
              children: attachments.map((attachment, index) => attachment.type === "image" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: renderMessageImages({
                images: [attachment.image],
                align: "end",
                compact: compactImages
              }) }, `image:${index}`) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
                className: MessageItem_module_css_default.fileCard,
                title: attachment.file.name,
                children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FileTypeIcon, {
                  path: attachment.file.name,
                  className: MessageItem_module_css_default.fileIcon
                }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
                  className: MessageItem_module_css_default.fileContent,
                  children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
                    className: MessageItem_module_css_default.fileName,
                    children: attachment.file.name
                  }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
                    className: MessageItem_module_css_default.fileMeta,
                    children: [(0, _deepseek_ai_dsh_client_ui_primitives.fileExtension)(attachment.file.name).toUpperCase().slice(0, 8), (0, _deepseek_ai_dsh_client_ui_primitives.fileSizeText)(attachment.file.bytes)].filter(Boolean).join(" ")
                  })]
                })]
              }, `file:${index}`))
            }),
            showBubble && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
              className: MessageItem_module_css_default.bubble,
              children: [(0, _deepseek_ai_dsh_client_ui_primitives.projectUserText)(text, referenceLabels, skillNames, "skill", references), rest.map((block, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
                label: t("message.extraBlock"),
                payload: block,
                truncatedLabel: truncated
              }, i))]
            }),
            referenceLabels.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              className: MessageItem_module_css_default.referenceSummary,
              children: t("message.referenceSummary", { labels: referenceLabels.join(t("message.referenceSeparator")) })
            })
          ]
        }), actions?.(text)]
      });
    }
    function PendingSteeringBubble({ content, renderMessageImages, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UserStyleBubble, {
        content,
        renderMessageImages,
        pending: true,
        t,
        actions: (text) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageIconActions, {
          text,
          clock: "start",
          className: MessageItem_module_css_default.actions,
          t
        })
      });
    }
    function PendingSubmissionBubble({ submission, renderMessageImages, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UserStyleBubble, {
        content: (0, react.useMemo)(() => submission.text === "" ? [] : [{
          type: "text",
          text: submission.text
        }], [submission.text]),
        previewAttachments: (0, react.useMemo)(() => submission.attachments.map((attachment) => attachment.type === "image" ? {
          type: "image",
          image: { preview: {
            url: attachment.value.previewUrl,
            ...attachment.value.name === void 0 ? {} : { name: attachment.value.name },
            ...attachment.value.width === void 0 ? {} : { width: attachment.value.width },
            ...attachment.value.height === void 0 ? {} : { height: attachment.value.height }
          } }
        } : {
          type: "file",
          file: attachment.value
        }), [submission.attachments]),
        renderMessageImages,
        pending: submission.placement === "steering",
        echo: true,
        t,
        actions: (text) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageIconActions, {
          text,
          time: submission.time,
          clock: "start",
          className: MessageItem_module_css_default.actions,
          t
        })
      });
    }
    const UserMessageNodeView = (0, react.memo)(function UserMessageNodeView2({ node, renderMessageImages, openFile, openSkill, t }) {
      const data = node.data;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UserStyleBubble, {
        content: data.content,
        references: {
          openFile,
          openSkill
        },
        renderMessageImages,
        ...data.referenceLabels === void 0 ? {} : { referenceLabels: data.referenceLabels },
        ...data.skillNames === void 0 ? {} : { skillNames: data.skillNames },
        t,
        actions: (text) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageIconActions, {
          text,
          time: data.time,
          clock: "start",
          className: MessageItem_module_css_default.actions,
          t
        })
      });
    });
    const ContextMessageNodeView = (0, react.memo)(function ContextMessageNodeView2({ node, t }) {
      const data = node.data;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContextInjectionRow, {
        content: data.content,
        source: data.source,
        producer: data.producer,
        form: data.form,
        t
      });
    });
    const CompactionNodeView = (0, react.memo)(function CompactionNodeView2({ node, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CompactionItem, {
        node: node.data,
        t
      });
    });
    const RetryNodeView = (0, react.memo)(function RetryNodeView2({ node, t }) {
      const data = node.data;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelRetryItem, {
        node: data.current,
        active: data.current.retryState === "scheduled",
        t
      });
    });
    const TurnErrorNodeView = (0, react.memo)(function TurnErrorNodeView2({ node, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnErrorItem, {
        node: node.data,
        t
      });
    });
    const TurnMaxTokensNodeView = (0, react.memo)(function TurnMaxTokensNodeView2({ t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnMaxTokensItem, { t });
    });
    const UnknownNodeView = (0, react.memo)(function UnknownNodeView2({ node, t }) {
      const data = node.data;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        className: MessageItem_module_css_default.contextRow,
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
          label: t("message.unknownSurface", { type: data.type }),
          payload: data.data,
          truncatedLabel: (total) => t("json.truncated", { total })
        })
      });
    });
    const TURN_PROCESS_INDEPENDENT_KINDS = /* @__PURE__ */ new Set([
      "system-prompt",
      "user",
      "steering",
      "turn-trigger",
      "turn-process",
      "turn-error",
      "turn-max-tokens",
      "turn-tail"
    ]);
    function sameTurnProcessSpec(left, right) {
      return left.turn === right.turn && left.controlAnchorSeq === right.controlAnchorSeq && left.processStartSeq === right.processStartSeq && left.answerAnchorSeq === right.answerAnchorSeq && left.answerStep === right.answerStep && left.inlineReasoning === right.inlineReasoning && left.messageCount === right.messageCount && left.toolCallCount === right.toolCallCount && left.subagentCount === right.subagentCount;
    }
    function isSubagentDelegationTool(name) {
      return name === "subagent" || name.startsWith("subagent_");
    }
    function turnProcessAlwaysOpen(node) {
      const location = node?.location;
      if (location?.kind !== "turn" && location?.kind !== "step") return false;
      const reason = location.turn.end?.data.reason.kind;
      return location.turn.status === "open" || reason === "aborted" || reason === "error";
    }
    function storedTurnProcessEntry(state, turn) {
      return state.turnProcesses.find((entry) => entry.turn === turn);
    }
    function createChatStore() {
      return (0, _deepseek_ai_dsh_client_store.defineStore)({
        init: () => ({ turnProcesses: [] }),
        actions: { setTurnProcessOpen: (draft, turn, answerStep, open) => {
          const index = draft.turnProcesses.findIndex((entry) => entry.turn === turn);
          if (!open) {
            if (index >= 0) draft.turnProcesses.splice(index, 1);
            return;
          }
          const next = {
            turn,
            answerStep
          };
          if (index < 0) draft.turnProcesses.push(next);
          else draft.turnProcesses[index] = next;
        } }
      });
    }
    function useSearchableHidden(hidden, reveal) {
      const ref = (0, react.useRef)(null);
      (0, react.useLayoutEffect)(() => {
        const element = ref.current;
        if (element === null) return;
        if (hidden && element.contains(element.ownerDocument.activeElement)) {
          reveal();
          return;
        }
        if (hidden) element.setAttribute("hidden", "until-found");
        else element.removeAttribute("hidden");
      }, [hidden, reveal]);
      (0, react.useEffect)(() => {
        const element = ref.current;
        if (element === null) return;
        element.addEventListener("beforematch", reveal);
        return () => {
          element.removeEventListener("beforematch", reveal);
        };
      }, [reveal]);
      return ref;
    }
    const css$13 = ".EvIC1a_frame{flex-direction:column;flex:auto;min-height:0;display:flex;position:relative;container-type:inline-size}.EvIC1a_root{flex-direction:column;flex:auto;min-height:0;display:flex;position:relative;overflow:visible clip}.EvIC1a_scroll{min-height:0;padding:16px calc(var(--dsh-composer-side-clearance) + 16px);flex:auto;overflow-y:auto;container-type:inline-size}.EvIC1a_root[data-chat-following-tail] .EvIC1a_scroll,[data-conversation-scroll]:has(.EvIC1a_root[data-chat-following-tail]){overflow-anchor:none}[data-conversation-scroll] .EvIC1a_frame,[data-conversation-scroll] .EvIC1a_root{flex:none;height:auto;min-height:auto}[data-conversation-scroll] .EvIC1a_scroll{flex:none;min-height:auto;overflow:visible}.EvIC1a_column{max-width:var(--dsh-chat-content-width);flex-direction:column;width:100%;margin:0 auto;display:flex}.EvIC1a_column>:not([hidden]):not(.EvIC1a_flowItem:empty)~:not([hidden]):not(.EvIC1a_flowItem:empty){margin-top:var(--dsh-chat-flow-gap,16px)}.EvIC1a_flowItem{min-width:0}.EvIC1a_flowItem[data-turn-process-answer]{--dsh-chat-flow-gap:8px}.EvIC1a_flowItem:empty{height:0}.EvIC1a_callRow{border-radius:6px}.EvIC1a_hint{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px))}.EvIC1a_openError{color:var(--dsw-alias-state-error-primary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px))}.EvIC1a_older{justify-content:center;display:flex}.EvIC1a_older button{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover-solid);cursor:pointer;border:none;border-radius:14px;padding:4px 12px;font-size:12px}.EvIC1a_older button:disabled{cursor:default;opacity:.6}.EvIC1a_toBottomSlot{z-index:8;height:0;padding-right:max(calc(var(--dsh-composer-side-clearance) + 16px), calc((100% - var(--dsh-chat-content-width)) / 2));pointer-events:none;justify-content:flex-end;display:flex;position:absolute;bottom:16px;left:0;right:0}[data-conversation-scroll] .EvIC1a_toBottomSlot{bottom:calc(var(--dsh-composer-height,152px) + 16px);position:sticky}.EvIC1a_toBottom{--dsw-elevation-stroke-color:var(--dsw-alias-border-l3);corner-shape:round;width:34px;height:34px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-floating-fill);box-shadow:var(--dsw-elevation-panel);cursor:pointer;pointer-events:auto;border:0;border-radius:100px;justify-content:center;align-items:center;margin-top:-34px;padding:0;display:flex}.EvIC1a_toBottom:hover{background:var(--dsw-alias-button-floating-hover)}.EvIC1a_modalAction{min-width:72px}";
    const tagId$13 = "@deepseek-ai/dsh-client-ui-chat/ChatView.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$13) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$13;
      tag.textContent = css$13;
      document.head.appendChild(tag);
    }
    var ChatView_module_css_default = {
      "callRow": "EvIC1a_callRow",
      "column": "EvIC1a_column",
      "flowItem": "EvIC1a_flowItem",
      "frame": "EvIC1a_frame",
      "hint": "EvIC1a_hint",
      "modalAction": "EvIC1a_modalAction",
      "older": "EvIC1a_older",
      "openError": "EvIC1a_openError",
      "root": "EvIC1a_root",
      "scroll": "EvIC1a_scroll",
      "toBottom": "EvIC1a_toBottom",
      "toBottomSlot": "EvIC1a_toBottomSlot"
    };
    function turnDataOf(node) {
      const location = node?.location;
      return location?.kind === "turn" || location?.kind === "step" ? location.turn.data : void 0;
    }
    function turnOf$1(node) {
      const location = node?.location;
      return location?.kind === "turn" || location?.kind === "step" ? location.turn.turn : void 0;
    }
    const ChatNodeSeat = (0, react.memo)(function ChatNodeSeat2({ nodeKey, groupPart, useChatNode, useChatNodeProcess, usePresentation, cwd, openFile, openSkill, inspectCall, forkAt, loadImage, renderMessageImages, fileMentions, useStore, actions, renderSlot, t }) {
      const node = useChatNode(nodeKey);
      const routedNode = node;
      const turn = turnOf$1(routedNode);
      const processPresentation = useChatNodeProcess(nodeKey);
      const processSpec2 = processPresentation?.spec;
      const storedEntry = useStore((state) => processSpec2 === void 0 ? void 0 : storedTurnProcessEntry(state, processSpec2.turn));
      const processEntry = processSpec2 !== void 0 && storedEntry?.answerStep === (processSpec2.answerStep ?? 0) ? storedEntry : void 0;
      const liveProcess = processPresentation !== void 0 && !processPresentation.turnClosed;
      const interleavedInput = processPresentation?.hasInterleavedInput === true;
      const alwaysOpen = liveProcess || interleavedInput || turnProcessAlwaysOpen(routedNode);
      const processOpen = alwaysOpen || processEntry !== void 0;
      const setOpen = (0, react.useCallback)((open) => {
        if (processSpec2 !== void 0 && !alwaysOpen) actions.setTurnProcessOpen(processSpec2.turn, processSpec2.answerStep ?? 0, open);
      }, [
        actions,
        processSpec2,
        alwaysOpen
      ]);
      const foldCompleted = usePresentation((policy) => policy.foldCompletedTurns);
      const processWindowReady = processSpec2 !== void 0 && processPresentation !== void 0 && foldCompleted && processPresentation.turn === processSpec2.turn && (processPresentation.turnStarted || processPresentation.turnClosed);
      const processMember = routedNode !== void 0 && processWindowReady && !TURN_PROCESS_INDEPENDENT_KINDS.has(routedNode.kind) && routedNode.anchorSeq >= processSpec2.processStartSeq && (liveProcess || processSpec2.answerAnchorSeq === null || routedNode.anchorSeq < processSpec2.answerAnchorSeq || groupPart === "reasoning" && routedNode.kind === "assistant-step" && routedNode.data.step === processSpec2.answerStep);
      const processAnswer = routedNode !== void 0 && processWindowReady && !liveProcess && groupPart !== "reasoning" && routedNode.kind === "assistant-step" && routedNode.data.step === processSpec2.answerStep;
      const ownsDisclosure = routedNode?.kind === "turn-process" || processAnswer;
      const foldable = processWindowReady && (liveProcess || processMember || ownsDisclosure);
      const turnProcess = (0, react.useMemo)(() => processSpec2 === void 0 ? void 0 : {
        spec: processSpec2,
        foldable,
        hasContent: !interleavedInput && (processPresentation?.hasExternalProcess === true || processSpec2.inlineReasoning),
        open: processOpen,
        setOpen
      }, [
        foldable,
        interleavedInput,
        processOpen,
        processSpec2,
        processPresentation?.hasExternalProcess,
        setOpen
      ]);
      const controllerInactive = routedNode?.kind === "turn-process" && !foldable;
      const compactAnswer = processAnswer && foldable && processPresentation.compactAnswer && !processOpen;
      const processHidden = controllerInactive || foldable && processMember && !processOpen;
      const wrapperRef = useSearchableHidden(processHidden, (0, react.useCallback)(() => {
        if (processMember) setOpen(true);
      }, [processMember, setOpen]));
      const [disclosureReset] = (0, react.useState)(() => (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(0));
      const turnData = turnDataOf(routedNode);
      const hookContext = (0, react.useMemo)(() => ({
        turnData,
        disclosureReset
      }), [turnData, disclosureReset]);
      const owner = (0, react.useMemo)(() => node === void 0 ? null : {
        ...groupPart === void 0 ? {} : { groupPart },
        cwd,
        openFile,
        openSkill,
        inspectCall,
        forkAt,
        loadImage,
        renderMessageImages,
        fileMentions,
        turnProcess
      }, [
        node,
        groupPart,
        cwd,
        openFile,
        openSkill,
        inspectCall,
        forkAt,
        loadImage,
        renderMessageImages,
        fileMentions,
        turnProcess
      ]);
      if (routedNode === void 0 || owner === null) return null;
      const routedOwner = {
        ...owner,
        node: routedNode
      };
      const flowKey = groupPart === void 0 || groupPart === "response" ? routedNode.key : JSON.stringify([routedNode.key, groupPart]);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        ref: wrapperRef,
        className: ChatView_module_css_default.flowItem,
        "data-chat-anchor-key": flowKey,
        "data-chat-flow-key": flowKey,
        "data-chat-paging-anchor": routedNode.kind !== "turn-process" || void 0,
        "data-chat-node-key": routedNode.key,
        "data-chat-group-part": groupPart,
        "data-chat-flow-kind": routedNode.kind,
        "data-chat-turn": turn,
        "data-turn-process-member": processMember || void 0,
        "data-turn-process-hidden": processHidden || void 0,
        "data-turn-process-answer": compactAnswer || void 0,
        children: renderSlot("conversation.chat.node", routedOwner, {
          entryKey: routedNode.kind,
          hookContext,
          fallback: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
            label: t("message.unknownSurface", { type: routedNode.kind }),
            payload: routedNode.data,
            truncatedLabel: (total) => t("json.truncated", { total })
          })
        })
      });
    });
    function assertNever(value, context) {
      const rendered = JSON.stringify(value) ?? String(value);
      throw new Error(`unreachable variant${context ? ` in ${context}` : ""}: ${rendered}`);
    }
    function chatRenderKey(entry) {
      switch (entry.kind) {
        case "node":
          return JSON.stringify([
            "node",
            entry.key,
            entry.groupPart ?? null
          ]);
        case "group":
          return JSON.stringify(["group", entry.key]);
        default:
          return assertNever(entry);
      }
    }
    function processTitle(summary, t) {
      const labels = summary.counts.slice(0, 3).map(({ kind }) => t(`message.stepProcess.done.${kind}`));
      const first = labels[0];
      if (first === void 0) return t("message.stepProcess.done.thinking");
      const continuation = (label) => label.charAt(0).toLowerCase() + label.slice(1);
      const second = labels[1];
      if (second === void 0) return first;
      if (labels.length === 2) {
        const prefix = t("message.stepProcess.sharedPrefix");
        return t("message.stepProcess.joinTwo", {
          first,
          second: continuation(prefix !== "" && first.startsWith(prefix) && second.startsWith(prefix) ? second.slice(prefix.length) : second)
        });
      }
      const title = [first, ...labels.slice(1).map(continuation)].join(t("message.stepProcess.comma"));
      return summary.counts.length > 3 ? t("message.stepProcess.more", { title }) : title;
    }
    function useDisclosure(version = 0) {
      const [expandedVersion, setExpandedVersion] = (0, react.useState)(null);
      return {
        expanded: expandedVersion === version,
        setExpanded: (0, react.useCallback)((open) => {
          setExpandedVersion(open ? version : null);
        }, [version]),
        toggle: (0, react.useCallback)(() => {
          setExpandedVersion((previous) => previous === version ? null : version);
        }, [version])
      };
    }
    function bindDisclosure(reset) {
      const subscribe = (listener) => reset.subscribe(listener);
      const getSnapshot = () => reset.getSnapshot();
      return function useBoundDisclosure() {
        return useDisclosure((0, react.useSyncExternalStore)(subscribe, getSnapshot));
      };
    }
    function scrollMetrics(element) {
      const height = element.clientHeight;
      return {
        top: element.scrollTop,
        height,
        floor: Math.max(0, element.scrollHeight - height)
      };
    }
    var ScrollFollow = class ScrollFollow2 {
      following;
      threshold;
      static owners = /* @__PURE__ */ new WeakMap();
      target = null;
      sampledTop;
      /**
      * @param following - initial follow intent.
      * @param threshold - accepted distance from the floor, in pixels.
      */
      constructor(following, threshold) {
        this.following = following;
        this.threshold = threshold;
      }
      /**
      * Find the mounted controller for reading-position compensation.
      * @param element - scrollport with an optional follow owner.
      * @returns its controller, when bound.
      */
      static forElement(element) {
        return this.owners.get(element);
      }
      /**
      * Share this controller with reading-position compensation for the same scrollport.
      * @param element - owned scrollport.
      * @returns release the association on unmount or close.
      */
      bind(element) {
        ScrollFollow2.owners.set(element, this);
        return () => {
          if (ScrollFollow2.owners.get(element) === this) ScrollFollow2.owners.delete(element);
        };
      }
      /**
      * Expose follow intent independently of the current offset.
      * @returns whether content growth should follow the floor.
      */
      get active() {
        return this.following;
      }
      /**
      * Expose outstanding native motion before accepting reader input.
      * @returns whether a native follow animation has an outstanding target.
      */
      get animating() {
        return this.target !== null;
      }
      /**
      * Classify bottom arrivals using this scrollport's own tolerance.
      * @param metrics - current scroll geometry.
      * @returns whether the position is within the follow threshold.
      */
      nearBottom(metrics) {
        return metrics.floor - metrics.top <= this.threshold;
      }
      /**
      * Commit caller-owned follow decisions without moving the scrollport.
      * @param active - externally committed follow intent.
      */
      setFollowing(active) {
        this.following = active;
        if (!active) this.target = null;
      }
      /** Adopt the next visible layout as a fresh reader position. */
      reset() {
        this.setFollowing(false);
        this.sampledTop = void 0;
      }
      /**
      * Adopt delivered scrolling while retaining intent during native animation.
      * @param metrics - current geometry.
      * @param movedByReader - caller attribution; omitted callers compare the last sampled position.
      * @returns updated follow intent.
      */
      sample(metrics, movedByReader = this.sampledTop === void 0 || Math.abs(metrics.top - this.sampledTop) > 0.5) {
        this.sampledTop = metrics.top;
        if (!this.animating && movedByReader) this.following = this.nearBottom(metrics);
        return this.active;
      }
      /**
      * Settle native scrolling; an off-target stop releases follow intent.
      * @param metrics - actual geometry delivered at scrollend.
      * @returns follow intent after completing or interrupting native motion.
      */
      settle(metrics) {
        const target = this.target;
        this.target = null;
        return this.sample(metrics, target === null ? void 0 : Math.abs(metrics.top - Math.min(target, metrics.floor)) > this.threshold);
      }
      /**
      * Position immediately and adopt the resulting follow intent.
      * @param element - scrolling element.
      * @param metrics - geometry before positioning.
      * @param top - requested offset, clamped to the measured range.
      * @returns geometry after positioning.
      */
      jump(element, metrics, top) {
        const animated = this.animating;
        this.target = null;
        const target = Math.max(0, Math.min(metrics.floor, top));
        if (animated) element.scrollTo({
          top: target,
          behavior: "instant"
        });
        else if (target !== metrics.top) element.scrollTop = target;
        const landed = {
          ...metrics,
          top: element.scrollTop
        };
        this.sampledTop = landed.top;
        this.following = this.nearBottom(landed);
        return landed;
      }
      /**
      * Follow the measured floor, respecting reduced motion for smooth requests.
      * An outstanding smooth target finishes before another is issued.
      * Within-tolerance positioning is immediate while no animation is outstanding.
      * @param element - scrolling element.
      * @param metrics - current geometry.
      * @param behavior - native animation for growth, or immediate positioning.
      * @returns current geometry; smooth requests retain their starting position until native scroll delivery.
      */
      toBottom(element, metrics, behavior) {
        this.following = true;
        if (behavior === "instant" || metrics.top >= metrics.floor || !this.animating && this.nearBottom(metrics)) return this.jump(element, metrics, metrics.floor);
        if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return this.jump(element, metrics, metrics.floor);
        if (this.target === null) {
          this.target = metrics.floor;
          element.scrollTo({
            top: metrics.floor,
            behavior: "smooth"
          });
        }
        return metrics;
      }
      /**
      * Cancel native motion before a reader gesture; only subsequent actual movement changes follow intent.
      * @param element - scrolling element.
      * @param metrics - position at interruption.
      */
      interrupt(element, metrics) {
        if (!this.animating) return;
        this.target = null;
        this.sampledTop = metrics.top;
        element.scrollTo({
          top: metrics.top,
          behavior: "instant"
        });
      }
    };
    function useScrollFollow(initial, threshold) {
      const [follow] = (0, react.useState)(() => new ScrollFollow(initial, threshold));
      return follow;
    }
    const AT_REST = {
      canScrollUp: false,
      canScrollDown: false
    };
    const SCROLL_KEYS$1 = /* @__PURE__ */ new Set([
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      " "
    ]);
    function useProcessScroll(bodyRef, contentRef, open, grouped) {
      const follow = useScrollFollow(false, 1);
      const initialPosition = (0, react.useRef)(null);
      const [edges, setEdges] = (0, react.useState)(AT_REST);
      const initialize = (0, react.useCallback)((position) => {
        initialPosition.current = position;
      }, []);
      const sync = (0, react.useCallback)((cause) => {
        const body = bodyRef.current;
        let next = AT_REST;
        if (body !== null && body.closest("[hidden], [data-group-expanded-mode]") === null) {
          let metrics = scrollMetrics(body);
          const initial = cause === "resize" ? initialPosition.current : null;
          if (initial !== null) {
            metrics = follow.jump(body, metrics, initial === "bottom" ? metrics.floor : 0);
            if (initial === "top") follow.setFollowing(false);
            initialPosition.current = null;
          } else {
            const wasAnimating = follow.animating;
            if (cause === "scrollend") follow.settle(metrics);
            else follow.sample(metrics);
            if (follow.active && (cause === "resize" || cause === "scrollend" && wasAnimating)) metrics = follow.toBottom(body, metrics, "smooth");
          }
          next = {
            canScrollUp: metrics.top > 1,
            canScrollDown: metrics.top < metrics.floor - 1
          };
        } else follow.reset();
        setEdges((previous) => previous.canScrollUp === next.canScrollUp && previous.canScrollDown === next.canScrollDown ? previous : next);
      }, [bodyRef, follow]);
      const interrupt = (0, react.useCallback)(() => {
        const body = bodyRef.current;
        if (body !== null && follow.animating) follow.interrupt(body, scrollMetrics(body));
      }, [bodyRef, follow]);
      const events = (0, react.useMemo)(() => ({
        onScroll: () => {
          sync("scroll");
        },
        onWheel: interrupt,
        onTouchStart: interrupt,
        onPointerDown: interrupt,
        onKeyDown: (event) => {
          if (!event.defaultPrevented && SCROLL_KEYS$1.has(event.key)) interrupt();
        }
      }), [interrupt, sync]);
      (0, react.useLayoutEffect)(() => {
        interrupt();
        follow.reset();
        if (!grouped || !open) initialPosition.current = null;
      }, [
        follow,
        grouped,
        interrupt,
        open
      ]);
      (0, react.useLayoutEffect)(() => {
        const body = bodyRef.current;
        if (body === null || !open || typeof ResizeObserver === "undefined") return;
        const unbind = follow.bind(body);
        const observer = new ResizeObserver(() => {
          sync("resize");
        });
        const onScrollEnd = (event) => {
          if (event.target === body) sync("scrollend");
        };
        body.addEventListener("scrollend", onScrollEnd);
        observer.observe(body);
        if (contentRef.current !== null) observer.observe(contentRef.current);
        return () => {
          unbind();
          observer.disconnect();
          body.removeEventListener("scrollend", onScrollEnd);
        };
      }, [
        bodyRef,
        contentRef,
        follow,
        open,
        sync
      ]);
      return {
        edges,
        events,
        initialize
      };
    }
    const css$12 = ".O_Ebla_root{min-width:0}.O_Ebla_title{max-width:100%;color:var(--dsw-alias-label-secondary);font:inherit;font-size:var(--dsh-content-font-size,14px);text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0;transition:color .1s;display:flex}.O_Ebla_title:hover{color:var(--dsw-alias-label-primary)}.O_Ebla_leading{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative}.O_Ebla_activityIcon,.O_Ebla_chevron{justify-content:center;align-items:center;transition:opacity .1s;display:inline-flex;position:absolute;inset:0}.O_Ebla_activityIcon{opacity:1}.O_Ebla_chevron,.O_Ebla_title:is(:hover,:focus-visible) .O_Ebla_activityIcon{opacity:0}.O_Ebla_title:is(:hover,:focus-visible) .O_Ebla_chevron{opacity:1}.O_Ebla_title[aria-expanded=true] .O_Ebla_activityIcon{opacity:0}.O_Ebla_title[aria-expanded=true] .O_Ebla_chevron{opacity:1}.O_Ebla_title[aria-expanded=true]{padding-bottom:16px}.O_Ebla_body{--dsh-chat-flow-gap:2px;overscroll-behavior-y:auto;scrollbar-gutter:stable;max-height:min(280px,45vh);position:relative;overflow-y:auto}.O_Ebla_label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.O_Ebla_fadeTop{mask-image:linear-gradient(#0000 0,#000 24px 100%)}.O_Ebla_fadeBottom{mask-image:linear-gradient(#000 0 calc(100% - 24px),#0000 100%)}.O_Ebla_fadeTop.O_Ebla_fadeBottom{mask-image:linear-gradient(#0000 0,#000 24px calc(100% - 24px),#0000 100%)}@media (prefers-reduced-motion:reduce){.O_Ebla_title,.O_Ebla_activityIcon,.O_Ebla_chevron{transition:none}}.O_Ebla_content{flex-direction:column;display:flex}.O_Ebla_content>*{flex-shrink:0}.O_Ebla_content>:not([hidden]):not(:empty)~:not([hidden]):not(:empty){margin-top:var(--dsh-chat-flow-gap,8px)}.O_Ebla_expandedBody{--dsh-chat-flow-gap:16px;scrollbar-gutter:auto;max-height:none;overflow:visible}.O_Ebla_count{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px}";
    const tagId$12 = "@deepseek-ai/dsh-client-ui-chat/ChatGroupSeat.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$12) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$12;
      tag.textContent = css$12;
      document.head.appendChild(tag);
    }
    var ChatGroupSeat_module_css_default = {
      "activityIcon": "O_Ebla_activityIcon",
      "body": "O_Ebla_body",
      "chevron": "O_Ebla_chevron",
      "content": "O_Ebla_content",
      "count": "O_Ebla_count",
      "expandedBody": "O_Ebla_expandedBody",
      "fadeBottom": "O_Ebla_fadeBottom",
      "fadeTop": "O_Ebla_fadeTop",
      "label": "O_Ebla_label",
      "leading": "O_Ebla_leading",
      "root": "O_Ebla_root",
      "title": "O_Ebla_title"
    };
    const PROCESS_TITLE_MINIMUM_MS = 150;
    const PROCESS_ICONS = {
      images: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 3h18v18H3zM3 17l6-7 5 5 3-3 4 5" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
          cx: "16",
          cy: "7",
          r: "1"
        })]
      }),
      computer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 4h18v13H3zM8 21h8M12 17v4" })
      }),
      thinking: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutlineRegular, {}),
      read: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular, { size: 14 }),
      search: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, { size: 14 }),
      edit: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular, { size: 14 }),
      commands: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutlineRegular, {}),
      code: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutlineRegular, { size: 14 }),
      webSearch: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutlineRegular, {}),
      webFetch: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular, { size: 14 }),
      subagents: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutlineRegular, { size: 14 }),
      plan: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlanOutlineRegular, {}),
      questions: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconQuestionOutlineRegular, {}),
      tools: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkleRegular, { size: 14 })
    };
    function sameLiveProcessTitle(left, right) {
      return left.activity === right.activity && left.detail === right.detail;
    }
    function useStableLiveProcessTitle(desired, active) {
      const [displayed, setDisplayed] = (0, react.useState)(desired);
      const displayedRef = (0, react.useRef)(displayed);
      const desiredRef = (0, react.useRef)(desired);
      const displayedAtRef = (0, react.useRef)(Date.now());
      (0, react.useEffect)(() => {
        desiredRef.current = desired;
        if (!active || sameLiveProcessTitle(displayedRef.current, desired)) return;
        const remaining = PROCESS_TITLE_MINIMUM_MS - (Date.now() - displayedAtRef.current);
        const commit = () => {
          const next = desiredRef.current;
          displayedRef.current = next;
          displayedAtRef.current = Date.now();
          setDisplayed(next);
        };
        if (remaining <= 0) {
          commit();
          return;
        }
        const timer = setTimeout(commit, remaining);
        return () => {
          clearTimeout(timer);
        };
      }, [
        active,
        desired.activity,
        desired.detail
      ]);
      return active ? displayed : desired;
    }
    const GroupMembers = (0, react.memo)(function GroupMembers2({ members, ...props }) {
      return members.map((member) => /* @__PURE__ */ (0, react.createElement)(ChatNodeSeat, {
        ...props,
        key: chatRenderKey(member),
        nodeKey: member.key,
        ...member.groupPart === void 0 ? {} : { groupPart: member.groupPart }
      }));
    });
    const ProcessGroupHeader = (0, react.memo)(function ProcessGroupHeader2({ groupKey, useChatGroup, usePresentation, t, open, bodyId, toggle }) {
      const data = useChatGroup(groupKey, (group) => group?.data);
      const working = data !== void 0 && !data.closed && (data.summary.running !== void 0 || data.summary.counts.length === 0);
      const detailed = usePresentation((policy) => working && policy.liveProcessDetail);
      const live = useStableLiveProcessTitle({
        activity: data?.summary.running ?? "thinking",
        detail: data?.summary.runningDetail ?? ""
      }, working);
      if (data === void 0) return null;
      const label = working ? t(`message.stepProcess.${live.activity}`) : processTitle(data.summary, t);
      const detail = detailed && working ? live.detail : "";
      const title = detail === "" ? label : `${label}${t("message.turnProcess.separator")}${detail}`;
      const activity2 = working ? live.activity : data.summary.counts[0]?.kind ?? "thinking";
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
        type: "button",
        id: bodyId + "-title",
        className: `${ChatGroupSeat_module_css_default.title} tx-cu-group-toggle`,
        "aria-expanded": open,
        "aria-controls": bodyId,
        "data-process-activity": activity2,
        onClick: (event) => {
          event.currentTarget.focus();
          toggle();
        },
        children: [
          /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
            className: ChatGroupSeat_module_css_default.leading,
            "aria-hidden": "true",
            children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: ChatGroupSeat_module_css_default.activityIcon,
              "data-step-process-icon": true,
              children: PROCESS_ICONS[activity2]
            }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: ChatGroupSeat_module_css_default.chevron,
              "data-step-process-chevron": true,
              children: open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutlineRegular, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})
            })]
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TextShimmer, {
            active: working,
            className: ChatGroupSeat_module_css_default.label,
            children: title
          }),
          data.summary.counts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: ChatGroupSeat_module_css_default.count,
            "data-process-count": true,
            children: t("message.stepProcess.count", { count: data.summary.counts.reduce((total, item) => total + item.count, 0) })
          }),
          (data.summary.failures ?? 0) > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: "tx-cu-error",
            "data-process-failures": true,
            children: t("message.stepProcess.failures", { count: data.summary.failures ?? 0 })
          }),
          (data.summary.stopped ?? 0) > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            "data-process-stopped": true,
            children: t("message.stepProcess.stopped", { count: data.summary.stopped ?? 0 })
          })
        ]
      });
    });
    const ChatGroupSeat = (0, react.memo)(function ChatGroupSeat2({ groupKey, useChatGroup, ...props }) {
      const members = useChatGroup(groupKey, (group) => group?.members);
      const turn = useChatGroup(groupKey, (group) => group?.data.turn);
      const closed = useChatGroup(groupKey, (group) => group?.data.closed);
      const foldCompleted = props.usePresentation((policy) => policy.foldCompletedTurns);
      const { expanded: open, setExpanded: setOpen } = useDisclosure();
      const firstKey = members?.[0]?.key ?? "";
      const presentation = props.useChatNodeProcess(firstKey);
      const turnLocation2 = props.useChatNode(firstKey, (node) => {
        const location = node?.location;
        return location?.kind === "turn" || location?.kind === "step" ? location.turn : void 0;
      });
      const grouped = props.usePresentation((policy) => turnLocation2?.status !== "open" || policy.stepGrouping !== "none");
      const reason = turnLocation2?.end?.data.reason.kind;
      const alwaysOpen = presentation?.turnClosed === false || presentation?.hasInterleavedInput === true || reason === "aborted" || reason === "error";
      const spec = presentation?.spec;
      const selectStored = (0, react.useCallback)((state) => turn === void 0 ? void 0 : storedTurnProcessEntry(state, turn), [turn]);
      const stored = props.useStore(selectStored);
      const outerHidden = foldCompleted && presentation?.turnClosed === true && spec !== void 0 && !alwaysOpen && stored?.answerStep !== (spec.answerStep ?? 0);
      const revealOuter = (0, react.useCallback)(() => {
        if (spec !== void 0 && !alwaysOpen) props.actions.setTurnProcessOpen(spec.turn, spec.answerStep ?? 0, true);
      }, [
        props.actions,
        spec,
        alwaysOpen
      ]);
      const rootRef = useSearchableHidden(outerHidden, revealOuter);
      const wasClosed = (0, react.useRef)(presentation?.turnClosed);
      (0, react.useLayoutEffect)(() => {
        if (presentation?.turnClosed && !wasClosed.current && open) revealOuter();
        wasClosed.current = presentation?.turnClosed;
      }, [
        presentation?.turnClosed,
        open,
        revealOuter
      ]);
      const reveal = (0, react.useCallback)(() => {
        setOpen(true);
      }, [setOpen]);
      const bodyRef = useSearchableHidden(grouped && !open, reveal);
      const contentRef = (0, react.useRef)(null);
      const bodyId = (0, react.useId)();
      const { edges, events, initialize } = useProcessScroll(bodyRef, contentRef, open, grouped);
      const toggle = (0, react.useCallback)(() => {
        if (!open) initialize(closed === false ? "bottom" : "top");
        setOpen(!open);
      }, [
        closed,
        initialize,
        open,
        setOpen
      ]);
      if (members === void 0) return null;
      const classes = [
        ChatGroupSeat_module_css_default.body,
        !grouped ? ChatGroupSeat_module_css_default.expandedBody : "",
        grouped && edges.canScrollUp ? ChatGroupSeat_module_css_default.fadeTop : "",
        grouped && edges.canScrollDown ? ChatGroupSeat_module_css_default.fadeBottom : ""
      ];
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        ref: rootRef,
        className: `${ChatGroupSeat_module_css_default.root} tx-cu-group`,
        "data-chat-group-key": groupKey,
        "data-cu-group": groupKey,
        "data-chat-flow-key": groupKey,
        "data-chat-anchor-key": `group:${groupKey}`,
        "data-chat-turn": turn,
        "data-chat-paging-anchor": grouped && !open || void 0,
        "data-step-process": true,
        "data-group-expanded-mode": !grouped || void 0,
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
          hidden: !grouped,
          children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProcessGroupHeader, {
            groupKey,
            useChatGroup,
            usePresentation: props.usePresentation,
            t: props.t,
            open,
            bodyId,
            toggle
          })
        }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
          ref: bodyRef,
          id: bodyId,
          role: "region",
          tabIndex: 0,
          "aria-labelledby": bodyId + "-title",
          className: classes.join(" "),
          "data-step-process-body": true,
          "data-scroll-up": edges.canScrollUp || void 0,
          "data-scroll-down": edges.canScrollDown || void 0,
          ...events,
          children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
            ref: contentRef,
            className: ChatGroupSeat_module_css_default.content,
            "data-step-process-content": true,
            "data-chat-flow": "",
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupMembers, {
              ...props,
              members
            })
          })
        })]
      });
    });
    function createLazyMeasurementsView(count, flat, getItemKey) {
      const cache = new Array(count);
      return new Proxy(cache, { get(target, prop, receiver) {
        if (typeof prop === "string") {
          const c = prop.charCodeAt(0);
          if (c >= 48 && c <= 57) {
            const i = +prop;
            if (Number.isInteger(i) && i >= 0 && i < count) {
              let v = target[i];
              if (!v) {
                const s = flat[i * 2];
                v = target[i] = {
                  index: i,
                  key: getItemKey(i),
                  start: s,
                  size: flat[i * 2 + 1],
                  end: s + flat[i * 2 + 1],
                  lane: 0
                };
              }
              return v;
            }
          }
          if (prop === "length") return count;
        }
        return Reflect.get(target, prop, receiver);
      } });
    }
    function memo$11(getDeps, fn, opts) {
      let deps = opts.initialDeps ?? [];
      let result;
      let isInitial = true;
      function memoizedFunction() {
        const newDeps = getDeps();
        if (!(newDeps.length !== deps.length || newDeps.some((dep, index) => deps[index] !== dep))) return result;
        deps = newDeps;
        result = fn(...newDeps);
        if ((opts == null ? void 0 : opts.onChange) && !(isInitial && opts.skipInitialOnChange)) opts.onChange(result);
        isInitial = false;
        return result;
      }
      memoizedFunction.updateDeps = (newDeps) => {
        deps = newDeps;
      };
      return memoizedFunction;
    }
    function notUndefined(value, msg) {
      if (value === void 0) throw new Error(`Unexpected undefined${msg ? `: ${msg}` : ""}`);
      else return value;
    }
    const approxEqual = (a, b) => Math.abs(a - b) < 1.01;
    const debounce = (targetWindow, fn, ms) => {
      let timeoutId;
      return function(...args) {
        targetWindow.clearTimeout(timeoutId);
        timeoutId = targetWindow.setTimeout(() => fn.apply(this, args), ms);
      };
    };
    let _isIOSResult;
    const isIOSWebKit = () => {
      if (_isIOSResult !== void 0) return _isIOSResult;
      if (typeof navigator === "undefined") return _isIOSResult = false;
      if (/iP(hone|od|ad)/.test(navigator.userAgent)) return _isIOSResult = true;
      const mtp = navigator.maxTouchPoints;
      return _isIOSResult = navigator.platform === "MacIntel" && mtp !== void 0 && mtp > 0;
    };
    const getRect = (element) => {
      const { offsetWidth, offsetHeight } = element;
      return {
        width: offsetWidth,
        height: offsetHeight
      };
    };
    const defaultKeyExtractor = (index) => index;
    const defaultRangeExtractor = (range) => {
      const start = Math.max(range.startIndex - range.overscan, 0);
      const len = Math.min(range.endIndex + range.overscan, range.count - 1) - start + 1;
      const arr = new Array(len);
      for (let i = 0; i < len; i++) arr[i] = start + i;
      return arr;
    };
    const observeElementRect = (instance, cb) => {
      const element = instance.scrollElement;
      if (!element) return;
      const targetWindow = instance.targetWindow;
      if (!targetWindow) return;
      const handler = (rect) => {
        const { width, height } = rect;
        cb({
          width: Math.round(width),
          height: Math.round(height)
        });
      };
      handler(getRect(element));
      if (!targetWindow.ResizeObserver) return () => {
      };
      const observer = new targetWindow.ResizeObserver((entries) => {
        const run = () => {
          const entry = entries[0];
          if (entry == null ? void 0 : entry.borderBoxSize) {
            const box = entry.borderBoxSize[0];
            if (box) {
              handler({
                width: box.inlineSize,
                height: box.blockSize
              });
              return;
            }
          }
          handler(getRect(element));
        };
        instance.options.useAnimationFrameWithResizeObserver ? requestAnimationFrame(run) : run();
      });
      observer.observe(element, { box: "border-box" });
      return () => {
        observer.unobserve(element);
      };
    };
    const addEventListenerOptions = { passive: true };
    const supportsScrollend = typeof window == "undefined" ? true : "onscrollend" in window;
    const observeOffset = (instance, cb, readOffset) => {
      const element = instance.scrollElement;
      if (!element) return;
      const targetWindow = instance.targetWindow;
      if (!targetWindow) return;
      const registerScrollendEvent = instance.options.useScrollendEvent && supportsScrollend;
      let offset = 0;
      const fallback = registerScrollendEvent ? null : debounce(targetWindow, () => cb(offset, false), instance.options.isScrollingResetDelay);
      const createHandler = (isScrolling) => () => {
        offset = readOffset(element);
        fallback?.();
        cb(offset, isScrolling);
      };
      const handler = createHandler(true);
      const endHandler = createHandler(false);
      element.addEventListener("scroll", handler, addEventListenerOptions);
      if (registerScrollendEvent) element.addEventListener("scrollend", endHandler, addEventListenerOptions);
      return () => {
        element.removeEventListener("scroll", handler);
        if (registerScrollendEvent) element.removeEventListener("scrollend", endHandler);
      };
    };
    const observeElementOffset = (instance, cb) => observeOffset(instance, cb, (el) => {
      const { horizontal, isRtl } = instance.options;
      return horizontal ? el.scrollLeft * (isRtl && -1 || 1) : el.scrollTop;
    });
    const measureElement = (element, entry, instance) => {
      if (instance.options.useCachedMeasurements) {
        const index = instance.indexFromElement(element);
        const key = instance.options.getItemKey(index);
        return instance.itemSizeCache.get(key) ?? instance.options.estimateSize(index);
      }
      if (entry == null ? void 0 : entry.borderBoxSize) {
        const box = entry.borderBoxSize[0];
        if (box) return Math.round(box[instance.options.horizontal ? "inlineSize" : "blockSize"]);
      }
      if (!entry) {
        const index = instance.indexFromElement(element);
        const key = instance.options.getItemKey(index);
        const cachedSize = instance.itemSizeCache.get(key);
        if (cachedSize !== void 0) return cachedSize;
      }
      return element[instance.options.horizontal ? "offsetWidth" : "offsetHeight"];
    };
    const scrollWithAdjustments = (offset, { adjustments = 0, behavior }, instance) => {
      var _a, _b;
      (_b = (_a = instance.scrollElement) == null ? void 0 : _a.scrollTo) == null || _b.call(_a, {
        [instance.options.horizontal ? "left" : "top"]: offset + adjustments,
        behavior
      });
    };
    const elementScroll = scrollWithAdjustments;
    var Virtualizer = class {
      constructor(opts) {
        this.unsubs = [];
        this.scrollElement = null;
        this.targetWindow = null;
        this.isScrolling = false;
        this.scrollState = null;
        this.measurementsCache = [];
        this._flatMeasurements = null;
        this.itemSizeCache = /* @__PURE__ */ new Map();
        this.itemSizeCacheVersion = 0;
        this.laneAssignments = /* @__PURE__ */ new Map();
        this.pendingMin = null;
        this.prevLanes = void 0;
        this.lanesChangedFlag = false;
        this.lanesSettling = false;
        this.pendingScrollAnchor = null;
        this.scrollRect = null;
        this.scrollOffset = null;
        this.scrollDirection = null;
        this.scrollAdjustments = 0;
        this._iosDeferredAdjustment = 0;
        this._iosTouching = false;
        this._iosJustTouchEnded = false;
        this._iosTouchEndTimerId = null;
        this._intendedScrollOffset = null;
        this.elementsCache = /* @__PURE__ */ new Map();
        this.now = () => {
          var _a, _b, _c;
          return ((_c = (_b = (_a = this.targetWindow) == null ? void 0 : _a.performance) == null ? void 0 : _b.now) == null ? void 0 : _c.call(_b)) ?? Date.now();
        };
        this.observer = /* @__PURE__ */ (() => {
          let _ro = null;
          const get = () => {
            if (_ro) return _ro;
            if (!this.targetWindow || !this.targetWindow.ResizeObserver) return null;
            return _ro = new this.targetWindow.ResizeObserver((entries) => {
              entries.forEach((entry) => {
                const run = () => {
                  const node = entry.target;
                  const index = this.indexFromElement(node);
                  if (!node.isConnected) {
                    this.observer.unobserve(node);
                    for (const [cacheKey, cachedNode] of this.elementsCache) if (cachedNode === node) {
                      this.elementsCache.delete(cacheKey);
                      break;
                    }
                    return;
                  }
                  if (this.shouldMeasureDuringScroll(index)) this.resizeItem(index, this.options.measureElement(node, entry, this));
                };
                this.options.useAnimationFrameWithResizeObserver ? requestAnimationFrame(run) : run();
              });
            });
          };
          return {
            disconnect: () => {
              var _a;
              (_a = get()) == null || _a.disconnect();
              _ro = null;
            },
            observe: (target) => {
              var _a;
              return (_a = get()) == null ? void 0 : _a.observe(target, { box: "border-box" });
            },
            unobserve: (target) => {
              var _a;
              return (_a = get()) == null ? void 0 : _a.unobserve(target);
            }
          };
        })();
        this.range = null;
        this.setOptions = (opts2) => {
          var _a, _b;
          const merged = {
            debug: false,
            initialOffset: 0,
            overscan: 1,
            paddingStart: 0,
            paddingEnd: 0,
            scrollPaddingStart: 0,
            scrollPaddingEnd: 0,
            horizontal: false,
            getItemKey: defaultKeyExtractor,
            rangeExtractor: defaultRangeExtractor,
            onChange: () => {
            },
            measureElement,
            initialRect: {
              width: 0,
              height: 0
            },
            scrollMargin: 0,
            gap: 0,
            indexAttribute: "data-index",
            initialMeasurementsCache: [],
            lanes: 1,
            anchorTo: "start",
            followOnAppend: false,
            scrollEndThreshold: 1,
            isScrollingResetDelay: 150,
            enabled: true,
            isRtl: false,
            useScrollendEvent: false,
            useAnimationFrameWithResizeObserver: false,
            laneAssignmentMode: "estimate",
            useCachedMeasurements: false
          };
          for (const key in opts2) {
            const v = opts2[key];
            if (v !== void 0) merged[key] = v;
          }
          const prevOptions = this.options;
          let anchor = null;
          let followOnAppend = null;
          let edgeKeysChanged = false;
          if (prevOptions !== void 0 && prevOptions.enabled && merged.enabled && merged.anchorTo === "end" && this.scrollElement !== null) {
            const prevCount = prevOptions.count;
            const nextCount = merged.count;
            const measurements = this.getMeasurements();
            const prevFirstKey = prevCount > 0 ? ((_a = measurements[0]) == null ? void 0 : _a.key) ?? prevOptions.getItemKey(0) : null;
            const prevLastKey = prevCount > 0 ? ((_b = measurements[prevCount - 1]) == null ? void 0 : _b.key) ?? prevOptions.getItemKey(prevCount - 1) : null;
            if (nextCount !== prevCount || prevCount > 0 && nextCount > 0 && (merged.getItemKey(0) !== prevFirstKey || merged.getItemKey(nextCount - 1) !== prevLastKey)) {
              edgeKeysChanged = true;
              const item = prevCount > 0 ? this.getVirtualItemForOffset(this.getScrollOffset()) ?? measurements[0] : null;
              if (item) anchor = [item.key, this.getScrollOffset() - item.start];
              const behavior = merged.followOnAppend === true ? "auto" : merged.followOnAppend || null;
              if (behavior && nextCount > prevCount && this.isAtEnd(prevOptions.scrollEndThreshold) && (prevCount === 0 || merged.getItemKey(nextCount - 1) !== prevLastKey)) followOnAppend = behavior;
            }
          }
          this.options = merged;
          if (edgeKeysChanged) {
            this.pendingMin = 0;
            this.itemSizeCacheVersion++;
          }
          let anchorResolved = false;
          let anchorDelta = 0;
          if (anchor && this.scrollOffset !== null) {
            const [anchorKey, anchorOffset] = anchor;
            const newMeasurements = this.getMeasurements();
            const { count, getItemKey } = this.options;
            let idx = 0;
            while (idx < count && getItemKey(idx) !== anchorKey) idx++;
            if (idx < count) {
              const anchorItem = newMeasurements[idx];
              if (anchorItem) {
                const newOffset = Math.max(0, anchorItem.start + anchorOffset);
                if (newOffset !== this.scrollOffset) {
                  anchorDelta = newOffset - this.scrollOffset;
                  this.scrollOffset = newOffset;
                  anchorResolved = true;
                }
              }
            }
          }
          if (anchorResolved || followOnAppend) this.pendingScrollAnchor = [
            anchorResolved ? anchor[0] : null,
            anchorResolved ? anchor[1] : 0,
            followOnAppend,
            anchorDelta
          ];
        };
        this.notify = (sync) => {
          var _a, _b;
          (_b = (_a = this.options).onChange) == null || _b.call(_a, this, sync);
        };
        this.maybeNotify = memo$11(() => {
          this.calculateRange();
          return [
            this.isScrolling,
            this.range ? this.range.startIndex : null,
            this.range ? this.range.endIndex : null
          ];
        }, (isScrolling) => {
          this.notify(isScrolling);
        }, {
          key: false,
          debug: () => this.options.debug,
          initialDeps: [
            this.isScrolling,
            this.range ? this.range.startIndex : null,
            this.range ? this.range.endIndex : null
          ]
        });
        this.cleanup = () => {
          this.unsubs.filter(Boolean).forEach((d) => d());
          this.unsubs = [];
          this.observer.disconnect();
          if (this.rafId != null && this.targetWindow) {
            this.targetWindow.cancelAnimationFrame(this.rafId);
            this.rafId = null;
          }
          this.scrollState = null;
          this._iosDeferredAdjustment = 0;
          this._iosTouching = false;
          this._iosJustTouchEnded = false;
          this.scrollElement = null;
          this.targetWindow = null;
        };
        this._didMount = () => {
          return () => {
            this.cleanup();
          };
        };
        this._willUpdate = () => {
          var _a;
          const scrollElement = this.options.enabled ? this.options.getScrollElement() : null;
          if (this.scrollElement !== scrollElement) {
            this.cleanup();
            if (!scrollElement) {
              this.maybeNotify();
              return;
            }
            this.scrollElement = scrollElement;
            if (this.scrollElement && "ownerDocument" in this.scrollElement) this.targetWindow = this.scrollElement.ownerDocument.defaultView;
            else this.targetWindow = ((_a = this.scrollElement) == null ? void 0 : _a.window) ?? null;
            this.elementsCache.forEach((cached) => {
              this.observer.observe(cached);
            });
            this.unsubs.push(this.options.observeElementRect(this, (rect) => {
              this.scrollRect = rect;
              this.maybeNotify();
            }));
            this.unsubs.push(this.options.observeElementOffset(this, (offset, isScrolling) => {
              if (isScrolling && this._intendedScrollOffset === null && offset === this.scrollOffset) return;
              if (this._intendedScrollOffset !== null && Math.abs(offset - this._intendedScrollOffset) < 1.5) offset = this._intendedScrollOffset;
              this._intendedScrollOffset = null;
              this.scrollAdjustments = 0;
              const prevOffset = this.getScrollOffset();
              this.scrollDirection = isScrolling ? prevOffset === offset ? this.scrollDirection : prevOffset < offset ? "forward" : "backward" : null;
              this.scrollOffset = offset;
              this.isScrolling = isScrolling;
              this._flushIosDeferredIfReady();
              if (this.scrollState) this.scheduleScrollReconcile();
              this.maybeNotify();
            }));
            if ("addEventListener" in this.scrollElement) {
              const scrollEl = this.scrollElement;
              const onTouchStart = () => {
                this._iosTouching = true;
                this._iosJustTouchEnded = false;
                if (this._iosTouchEndTimerId !== null && this.targetWindow != null) {
                  this.targetWindow.clearTimeout(this._iosTouchEndTimerId);
                  this._iosTouchEndTimerId = null;
                }
              };
              const onTouchEnd = () => {
                this._iosTouching = false;
                if (!isIOSWebKit() || this.targetWindow == null) return;
                this._iosJustTouchEnded = true;
                this._iosTouchEndTimerId = this.targetWindow.setTimeout(() => {
                  this._iosJustTouchEnded = false;
                  this._iosTouchEndTimerId = null;
                  this._flushIosDeferredIfReady();
                }, 150);
              };
              scrollEl.addEventListener("touchstart", onTouchStart, addEventListenerOptions);
              scrollEl.addEventListener("touchend", onTouchEnd, addEventListenerOptions);
              this.unsubs.push(() => {
                scrollEl.removeEventListener("touchstart", onTouchStart);
                scrollEl.removeEventListener("touchend", onTouchEnd);
                if (this._iosTouchEndTimerId !== null && this.targetWindow != null) {
                  this.targetWindow.clearTimeout(this._iosTouchEndTimerId);
                  this._iosTouchEndTimerId = null;
                }
              });
            }
            this._scrollToOffset(this.getScrollOffset(), {
              adjustments: void 0,
              behavior: void 0
            });
          }
          const anchor = this.pendingScrollAnchor;
          this.pendingScrollAnchor = null;
          if (anchor && this.scrollElement && this.options.enabled) {
            const [key, _offset, followOnAppend, anchorDelta] = anchor;
            if (key !== null && !followOnAppend) if (isIOSWebKit() && (this.isScrolling || this._iosTouching || this._iosJustTouchEnded)) {
              if (anchorDelta !== 0) this._iosDeferredAdjustment += anchorDelta;
            } else this._scrollToOffset(this.getScrollOffset(), {
              adjustments: void 0,
              behavior: void 0
            });
            if (followOnAppend) this.scrollToEnd({ behavior: followOnAppend });
          }
        };
        this._flushIosDeferredIfReady = () => {
          if (this._iosDeferredAdjustment === 0) return;
          if (this.isScrolling) return;
          if (this._iosTouching) return;
          if (this._iosJustTouchEnded) return;
          const cur = this.getScrollOffset();
          const max = this.getMaxScrollOffset();
          if (cur < 0 || cur > max) return;
          if (this._iosDeferredAdjustment < 0 && cur >= max - 1) {
            this._iosDeferredAdjustment = 0;
            return;
          }
          const delta = this._iosDeferredAdjustment;
          this._iosDeferredAdjustment = 0;
          this._scrollToOffset(cur, {
            adjustments: this.scrollAdjustments += delta,
            behavior: void 0
          });
        };
        this.rafId = null;
        this.getSize = () => {
          if (!this.options.enabled) {
            this.scrollRect = null;
            return 0;
          }
          this.scrollRect = this.scrollRect ?? this.options.initialRect;
          return this.scrollRect[this.options.horizontal ? "width" : "height"];
        };
        this.getScrollOffset = () => {
          if (!this.options.enabled) {
            this.scrollOffset = null;
            return 0;
          }
          this.scrollOffset = this.scrollOffset ?? (typeof this.options.initialOffset === "function" ? this.options.initialOffset() : this.options.initialOffset);
          return this.scrollOffset;
        };
        this.getMeasurementOptions = memo$11(() => [
          this.options.count,
          this.options.paddingStart,
          this.options.scrollMargin,
          this.options.getItemKey,
          this.options.enabled,
          this.options.lanes,
          this.options.laneAssignmentMode,
          this.options.gap
        ], (count, paddingStart, scrollMargin, getItemKey, enabled, lanes, laneAssignmentMode, gap) => {
          if (this.prevLanes !== void 0 && this.prevLanes !== lanes) this.lanesChangedFlag = true;
          this.prevLanes = lanes;
          this.pendingMin = null;
          return {
            count,
            paddingStart,
            scrollMargin,
            getItemKey,
            enabled,
            lanes,
            laneAssignmentMode,
            gap
          };
        }, { key: false });
        this.getMeasurements = memo$11(() => [this.getMeasurementOptions(), this.itemSizeCacheVersion], ({ count, paddingStart, scrollMargin, getItemKey, enabled, lanes, laneAssignmentMode, gap }, _itemSizeCacheVersion) => {
          const itemSizeCache = this.itemSizeCache;
          if (!enabled) {
            this.measurementsCache = [];
            this.itemSizeCache.clear();
            this.laneAssignments.clear();
            return [];
          }
          if (this.laneAssignments.size > count) {
            for (const index of this.laneAssignments.keys()) if (index >= count) this.laneAssignments.delete(index);
          }
          if (this.lanesChangedFlag) {
            this.lanesChangedFlag = false;
            this.lanesSettling = true;
            this.measurementsCache = [];
            this.itemSizeCache.clear();
            this.laneAssignments.clear();
            this.pendingMin = null;
          }
          if (this.measurementsCache.length === 0 && !this.lanesSettling) {
            this.measurementsCache = this.options.initialMeasurementsCache;
            this.measurementsCache.forEach((item) => {
              this.itemSizeCache.set(item.key, item.size);
            });
          }
          const min = this.lanesSettling ? 0 : this.pendingMin ?? 0;
          this.pendingMin = null;
          if (this.lanesSettling && this.measurementsCache.length === count) this.lanesSettling = false;
          if (lanes === 1) {
            const need = count * 2;
            let flat = this._flatMeasurements;
            if (!flat || flat.length < need) {
              const next = new Float64Array(need);
              if (flat && min > 0) next.set(flat.subarray(0, min * 2));
              flat = next;
              this._flatMeasurements = flat;
            }
            let runningStart;
            if (min === 0) runningStart = paddingStart + scrollMargin;
            else {
              const prevIdx = min - 1;
              runningStart = flat[prevIdx * 2] + flat[prevIdx * 2 + 1] + gap;
            }
            for (let i = min; i < count; i++) {
              const key = getItemKey(i);
              const measuredSize = itemSizeCache.get(key);
              const size = typeof measuredSize === "number" ? measuredSize : this.options.estimateSize(i);
              flat[i * 2] = runningStart;
              flat[i * 2 + 1] = size;
              runningStart += size + gap;
            }
            const view = createLazyMeasurementsView(count, flat, getItemKey);
            this.measurementsCache = view;
            return view;
          }
          const measurements = this.measurementsCache.slice(0, min);
          const laneLastIndex = new Array(lanes).fill(void 0);
          const laneEnds = new Float64Array(lanes);
          let filledLanes = 0;
          for (let m = 0; m < min; m++) {
            const item = measurements[m];
            if (item) {
              if (laneLastIndex[item.lane] === void 0) filledLanes++;
              laneLastIndex[item.lane] = m;
              laneEnds[item.lane] = item.end;
            }
          }
          for (let i = min; i < count; i++) {
            const key = getItemKey(i);
            const cachedLane = this.laneAssignments.get(i);
            let lane;
            let start;
            const shouldCacheLane = laneAssignmentMode === "estimate" || itemSizeCache.has(key);
            if (cachedLane !== void 0 && this.options.lanes > 1) {
              lane = cachedLane;
              const prevIndex = laneLastIndex[lane];
              const prevInLane = prevIndex !== void 0 ? measurements[prevIndex] : void 0;
              start = prevInLane ? prevInLane.end + gap : paddingStart + scrollMargin;
            } else if (filledLanes === lanes) {
              let bestLane = 0;
              let bestEnd = laneEnds[0];
              let bestIdx = laneLastIndex[0];
              for (let l = 1; l < lanes; l++) {
                const e = laneEnds[l];
                if (e < bestEnd || e === bestEnd && laneLastIndex[l] < bestIdx) {
                  bestLane = l;
                  bestEnd = e;
                  bestIdx = laneLastIndex[l];
                }
              }
              lane = bestLane;
              start = bestEnd + gap;
              if (shouldCacheLane) this.laneAssignments.set(i, lane);
            } else {
              lane = i % this.options.lanes;
              start = paddingStart + scrollMargin;
              if (shouldCacheLane) this.laneAssignments.set(i, lane);
            }
            const measuredSize = itemSizeCache.get(key);
            const size = typeof measuredSize === "number" ? measuredSize : this.options.estimateSize(i);
            const end = start + size;
            measurements[i] = {
              index: i,
              start,
              size,
              end,
              key,
              lane
            };
            if (laneLastIndex[lane] === void 0) filledLanes++;
            laneLastIndex[lane] = i;
            laneEnds[lane] = end;
          }
          this.measurementsCache = measurements;
          return measurements;
        }, {
          key: false,
          debug: () => this.options.debug
        });
        this.calculateRange = memo$11(() => [
          this.getMeasurements(),
          this.getSize(),
          this.getScrollOffset(),
          this.options.lanes
        ], (measurements, outerSize, scrollOffset, lanes) => {
          if (measurements.length === 0 || outerSize === 0) {
            this.range = null;
            return null;
          }
          this.range = calculateRangeImpl(measurements, outerSize, scrollOffset, lanes, lanes === 1 && this._flatMeasurements != null ? this._flatMeasurements : null);
          return this.range;
        }, {
          key: false,
          debug: () => this.options.debug
        });
        this.getVirtualIndexes = memo$11(() => {
          let startIndex = null;
          let endIndex = null;
          const range = this.calculateRange();
          if (range) {
            startIndex = range.startIndex;
            endIndex = range.endIndex;
          }
          this.maybeNotify.updateDeps([
            this.isScrolling,
            startIndex,
            endIndex
          ]);
          return [
            this.options.rangeExtractor,
            this.options.overscan,
            this.options.count,
            startIndex,
            endIndex
          ];
        }, (rangeExtractor, overscan, count, startIndex, endIndex) => {
          return startIndex === null || endIndex === null ? [] : rangeExtractor({
            startIndex,
            endIndex,
            overscan,
            count
          });
        }, {
          key: false,
          debug: () => this.options.debug
        });
        this.indexFromElement = (node) => {
          const attributeName = this.options.indexAttribute;
          const indexStr = node.getAttribute(attributeName);
          if (!indexStr) {
            console.warn(`Missing attribute name '${attributeName}={index}' on measured element.`);
            return -1;
          }
          return parseInt(indexStr, 10);
        };
        this.shouldMeasureDuringScroll = (index) => {
          var _a;
          if (!this.scrollState || this.scrollState.behavior !== "smooth") return true;
          const scrollIndex = this.scrollState.index ?? ((_a = this.getVirtualItemForOffset(this.scrollState.lastTargetOffset)) == null ? void 0 : _a.index);
          if (scrollIndex !== void 0 && this.range) {
            const bufferSize = Math.max(this.options.overscan, Math.ceil((this.range.endIndex - this.range.startIndex) / 2));
            const minIndex = Math.max(0, scrollIndex - bufferSize);
            const maxIndex = Math.min(this.options.count - 1, scrollIndex + bufferSize);
            return index >= minIndex && index <= maxIndex;
          }
          return true;
        };
        this.measureElement = (node) => {
          if (!node) {
            this.elementsCache.forEach((cached, key2) => {
              if (!cached.isConnected) {
                this.observer.unobserve(cached);
                this.elementsCache.delete(key2);
              }
            });
            return;
          }
          const index = this.indexFromElement(node);
          const key = this.options.getItemKey(index);
          const prevNode = this.elementsCache.get(key);
          if (prevNode !== node) {
            if (prevNode) this.observer.unobserve(prevNode);
            this.observer.observe(node);
            this.elementsCache.set(key, node);
          }
          if ((!this.isScrolling || this.scrollState) && this.shouldMeasureDuringScroll(index)) this.resizeItem(index, this.options.measureElement(node, void 0, this));
        };
        this.resizeItem = (index, size) => {
          var _a, _b;
          if (index < 0 || index >= this.options.count) return;
          let cachedSize;
          let itemStart;
          let key;
          const flat = this._flatMeasurements;
          if (this.options.lanes === 1 && flat !== null) {
            key = this.options.getItemKey(index);
            itemStart = flat[index * 2];
            cachedSize = flat[index * 2 + 1];
          } else {
            const item = this.measurementsCache[index];
            if (!item) return;
            key = item.key;
            itemStart = item.start;
            cachedSize = item.size;
          }
          const itemSize = this.itemSizeCache.get(key) ?? cachedSize;
          const delta = size - itemSize;
          if (delta !== 0) {
            const wasAtEnd = this.options.anchorTo === "end" && ((_a = this.scrollState) == null ? void 0 : _a.behavior) !== "smooth" && this.getVirtualDistanceFromEnd() <= this.options.scrollEndThreshold;
            const prevTotalSize = wasAtEnd ? this.getTotalSize() : 0;
            const scrollOffsetWithAdj = this.getScrollOffset() + this.scrollAdjustments;
            const defaultShouldAdjust = !this.itemSizeCache.has(key) ? itemStart < scrollOffsetWithAdj : itemStart + itemSize <= scrollOffsetWithAdj && this.scrollDirection !== "backward";
            const shouldAdjustScroll = ((_b = this.scrollState) == null ? void 0 : _b.behavior) !== "smooth" && (this.shouldAdjustScrollPositionOnItemSizeChange !== void 0 ? this.shouldAdjustScrollPositionOnItemSizeChange(this.measurementsCache[index] ?? {
              index,
              key,
              start: itemStart,
              size: cachedSize,
              end: itemStart + cachedSize,
              lane: 0
            }, delta, this) : defaultShouldAdjust);
            if (this.pendingMin === null || index < this.pendingMin) this.pendingMin = index;
            this.itemSizeCache.set(key, size);
            this.itemSizeCacheVersion++;
            let adjustedSync = false;
            if (wasAtEnd) adjustedSync = this.applyScrollAdjustment(this.getTotalSize() - prevTotalSize);
            else if (shouldAdjustScroll) adjustedSync = this.applyScrollAdjustment(delta);
            this.notify(adjustedSync);
          }
        };
        this.getVirtualItems = memo$11(() => [this.getVirtualIndexes(), this.getMeasurements()], (indexes, measurements) => {
          const virtualItems = [];
          for (let k = 0, len = indexes.length; k < len; k++) {
            const measurement = measurements[indexes[k]];
            virtualItems.push(measurement);
          }
          return virtualItems;
        }, {
          key: false,
          debug: () => this.options.debug
        });
        this.getVirtualItemForOffset = (offset) => {
          const measurements = this.getMeasurements();
          if (measurements.length === 0) return;
          const flat = this._flatMeasurements;
          const useFlat = this.options.lanes === 1 && flat != null;
          return notUndefined(measurements[findNearestBinarySearch(0, measurements.length - 1, useFlat ? (i) => flat[i * 2] : (i) => notUndefined(measurements[i]).start, offset)]);
        };
        this.getMaxScrollOffset = () => {
          if (!this.scrollElement) return 0;
          if ("scrollHeight" in this.scrollElement) return this.options.horizontal ? this.scrollElement.scrollWidth - this.scrollElement.clientWidth : this.scrollElement.scrollHeight - this.scrollElement.clientHeight;
          else {
            const doc = this.scrollElement.document.documentElement;
            return this.options.horizontal ? doc.scrollWidth - this.scrollElement.innerWidth : doc.scrollHeight - this.scrollElement.innerHeight;
          }
        };
        this.getVirtualDistanceFromEnd = () => {
          return Math.max(this.getTotalSize() - this.getSize() - this.getScrollOffset(), 0);
        };
        this.getDistanceFromEnd = () => {
          return Math.max(this.getMaxScrollOffset() - this.getScrollOffset(), 0);
        };
        this.isAtEnd = (threshold = this.options.scrollEndThreshold) => {
          return this.getDistanceFromEnd() <= threshold;
        };
        this.getOffsetForAlignment = (toOffset, align, itemSize = 0) => {
          if (!this.scrollElement) return 0;
          const size = this.getSize();
          const scrollOffset = this.getScrollOffset();
          if (align === "auto") align = toOffset >= scrollOffset + size ? "end" : "start";
          if (align === "center") toOffset += (itemSize - size) / 2;
          else if (align === "end") toOffset -= size;
          const maxOffset = this.getMaxScrollOffset();
          return Math.max(Math.min(maxOffset, toOffset), 0);
        };
        this.getOffsetForIndex = (index, align = "auto") => {
          index = Math.max(0, Math.min(index, this.options.count - 1));
          const size = this.getSize();
          const scrollOffset = this.getScrollOffset();
          const item = this.measurementsCache[index];
          if (!item) return;
          if (align === "auto") if (item.end >= scrollOffset + size - this.options.scrollPaddingEnd) align = "end";
          else if (item.start <= scrollOffset + this.options.scrollPaddingStart) align = "start";
          else return [scrollOffset, align];
          if (align === "end" && index === this.options.count - 1) return [this.getMaxScrollOffset(), align];
          const toOffset = align === "end" ? item.end + this.options.scrollPaddingEnd : item.start - this.options.scrollPaddingStart;
          return [this.getOffsetForAlignment(toOffset, align, item.size), align];
        };
        this.scrollToOffset = (toOffset, { align = "start", behavior = "auto" } = {}) => {
          this._iosDeferredAdjustment = 0;
          const offset = this.getOffsetForAlignment(toOffset, align);
          const now = this.now();
          this.scrollState = {
            index: null,
            align,
            behavior,
            startedAt: now,
            lastTargetOffset: offset,
            stableFrames: 0
          };
          this._scrollToOffset(offset, {
            adjustments: void 0,
            behavior
          });
          this.scheduleScrollReconcile();
        };
        this.scrollToIndex = (index, { align: initialAlign = "auto", behavior = "auto" } = {}) => {
          this._iosDeferredAdjustment = 0;
          index = Math.max(0, Math.min(index, this.options.count - 1));
          const offsetInfo = this.getOffsetForIndex(index, initialAlign);
          if (!offsetInfo) return;
          const [offset, align] = offsetInfo;
          const now = this.now();
          this.scrollState = {
            index,
            align,
            behavior,
            startedAt: now,
            lastTargetOffset: offset,
            stableFrames: 0
          };
          this._scrollToOffset(offset, {
            adjustments: void 0,
            behavior
          });
          this.scheduleScrollReconcile();
        };
        this.scrollBy = (delta, { behavior = "auto" } = {}) => {
          const offset = this.getScrollOffset() + delta;
          const now = this.now();
          this.scrollState = {
            index: null,
            align: "start",
            behavior,
            startedAt: now,
            lastTargetOffset: offset,
            stableFrames: 0
          };
          this._scrollToOffset(offset, {
            adjustments: void 0,
            behavior
          });
          this.scheduleScrollReconcile();
        };
        this.scrollToEnd = ({ behavior = "auto" } = {}) => {
          if (this.options.count > 0) {
            this.scrollToIndex(this.options.count - 1, {
              align: "end",
              behavior
            });
            return;
          }
          this.scrollToOffset(Math.max(this.getTotalSize() - this.getSize(), 0), { behavior });
        };
        this.getTotalSize = () => {
          var _a;
          const measurements = this.getMeasurements();
          let end;
          if (measurements.length === 0) end = this.options.paddingStart;
          else if (this.options.lanes === 1) {
            const lastIdx = measurements.length - 1;
            const flat = this._flatMeasurements;
            if (flat != null) end = flat[lastIdx * 2] + flat[lastIdx * 2 + 1];
            else end = ((_a = measurements[lastIdx]) == null ? void 0 : _a.end) ?? 0;
          } else {
            const endByLane = Array(this.options.lanes).fill(null);
            let endIndex = measurements.length - 1;
            while (endIndex >= 0 && endByLane.some((val) => val === null)) {
              const item = measurements[endIndex];
              if (endByLane[item.lane] === null) endByLane[item.lane] = item.end;
              endIndex--;
            }
            end = Math.max(...endByLane.filter((val) => val !== null));
          }
          return Math.max(end - this.options.scrollMargin + this.options.paddingEnd, 0);
        };
        this.takeSnapshot = () => {
          const snapshot2 = [];
          if (this.itemSizeCache.size === 0) return snapshot2;
          const m = this.getMeasurements();
          for (const item of m) if (item && this.itemSizeCache.has(item.key)) snapshot2.push({
            index: item.index,
            key: item.key,
            start: item.start,
            size: item.size,
            end: item.end,
            lane: item.lane
          });
          return snapshot2;
        };
        this._scrollToOffset = (offset, { adjustments, behavior }) => {
          this._intendedScrollOffset = offset + (adjustments ?? 0);
          this.options.scrollToFn(offset, {
            behavior,
            adjustments
          }, this);
        };
        this.measure = () => {
          this.pendingMin = null;
          this.itemSizeCache.clear();
          this.laneAssignments.clear();
          this.itemSizeCacheVersion++;
          this.notify(false);
        };
        this.setOptions(opts);
      }
      applyScrollAdjustment(delta, behavior) {
        if (delta === 0) return false;
        if (isIOSWebKit() && (this.isScrolling || this._iosTouching || this._iosJustTouchEnded)) {
          this._iosDeferredAdjustment += delta;
          return false;
        } else {
          this._scrollToOffset(this.getScrollOffset(), {
            adjustments: this.scrollAdjustments += delta,
            behavior
          });
          if (this.scrollOffset !== null) {
            this.scrollOffset += this.scrollAdjustments;
            if (this.scrollOffset < 0) this.scrollOffset = 0;
            this.scrollAdjustments = 0;
          }
          return true;
        }
      }
      scheduleScrollReconcile() {
        if (!this.targetWindow) {
          this.scrollState = null;
          return;
        }
        if (this.rafId != null) return;
        this.rafId = this.targetWindow.requestAnimationFrame(() => {
          this.rafId = null;
          this.reconcileScroll();
        });
      }
      reconcileScroll() {
        if (!this.scrollState) return;
        if (!this.scrollElement) return;
        if (this.now() - this.scrollState.startedAt > 5e3) {
          this.scrollState = null;
          return;
        }
        const offsetInfo = this.scrollState.index != null ? this.getOffsetForIndex(this.scrollState.index, this.scrollState.align) : void 0;
        const targetOffset = offsetInfo ? offsetInfo[0] : this.scrollState.lastTargetOffset;
        const STABLE_FRAMES = 1;
        const targetChanged = targetOffset !== this.scrollState.lastTargetOffset;
        if (!targetChanged && approxEqual(targetOffset, this.getScrollOffset())) {
          this.scrollState.stableFrames++;
          if (this.scrollState.stableFrames >= STABLE_FRAMES) {
            if (this.getScrollOffset() !== targetOffset) this._scrollToOffset(targetOffset, {
              adjustments: void 0,
              behavior: "auto"
            });
            this.scrollState = null;
            return;
          }
        } else {
          this.scrollState.stableFrames = 0;
          if (targetChanged) {
            const viewport = this.getSize() || 600;
            const distance = Math.abs(targetOffset - this.getScrollOffset());
            const keepSmooth = this.scrollState.behavior === "smooth" && distance > viewport;
            this.scrollState.lastTargetOffset = targetOffset;
            if (!keepSmooth) this.scrollState.behavior = "auto";
            this._scrollToOffset(targetOffset, {
              adjustments: void 0,
              behavior: keepSmooth ? "smooth" : "auto"
            });
          }
        }
        this.scheduleScrollReconcile();
      }
    };
    const findNearestBinarySearch = (low, high, getCurrentValue, value) => {
      while (low <= high) {
        const middle = (low + high) / 2 | 0;
        const currentValue = getCurrentValue(middle);
        if (currentValue < value) low = middle + 1;
        else if (currentValue > value) high = middle - 1;
        else return middle;
      }
      if (low > 0) return low - 1;
      else return 0;
    };
    function findNearestBinarySearchFlat(flat, high, value) {
      let low = 0;
      while (low <= high) {
        const middle = (low + high) / 2 | 0;
        const currentValue = flat[middle * 2];
        if (currentValue < value) low = middle + 1;
        else if (currentValue > value) high = middle - 1;
        else return middle;
      }
      return low > 0 ? low - 1 : 0;
    }
    function calculateRangeImpl(measurements, outerSize, scrollOffset, lanes, flat) {
      const lastIndex = measurements.length - 1;
      if (measurements.length <= lanes) return {
        startIndex: 0,
        endIndex: lastIndex
      };
      if (lanes === 1 && flat !== null) {
        const startIndex2 = findNearestBinarySearchFlat(flat, lastIndex, scrollOffset);
        let endIndex2 = startIndex2;
        const limit = scrollOffset + outerSize;
        while (endIndex2 < lastIndex && flat[endIndex2 * 2] + flat[endIndex2 * 2 + 1] < limit) endIndex2++;
        return {
          startIndex: startIndex2,
          endIndex: endIndex2
        };
      }
      const getStart = (index) => measurements[index].start;
      let startIndex = findNearestBinarySearch(0, lastIndex, getStart, scrollOffset);
      let endIndex = startIndex;
      if (lanes === 1) while (endIndex < lastIndex && measurements[endIndex].end < scrollOffset + outerSize) endIndex++;
      else if (lanes > 1) {
        const endPerLane = Array(lanes).fill(0);
        while (endIndex < lastIndex && endPerLane.some((pos) => pos < scrollOffset + outerSize)) {
          const item = measurements[endIndex];
          endPerLane[item.lane] = item.end;
          endIndex++;
        }
        const startPerLane = Array(lanes).fill(scrollOffset + outerSize);
        while (startIndex >= 0 && startPerLane.some((pos) => pos >= scrollOffset)) {
          const item = measurements[startIndex];
          startPerLane[item.lane] = item.start;
          startIndex--;
        }
        startIndex = Math.max(0, startIndex - startIndex % lanes);
        endIndex = Math.min(lastIndex, endIndex + (lanes - 1 - endIndex % lanes));
      }
      return {
        startIndex,
        endIndex
      };
    }
    const useIsomorphicLayoutEffect = typeof document !== "undefined" ? react.useLayoutEffect : react.useEffect;
    function useVirtualizerBase({ useFlushSync = true, directDomUpdates = false, directDomUpdatesMode = "transform", ...options }) {
      const rerender = react.useReducer((x) => x + 1, 0)[1];
      const directRef = react.useRef({
        enabled: directDomUpdates,
        mode: directDomUpdatesMode,
        container: null,
        lastSize: null,
        lastPositions: /* @__PURE__ */ new WeakMap(),
        prevRange: null
      });
      directRef.current.enabled = directDomUpdates;
      directRef.current.mode = directDomUpdatesMode;
      const applyContainerSize = (instance2) => {
        const state = directRef.current;
        if (!state.enabled || !state.container) return;
        const totalSize = instance2.getTotalSize();
        if (totalSize !== state.lastSize) {
          state.lastSize = totalSize;
          const sizeAxis = instance2.options.horizontal ? "width" : "height";
          state.container.style[sizeAxis] = `${totalSize}px`;
        }
      };
      const applyDirectStyles = (instance2) => {
        const state = directRef.current;
        if (!state.enabled || !state.container) return;
        applyContainerSize(instance2);
        const horizontal = !!instance2.options.horizontal;
        const useTransform = state.mode === "transform";
        const posAxis = horizontal ? "left" : "top";
        const scrollMargin = instance2.options.scrollMargin;
        const items = instance2.getVirtualItems();
        for (const item of items) {
          const next = item.start - scrollMargin;
          const el = instance2.elementsCache.get(item.key);
          if (!el) continue;
          if (state.lastPositions.get(el) === next) continue;
          state.lastPositions.set(el, next);
          if (useTransform) el.style.transform = horizontal ? `translate3d(${next}px, 0, 0)` : `translate3d(0, ${next}px, 0)`;
          else el.style[posAxis] = `${next}px`;
        }
      };
      const resolvedOptions = {
        ...options,
        onChange: (instance2, sync) => {
          var _a;
          const state = directRef.current;
          let shouldRerender = true;
          if (state.enabled) {
            applyDirectStyles(instance2);
            const range = instance2.range;
            const prev = state.prevRange;
            shouldRerender = !prev || prev.isScrolling !== instance2.isScrolling || prev.startIndex !== (range == null ? void 0 : range.startIndex) || prev.endIndex !== (range == null ? void 0 : range.endIndex);
            if (shouldRerender) state.prevRange = range ? {
              startIndex: range.startIndex,
              endIndex: range.endIndex,
              isScrolling: instance2.isScrolling
            } : null;
          }
          if (shouldRerender) if (useFlushSync && sync) (0, react_dom.flushSync)(rerender);
          else rerender();
          (_a = options.onChange) == null || _a.call(options, instance2, sync);
        }
      };
      const [instance] = react.useState(() => {
        const v = new Virtualizer(resolvedOptions);
        return Object.assign(v, { containerRef: (node) => {
          const state = directRef.current;
          state.container = node;
          state.lastSize = null;
          if (node && state.enabled) {
            const total = v.getTotalSize();
            state.lastSize = total;
            const axis = v.options.horizontal ? "width" : "height";
            node.style[axis] = `${total}px`;
          }
        } });
      });
      instance.setOptions(resolvedOptions);
      useIsomorphicLayoutEffect(() => {
        return instance._didMount();
      }, []);
      useIsomorphicLayoutEffect(() => {
        applyContainerSize(instance);
        return instance._willUpdate();
      });
      useIsomorphicLayoutEffect(() => {
        applyDirectStyles(instance);
      });
      return instance;
    }
    function useVirtualizer(options) {
      return useVirtualizerBase({
        observeElementRect,
        observeElementOffset,
        scrollToFn: elementScroll,
        ...options
      });
    }
    const css$11 = '.eGxaPq_slot{z-index:7;height:0;padding-inline:calc(var(--dsh-composer-side-clearance) + 16px);pointer-events:none;position:absolute;top:0;left:0;right:0;container-type:inline-size}[data-conversation-scroll] .eGxaPq_slot{position:sticky}.eGxaPq_frame{--turn-rail-band:calc(var(--dsh-conversation-viewport-height,100dvh) - var(--dsh-composer-height,152px));--turn-preview-height:100px;top:calc(var(--turn-rail-band) / 2);width:28px;max-height:min(max(0px, calc(var(--turn-rail-band) - 64px)), 420px);contain:layout;cursor:pointer;pointer-events:auto;position:absolute;right:12px;transform:translateY(-50%)}.eGxaPq_scroller{max-height:inherit;overscroll-behavior:contain;scrollbar-width:none;position:relative;overflow-y:auto}.eGxaPq_scroller::-webkit-scrollbar{display:none}.eGxaPq_fadeTop{mask-image:linear-gradient(#0000 0,#000 24px 100%)}.eGxaPq_fadeBottom{mask-image:linear-gradient(#000 0 calc(100% - 24px),#0000 100%)}.eGxaPq_fadeTop.eGxaPq_fadeBottom{mask-image:linear-gradient(#0000 0,#000 24px calc(100% - 24px),#0000 100%)}.eGxaPq_marks{position:relative}.eGxaPq_mark{cursor:pointer;background:0 0;border:0;border-radius:8px;height:10px;padding:0;position:absolute;top:0;left:0;right:0}.eGxaPq_mark:before{background:var(--dsw-alias-border-l4);content:"";transform-origin:100%;border-radius:2px;width:20px;height:2px;transition:transform .14s,background-color .14s;position:absolute;top:50%;right:0;transform:translateY(-50%)scaleX(.6)}.eGxaPq_markUnloaded:before{opacity:.6;transform:translateY(-50%)scaleX(.4)}.eGxaPq_markPreview:before{background:var(--dsw-alias-label-tertiary);transform:translateY(-50%)scaleX(.9)}.eGxaPq_markBusy:before{animation:1s ease-in-out infinite eGxaPq_dsh-turn-mark-busy}.eGxaPq_markActive:before{background:var(--dsw-alias-label-primary);transform:translateY(-50%)scaleX(1)}.eGxaPq_mark:focus-visible:before{background:var(--dsw-alias-state-business-primary);transform:translateY(-50%)scaleX(1)}.eGxaPq_mark:focus-visible{outline:none}.eGxaPq_mark:focus-visible:after{border-radius:inherit;outline:1px solid var(--dsw-alias-state-business-primary);outline-offset:2px;content:"";width:20px;position:absolute;inset:0 0 0 auto}.eGxaPq_preview{top:clamp(0px, calc(var(--turn-preview-center) - var(--turn-preview-height) / 2), calc(100% - var(--turn-preview-height)));box-sizing:border-box;width:min(300px,100cqw - 120px);max-height:var(--turn-preview-height);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel);pointer-events:none;border:0;border-radius:10px;padding:10px 12px;transition:top .14s cubic-bezier(.2,.8,.2,1);animation:.12s ease-out eGxaPq_dsh-turn-preview-enter;position:absolute;right:calc(100% + 10px);overflow:hidden}.eGxaPq_previewPrompt,.eGxaPq_previewResponse{-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.eGxaPq_previewPrompt{font:var(--dsw-font-xs-strong-13);-webkit-line-clamp:1}.eGxaPq_previewResponse{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xxs-12);-webkit-line-clamp:3;margin-top:4px}@keyframes eGxaPq_dsh-turn-preview-enter{0%{opacity:0;transform:translate(4px)}to{opacity:1;transform:translate(0)}}@keyframes eGxaPq_dsh-turn-mark-busy{0%,to{opacity:1}50%{opacity:.35}}@container (width<=900px){.eGxaPq_frame{display:none}}@media (prefers-reduced-motion:reduce){.eGxaPq_frame,.eGxaPq_scroller,.eGxaPq_mark:before,.eGxaPq_markBusy:before,.eGxaPq_preview{scroll-behavior:auto;transition:none;animation:none}}';
    const tagId$11 = "@deepseek-ai/dsh-client-ui-chat/TurnNavigator.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$11) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$11;
      tag.textContent = css$11;
      document.head.appendChild(tag);
    }
    var TurnNavigator_module_css_default = {
      "dsh-turn-mark-busy": "eGxaPq_dsh-turn-mark-busy",
      "dsh-turn-preview-enter": "eGxaPq_dsh-turn-preview-enter",
      "fadeBottom": "eGxaPq_fadeBottom",
      "fadeTop": "eGxaPq_fadeTop",
      "frame": "eGxaPq_frame",
      "mark": "eGxaPq_mark",
      "markActive": "eGxaPq_markActive",
      "markBusy": "eGxaPq_markBusy",
      "markPreview": "eGxaPq_markPreview",
      "markUnloaded": "eGxaPq_markUnloaded",
      "marks": "eGxaPq_marks",
      "preview": "eGxaPq_preview",
      "previewPrompt": "eGxaPq_previewPrompt",
      "previewResponse": "eGxaPq_previewResponse",
      "scroller": "eGxaPq_scroller",
      "slot": "eGxaPq_slot"
    };
    const TURN_SPACING_PX = 10;
    const RAIL_INSET_PX = 6;
    const FADE_PX = 24;
    function preferredScrollBehavior() {
      return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    }
    const TurnMark = (0, react.memo)(function TurnMark2({ item, index, active, busy, previewId, registerElement, onNavigate, onPreview, onFocusChange, t }) {
      const classes = [TurnNavigator_module_css_default.mark];
      if (item.anchor.kind === "unloaded") classes.push(TurnNavigator_module_css_default.markUnloaded);
      if (active) classes.push(TurnNavigator_module_css_default.markActive);
      else if (previewId !== void 0) classes.push(TurnNavigator_module_css_default.markPreview);
      if (busy) classes.push(TurnNavigator_module_css_default.markBusy);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
        ref: registerElement,
        "data-index": index,
        type: "button",
        className: classes.join(" "),
        "aria-label": t(item.anchor.kind === "loaded" ? "chat.turnNavigation.jump" : "chat.turnNavigation.jumpLoad", { turn: item.turn }),
        "aria-current": active ? "true" : void 0,
        "aria-busy": busy ? "true" : void 0,
        "aria-describedby": previewId,
        onPointerMove: () => {
          onPreview(item.turn);
        },
        onClick: () => {
          onNavigate(item);
        },
        onFocus: () => {
          onFocusChange(item.turn);
        },
        onBlur: () => {
          onFocusChange(null);
        }
      });
    });
    function TurnNavigatorRail({ items, activeTurn, busyTurn, onNavigate, t }, ref) {
      const [previewTurn, setPreviewTurn] = (0, react.useState)(null);
      const [focusedTurn, setFocusedTurn] = (0, react.useState)(null);
      const scrollerRef = (0, react.useRef)(null);
      const initialization = (0, react.useRef)({
        placed: false,
        index: 0,
        follow: null,
        publishOffset: null
      });
      const pointerInsideRef = (0, react.useRef)(false);
      const previewId = (0, react.useId)();
      const turnIndexes = (0, react.useMemo)(() => {
        const indexes = /* @__PURE__ */ new Map();
        items.forEach((item, index) => {
          indexes.set(item.turn, index);
        });
        return indexes;
      }, [items]);
      const activeIndex = activeTurn === null ? void 0 : turnIndexes.get(activeTurn);
      (0, react.useLayoutEffect)(() => {
        initialization.current.index = activeIndex ?? 0;
      }, [activeIndex]);
      const focusedIndex = focusedTurn === null ? void 0 : turnIndexes.get(focusedTurn);
      const previewIndex = previewTurn === null ? void 0 : turnIndexes.get(previewTurn);
      const onFocusChange = (0, react.useCallback)((turn) => {
        setFocusedTurn(turn);
        setPreviewTurn(turn);
      }, []);
      const virtualizer = useVirtualizer({
        count: items.length,
        enabled: items.length >= 2,
        directDomUpdates: true,
        directDomUpdatesMode: "transform",
        useScrollendEvent: true,
        getScrollElement: (0, react.useCallback)(() => scrollerRef.current, []),
        getItemKey: (0, react.useCallback)((index) => items[index]?.turn ?? index, [items]),
        estimateSize: () => TURN_SPACING_PX,
        measureElement: () => TURN_SPACING_PX,
        initialRect: {
          width: 0,
          height: 0
        },
        initialOffset: 0,
        scrollToFn: (offset, options, instance) => {
          if (initialization.current.placed) elementScroll(offset, options, instance);
        },
        observeElementOffset: (instance, notify) => {
          initialization.current.publishOffset = notify;
          const dispose = observeElementOffset(instance, notify);
          return () => {
            dispose?.();
            initialization.current.placed = false;
            initialization.current.follow = null;
            initialization.current.publishOffset = null;
          };
        },
        observeElementRect: (instance, notify) => {
          const element = instance.scrollElement;
          const Observer = instance.targetWindow?.ResizeObserver;
          if (element === null || Observer === void 0) return;
          const observer = new Observer(([entry]) => {
            if (entry === void 0) return;
            const box = entry.borderBoxSize[0];
            const rect = {
              width: Math.round(box?.inlineSize ?? entry.contentRect.width),
              height: Math.round(box?.blockSize ?? entry.contentRect.height)
            };
            const initial = initialization.current;
            if (!initial.placed && rect.height > 0) {
              const max = Math.max(0, instance.getTotalSize() - rect.height);
              const center = initial.index * TURN_SPACING_PX + RAIL_INSET_PX;
              const target = Math.max(0, Math.min(max, center - rect.height / 2));
              initial.placed = true;
              initial.follow = {
                index: initial.index,
                count: instance.options.count,
                height: rect.height
              };
              element.scrollTop = target;
              initial.publishOffset?.(target, false);
            }
            notify(rect);
          });
          observer.observe(element, { box: "border-box" });
          return () => {
            observer.disconnect();
          };
        },
        paddingStart: RAIL_INSET_PX - TURN_SPACING_PX / 2,
        paddingEnd: RAIL_INSET_PX - TURN_SPACING_PX / 2,
        scrollPaddingStart: FADE_PX,
        scrollPaddingEnd: FADE_PX,
        overscan: 3,
        rangeExtractor: (0, react.useCallback)((range) => {
          const indexes = defaultRangeExtractor(range);
          if (focusedIndex !== void 0) {
            const last = Math.min(range.count - 1, focusedIndex + 1);
            for (let index = Math.max(0, focusedIndex - 1); index <= last; index++) if (!indexes.includes(index)) indexes.push(index);
            indexes.sort((left, right) => left - right);
          }
          return indexes;
        }, [focusedIndex])
      });
      const scrollTop = virtualizer.scrollOffset ?? 0;
      const viewHeight = virtualizer.scrollRect?.height ?? 0;
      const virtualItems = virtualizer.getVirtualItems();
      const scrollToIndex = (0, react.useCallback)((index, reveal, behavior = preferredScrollBehavior()) => {
        const item = virtualizer.measurementsCache[index];
        const height = virtualizer.scrollRect?.height ?? 0;
        if (item === void 0 || height <= 0) return;
        const current = virtualizer.scrollOffset ?? 0;
        const center = item.start + item.size / 2;
        if (reveal === "if-needed") {
          const { scrollPaddingStart, scrollPaddingEnd } = virtualizer.options;
          if (center >= current + scrollPaddingStart && center <= current + height - scrollPaddingEnd) return;
        }
        const target = center - height / 2;
        const max = Math.max(0, virtualizer.getTotalSize() - height);
        const delta = Math.max(0, Math.min(max, target)) - current;
        if (delta !== 0) virtualizer.scrollBy(delta, { behavior });
      }, [virtualizer]);
      (0, react.useImperativeHandle)(ref, () => ({
        activateTurn(turn) {
          const index = turnIndexes.get(turn);
          const item = index === void 0 ? void 0 : items[index];
          if (item !== void 0) onNavigate(item);
        },
        scrollToTurn(turn) {
          const index = turnIndexes.get(turn);
          if (index !== void 0) scrollToIndex(index, "always");
        }
      }), [
        items,
        turnIndexes,
        onNavigate,
        scrollToIndex
      ]);
      (0, react.useEffect)(() => {
        if (viewHeight <= 0) {
          initialization.current.follow = null;
          return;
        }
        if (activeIndex === void 0 || pointerInsideRef.current) return;
        const previous = initialization.current.follow;
        if (previous?.index === activeIndex && previous.count === items.length && previous.height === viewHeight) return;
        initialization.current.follow = {
          index: activeIndex,
          count: items.length,
          height: viewHeight
        };
        scrollToIndex(activeIndex, "if-needed", previous?.count === items.length && previous.height === viewHeight ? preferredScrollBehavior() : "instant");
      }, [
        activeIndex,
        items.length,
        viewHeight,
        scrollToIndex
      ]);
      if (items.length < 2) return null;
      const preview2 = previewIndex === void 0 ? void 0 : items[previewIndex];
      const previewPosition = virtualItems.find((item) => item.index === previewIndex);
      const fadeClasses = [TurnNavigator_module_css_default.scroller];
      if (scrollTop > 1) fadeClasses.push(TurnNavigator_module_css_default.fadeTop);
      if (scrollTop < virtualizer.getTotalSize() - viewHeight - 1) fadeClasses.push(TurnNavigator_module_css_default.fadeBottom);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        className: TurnNavigator_module_css_default.slot,
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
          className: TurnNavigator_module_css_default.frame,
          "aria-label": t("chat.turnNavigation.label"),
          onPointerEnter: () => {
            pointerInsideRef.current = true;
          },
          onPointerLeave: () => {
            pointerInsideRef.current = false;
            setPreviewTurn(null);
          },
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
            ref: scrollerRef,
            className: fadeClasses.join(" "),
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              ref: virtualizer.containerRef,
              className: TurnNavigator_module_css_default.marks,
              children: virtualItems.map(({ index, key }) => {
                const item = items[index];
                if (item === void 0) return null;
                return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnMark, {
                  item,
                  index,
                  active: item.turn === activeTurn,
                  busy: item.turn === busyTurn,
                  previewId: item.turn === previewTurn ? previewId : void 0,
                  registerElement: virtualizer.measureElement,
                  onNavigate,
                  onPreview: setPreviewTurn,
                  onFocusChange,
                  t
                }, key);
              })
            })
          }), preview2 !== void 0 && previewPosition !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
            id: previewId,
            role: "tooltip",
            className: TurnNavigator_module_css_default.preview,
            style: { "--turn-preview-center": `${String(previewPosition.start + previewPosition.size / 2 - scrollTop)}px` },
            children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              className: TurnNavigator_module_css_default.previewPrompt,
              children: preview2.prompt || t("chat.turnNavigation.turn", { turn: preview2.turn })
            }), preview2.response !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              className: TurnNavigator_module_css_default.previewResponse,
              children: preview2.response
            })]
          })]
        })
      });
    }
    const TurnNavigator = (0, react.memo)((0, react.forwardRef)(TurnNavigatorRail));
    function brandNumber(value) {
      return value;
    }
    function SessionSeq(value) {
      if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new TypeError(`SessionSeq must be a non-negative safe integer, got ${String(value)}`);
      return brandNumber(value);
    }
    const EMPTY_ITEMS$1 = [];
    function outlineEntry(value) {
      if (typeof value !== "object" || value === null) return void 0;
      const entry = value;
      if (typeof entry.turn !== "number" || !Number.isSafeInteger(entry.turn) || entry.turn < 0) return void 0;
      if (typeof entry.seq !== "number" || !Number.isSafeInteger(entry.seq) || entry.seq < 0 || Object.is(entry.seq, -0)) return void 0;
      return {
        turn: entry.turn,
        seq: SessionSeq(entry.seq),
        prompt: typeof entry.prompt === "string" ? entry.prompt : "",
        response: typeof entry.response === "string" ? entry.response : ""
      };
    }
    function outlineEntries(outline) {
      return Array.isArray(outline) ? outline : EMPTY_ITEMS$1;
    }
    function mergeTurnRailItems(loaded, outline) {
      const byTurn = /* @__PURE__ */ new Map();
      for (const raw of outlineEntries(outline)) {
        const entry = outlineEntry(raw);
        if (entry === void 0) continue;
        byTurn.set(entry.turn, {
          turn: entry.turn,
          prompt: entry.prompt,
          response: entry.response,
          anchor: {
            kind: "unloaded",
            seq: entry.seq
          }
        });
      }
      for (const item of loaded) {
        const preview2 = byTurn.get(item.turn);
        byTurn.set(item.turn, {
          turn: item.turn,
          prompt: item.prompt !== "" ? item.prompt : preview2?.prompt ?? "",
          response: item.response !== "" ? item.response : preview2?.response ?? "",
          anchor: {
            kind: "loaded",
            key: item.anchorKey
          }
        });
      }
      if (byTurn.size === 0) return EMPTY_ITEMS$1;
      return [...byTurn.values()].sort((left, right) => left.turn - right.turn);
    }
    var ChatNavigation = class {
      viewport;
      reading;
      input;
      onBusyTurn;
      jump = null;
      settleFrame = null;
      constructor(viewport, reading, input, onBusyTurn) {
        this.viewport = viewport;
        this.reading = reading;
        this.input = input;
        this.onBusyTurn = onBusyTurn;
      }
      /**
      * Adopt committed history availability without starting a request.
      * @param input - history state from the latest committed render.
      */
      setInput(input) {
        this.input = input;
      }
      /** Cancel navigation when opening a Chat view. */
      reset() {
        this.cancel();
      }
      /** Cancel local callbacks; late history completions cannot revive a task. */
      dispose() {
        this.clearTask();
      }
      /** Release the jump, paging anchor, and busy indicator without cancelling shared history I/O. */
      cancel() {
        this.clearTask();
        this.onBusyTurn(null);
      }
      clearTask() {
        this.cancelFrame();
        this.jump = null;
        this.viewport.stopPreserving();
      }
      /**
      * Replace the current jump with an explicit turn selection.
      * @param item - loaded anchor or unloaded turn to fetch before landing.
      */
      navigateToTurn = (item) => {
        if (item.anchor.kind === "loaded") {
          this.cancel();
          const landing = this.viewport.scrollToTurn(item.turn);
          if (landing === null) return;
          this.reading.acceptNavigation(landing);
          if (this.input.loadingOlder) this.viewport.beginPreserving(landing.position);
          return;
        }
        this.cancel();
        this.viewport.beginPreserving();
        this.reading.pauseFollowing();
        const jump = {
          turn: item.turn,
          seq: item.anchor.seq,
          phase: "loading",
          landing: "pending",
          repageHead: null
        };
        this.jump = jump;
        this.onBusyTurn(jump.turn);
        this.request(jump);
      };
      /** Request one older page while retaining the current semantic position. */
      loadEarlier = () => {
        this.cancel();
        this.viewport.beginPaging();
        this.reading.pauseFollowing();
        this.input.loadOlder();
      };
      /**
      * Preserve reader ownership across pending history work.
      * @param sample - settled reader movement that can update or interrupt an anchor.
      */
      readerSampled(sample) {
        if (sample.movedByReader && this.jump?.landing === "landed") this.jump.landing = "interrupted";
        if (sample.followingTail || sample.movedByReader) this.viewport.stopPreserving();
      }
      /**
      * Preserve one paging anchor after a commit or a later size change, regardless of head identity.
      * @returns whether the retained anchor handled the layout change.
      */
      contentCommitted() {
        if (!this.viewport.preserving || this.reading.pending) return false;
        if (this.landJump(false)) return true;
        const landing = this.viewport.preserve();
        if (landing === null) return false;
        this.reading.preservePosition(landing);
        return true;
      }
      /** Retarget a still-loading page only after inner or outer reader scrolling ends. */
      readerSettled() {
        if (this.input.loadingOlder && this.jump === null && !this.viewport.preserving && !this.reading.followingTail) this.viewport.beginPreserving();
      }
      /** Land, retry, or complete the current jump against the committed window. */
      reconcile() {
        const jump = this.jump;
        if (jump === null || this.reading.pending) return;
        if (jump.phase === "loading") {
          if (jump.landing === "pending") this.landJump(false);
          return;
        }
        if (this.input.loadingOlder) return;
        if (this.landJump(true)) return;
        if ((this.input.firstSeq === null || this.input.firstSeq > jump.seq) && this.input.hasMore && jump.repageHead !== this.input.firstSeq) {
          jump.repageHead = this.input.firstSeq;
          this.viewport.beginPreserving();
          this.request(jump);
          return;
        }
        const fallback = this.viewport.scrollToTurnAtOrAfter(jump.turn);
        this.cancel();
        if (fallback !== null) this.reading.acceptNavigation(fallback);
      }
      landJump(settle) {
        const jump = this.jump;
        if (jump === null) return false;
        if (jump.landing === "interrupted") {
          if (settle) {
            this.cancel();
            return true;
          }
          return false;
        }
        const landing = this.viewport.scrollToTurn(jump.turn);
        if (landing === null) return false;
        this.reading.acceptNavigation(landing);
        if (settle) this.cancel();
        else {
          this.viewport.beginPreserving(landing.position);
          jump.landing = "landed";
        }
        return true;
      }
      request(jump) {
        jump.phase = "loading";
        const settled = () => {
          if (this.jump !== jump) return;
          jump.phase = "settled";
          this.cancelFrame();
          if (typeof requestAnimationFrame !== "function") this.reconcile();
          else this.settleFrame = requestAnimationFrame(() => {
            this.settleFrame = null;
            if (this.jump === jump) this.reconcile();
          });
        };
        this.input.loadThrough(jump.seq).then(settled, settled);
      }
      cancelFrame() {
        if (this.settleFrame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.settleFrame);
        this.settleFrame = null;
      }
    };
    function useChatNavigation(viewport, reading, input) {
      const [busyTurn, setBusyTurn] = (0, react.useState)(null);
      const [navigation] = (0, react.useState)(() => new ChatNavigation(viewport, reading, input, setBusyTurn));
      (0, react.useLayoutEffect)(() => {
        navigation.setInput(input);
      }, [navigation, input]);
      (0, react.useLayoutEffect)(() => () => {
        navigation.dispose();
      }, [navigation]);
      return {
        navigation,
        busyTurn
      };
    }
    const SCROLL_SAMPLE_INTERVAL_MS = 500;
    var ChatReading = class {
      viewport;
      store;
      state;
      onChange;
      follow;
      sampleTimer = null;
      probeFrame = null;
      sampled = null;
      constructor(viewport, store, state, onChange, follow) {
        this.viewport = viewport;
        this.store = store;
        this.state = state;
        this.onChange = onChange;
        this.follow = follow;
      }
      /**
      * Expose pending reader ownership to navigation and resize handlers.
      * @returns whether reader input still awaits interval or scrollend sampling.
      */
      get pending() {
        return this.sampleTimer !== null;
      }
      /**
      * Expose the active follow policy.
      * @returns whether content growth retains bottom-follow ownership.
      */
      get followingTail() {
        return this.state.followingTail;
      }
      /**
      * Adopt the committed Session's scroll memory.
      * @param store - scroll memory for the current Session.
      */
      setStore(store) {
        this.store = store;
      }
      /**
      * Connect history policy to settled reading observations.
      * @param sampled - receives settled reader positions.
      * @returns a disposer that disconnects only this listener.
      */
      connect(sampled) {
        this.sampled = sampled;
        return () => {
          if (this.sampled === sampled) this.sampled = null;
        };
      }
      /** Cancel timers and animation frames and detach the sample listener. */
      dispose() {
        this.cancelPending();
        this.sampled = null;
      }
      /** Release bottom follow and pending sampling for an explicit navigation. */
      pauseFollowing() {
        this.cancelPending();
        this.publish({
          ...this.state,
          followingTail: false
        });
      }
      /** Land at the current floor and clear saved reader position. */
      followTail() {
        const landing = this.viewport.scrollToBottom(this.follow);
        if (landing === null) return;
        this.cancelPending();
        this.commit(landing, true, this.viewport.latestTurn);
      }
      /** Restore the Session's semantic position, or follow the tail when none is saved. */
      restore() {
        const saved = this.store.read();
        if (saved === null) {
          this.followTail();
          return;
        }
        const landing = this.viewport.restore(saved);
        if (landing === null) return;
        this.cancelPending();
        const following = this.follow.nearBottom(landing.metrics);
        this.commit(landing, following, following ? this.viewport.latestTurn : this.state.activeTurn, following);
        if (!this.state.followingTail && landing.position === null) {
          const position = this.viewport.capturePosition();
          if (position !== null) this.store.save(position);
        }
        this.refreshActiveTurn();
      }
      /**
      * Adopt a known landing without rediscovering its anchor.
      * @param landing - measured navigation result that replaces pending reader input.
      */
      acceptNavigation(landing) {
        this.cancelPending();
        const following = this.follow.nearBottom(landing.metrics);
        this.commit(landing, following, landing.turn ?? (following ? this.viewport.latestTurn : this.state.activeTurn));
      }
      /**
      * Retain reading policy while history changes the anchor's geometry.
      * @param landing - compensated position that retains the current reading policy.
      */
      preservePosition(landing) {
        this.cancelPending();
        this.commit(landing, this.state.followingTail, this.state.activeTurn);
      }
      /**
      * Handle pinned layout movement and reader arrivals at the floor immediately.
      * @param scroll - attributed scroll delivery; other reader movement remains pending until sampled.
      */
      onScroll = (scroll) => {
        if (!scroll.movedByReader && this.state.followingTail || scroll.movedByReader && scroll.metrics.top >= scroll.metrics.floor) {
          this.followTail();
          this.sampled?.({
            position: null,
            movedByReader: scroll.movedByReader,
            followingTail: true
          });
          return;
        }
        this.sampleTimer ??= window.setTimeout(this.flushSample, SCROLL_SAMPLE_INTERVAL_MS);
      };
      /** Settle pending reader movement at the browser's scrollend. */
      onScrollEnd = () => {
        this.flushSample();
      };
      /** Reconcile a layout change without overriding unsampled reader input. */
      onResize() {
        if (this.pending) return;
        if (this.state.followingTail) this.followTail();
        else this.refreshActiveTurn();
      }
      /** Resolve the active turn from tail ownership or a coalesced reading-line probe. */
      refreshActiveTurn() {
        if (this.pending) return;
        if (this.state.followingTail) {
          this.publish({
            ...this.state,
            initialized: true,
            activeTurn: this.viewport.latestTurn
          });
          return;
        }
        if (this.probeFrame !== null) return;
        if (typeof requestAnimationFrame !== "function") this.probe();
        else this.probeFrame = requestAnimationFrame(this.probe);
      }
      commit(landing, followingTail, activeTurn, initialized = true) {
        if (followingTail) this.store.save(null);
        else if (landing.position !== null) this.store.save(landing.position);
        this.publish({
          initialized,
          followingTail,
          activeTurn
        });
      }
      publish(state) {
        this.follow.setFollowing(state.followingTail);
        if (state.initialized === this.state.initialized && state.followingTail === this.state.followingTail && state.activeTurn === this.state.activeTurn) return;
        this.state = state;
        this.onChange(state);
      }
      cancelPending() {
        if (this.sampleTimer !== null) window.clearTimeout(this.sampleTimer);
        if (this.probeFrame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.probeFrame);
        this.sampleTimer = null;
        this.probeFrame = null;
      }
      probe = () => {
        this.probeFrame = null;
        if (this.pending) return;
        const scroll = this.viewport.readScroll();
        if (scroll === null) return;
        const activeTurn = this.follow.nearBottom(scroll.metrics) ? this.viewport.latestTurn : this.viewport.readVisibleTurn(scroll.metrics);
        this.publish({
          ...this.state,
          initialized: true,
          activeTurn
        });
      };
      flushSample = () => {
        if (!this.pending) return;
        this.cancelPending();
        const scroll = this.viewport.readScroll();
        if (scroll === null) return;
        const followingTail = this.follow.sample(scroll.metrics, scroll.movedByReader);
        let position = null;
        if (!scroll.movedByReader && followingTail) this.followTail();
        else {
          position = followingTail ? null : this.viewport.capturePosition();
          this.viewport.acknowledge(scroll.metrics);
          if (followingTail || position !== null) this.store.save(position);
          const activeTurn = this.follow.nearBottom(scroll.metrics) ? this.viewport.latestTurn : this.viewport.readVisibleTurn(scroll.metrics);
          this.publish({
            initialized: true,
            followingTail,
            activeTurn
          });
        }
        this.sampled?.({
          position,
          movedByReader: scroll.movedByReader,
          followingTail
        });
      };
    };
    function useChatReading(viewport, store, initialTurn) {
      const [state, setState] = (0, react.useState)(() => ({
        initialized: false,
        followingTail: store.read() === null,
        activeTurn: initialTurn
      }));
      const follow = useScrollFollow(state.followingTail, 25);
      const [reading] = (0, react.useState)(() => new ChatReading(viewport, store, state, setState, follow));
      (0, react.useLayoutEffect)(() => {
        reading.setStore(store);
      }, [reading, store]);
      (0, react.useLayoutEffect)(() => () => {
        reading.dispose();
      }, [reading]);
      return {
        reading,
        state
      };
    }
    const READING_INTENTS = [
      "wheel",
      "touchstart",
      "pointerdown",
      "keydown",
      "beforematch"
    ];
    const SCROLL_KEYS = /* @__PURE__ */ new Set([
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      " "
    ]);
    var ChatViewport = class {
      elements = null;
      observer = null;
      events = null;
      turns = [];
      observation = {
        top: 0,
        landing: null
      };
      paging = null;
      /**
      * Bind to the containing scrollport and observe content and viewport sizes.
      * @param list - Chat root inside an optional shared conversation scrollport.
      * @param column - ordered outer Node/Group boxes; its size changes invalidate cached landings.
      */
      attach(list, column) {
        this.detach();
        const scroller = list.closest("[data-conversation-scroll]") ?? list;
        const composer = scroller.querySelector("[data-composer-seat]");
        const elements = {
          list,
          column,
          scroller,
          composer
        };
        this.elements = elements;
        scroller.addEventListener("scroll", this.onScroll, { passive: true });
        scroller.addEventListener("scrollend", this.onScrollEnd, {
          passive: true,
          capture: true
        });
        for (const type of READING_INTENTS) scroller.addEventListener(type, this.onIntent, {
          passive: true,
          capture: true
        });
        if (typeof ResizeObserver !== "undefined") {
          this.observer = new ResizeObserver(() => {
            if (this.elements !== elements) return;
            this.invalidate();
            this.events?.resize();
          });
          this.observer.observe(column);
          this.observer.observe(scroller);
          if (composer !== null) this.observer.observe(composer);
        }
      }
      /** Disconnect DOM resources and clear observations for the detached view. */
      detach() {
        this.stopPreserving();
        this.elements?.scroller.removeEventListener("scroll", this.onScroll);
        this.elements?.scroller.removeEventListener("scrollend", this.onScrollEnd, true);
        for (const type of READING_INTENTS) this.elements?.scroller.removeEventListener(type, this.onIntent, true);
        this.observer?.disconnect();
        this.observer = null;
        this.elements = null;
        this.events = null;
        this.turns = [];
        this.observation = {
          top: 0,
          landing: null
        };
      }
      /**
      * Connect business policy without changing DOM listener ownership.
      * @param events - business handlers for scroll and layout changes.
      * @returns a disposer that disconnects only these handlers.
      */
      connect(events) {
        this.events = events;
        return () => {
          if (this.events === events) this.events = null;
        };
      }
      /**
      * Adopt the loaded turn anchors without querying the DOM.
      * @param turns - ordered loaded turns from the committed Chat snapshot.
      */
      updateTurns(turns) {
        this.turns = turns;
      }
      /**
      * Resolve the tail from the committed turn index.
      * @returns the latest loaded turn, or null for an empty window.
      */
      get latestTurn() {
        return this.turns.at(-1)?.turn ?? null;
      }
      /** Discard geometry-dependent landing knowledge while retaining scroll attribution. */
      invalidate() {
        this.observation.landing = null;
      }
      /**
      * Accept a sampled reader position without retaining a known landing.
      * @param metrics - settled reader position used as the next attribution baseline.
      */
      acknowledge(metrics) {
        this.observation = {
          top: metrics.top,
          landing: null
        };
      }
      /**
      * Compare the current scroll geometry with the last acknowledged position.
      * @returns current metrics and movement attribution, or null while detached.
      */
      readScroll() {
        const metrics = this.metrics();
        if (metrics === null) return null;
        return {
          metrics,
          movedByReader: Math.abs(metrics.top - Math.min(this.observation.top, metrics.floor)) > 0.5
        };
      }
      metrics() {
        const scroller = this.elements?.scroller;
        if (scroller === void 0) return null;
        return scrollMetrics(scroller);
      }
      anchor(key, identity = "position") {
        if (this.elements === null) return null;
        let nodePart = null;
        for (const row of this.elements.list.querySelectorAll("[data-chat-anchor-key]:not([hidden]):not([hidden] *)")) {
          if (row.dataset.chatAnchorKey === key || identity === "node" && row.dataset.chatNodeKey === key) return row;
          if (nodePart === null && row.dataset.chatNodeKey === key) nodePart = row;
        }
        return nodePart;
      }
      /**
      * Capture visible transcript content, excluding Turn controls that relocate when history expands.
      * @returns a visible semantic anchor, or null when no anchor can be resolved.
      */
      capturePosition() {
        const elements = this.elements;
        if (elements === null) return null;
        const { list, scroller, composer } = elements;
        const viewport = scroller.getBoundingClientRect();
        const bottom = composer?.getBoundingClientRect().top ?? viewport.bottom;
        let anchor = null;
        if (typeof document.elementsFromPoint === "function" && bottom > viewport.top) {
          const content = list.getBoundingClientRect();
          const left = Math.max(viewport.left, content.left);
          const right = Math.min(viewport.right, content.right);
          for (const element of document.elementsFromPoint(left + Math.max(0, right - left) / 2, viewport.top + 1)) {
            const row = element instanceof HTMLElement ? element.closest("[data-chat-anchor-key]") : null;
            if (row !== null && row.dataset.chatFlowKind !== "turn-process" && list.contains(row)) {
              anchor = row.dataset.chatGroupKey === void 0 ? row : row.querySelector("[data-step-process-content] > [data-chat-anchor-key]:not(:empty):not([hidden]):not([hidden] *)") ?? row;
              break;
            }
          }
        }
        if (anchor === null) {
          const rows = list.querySelectorAll('[data-chat-flow-key]:not([data-chat-group-key]):not([data-chat-flow-kind="turn-process"]):not(:empty):not([hidden]):not([hidden] *)');
          let low = 0;
          let high = rows.length;
          while (low < high) {
            const middle = low + high >>> 1;
            if (rows.item(middle).getBoundingClientRect().bottom > viewport.top) high = middle;
            else low = middle + 1;
          }
          const row = rows[low];
          anchor = row !== void 0 && row.getBoundingClientRect().top < bottom ? row : rows[0] ?? null;
        }
        const key = anchor?.dataset.chatAnchorKey;
        return anchor === null || key === void 0 ? null : {
          anchorKey: key,
          anchorTop: anchor.getBoundingClientRect().top - viewport.top,
          scrollTop: scroller.scrollTop
        };
      }
      /**
      * Approximate the active Turn by binary-searching outer Node/Group boxes.
      * Gaps retain the last visited Turn candidate, not necessarily the immediate predecessor.
      * A known landing bypasses measurement while its position is unchanged.
      * @param metrics - reusable scroll metrics; omitted callers request a fresh read.
      * @returns the Turn near the reading line, or null while detached or empty.
      */
      readVisibleTurn(metrics = this.metrics()) {
        const knownTurn = this.observation.landing?.turn;
        if (knownTurn != null && metrics?.top === this.observation.top) return knownTurn;
        const elements = this.elements;
        const first = this.turns[0];
        if (elements === null || metrics === null || first === void 0) return null;
        const line = elements.scroller.getBoundingClientRect().top + Math.min(96, metrics.height * 0.2);
        const rows = elements.column.children;
        let low = 0;
        let high = rows.length;
        let reading = first.turn;
        while (low < high) {
          const middle = low + high >>> 1;
          const row = rows[middle];
          if (row.getBoundingClientRect().top > line) high = middle;
          else {
            const value = row.getAttribute("data-chat-turn");
            const turn = value === null ? NaN : Number(value);
            if (Number.isSafeInteger(turn)) reading = turn;
            low = middle + 1;
          }
        }
        return reading;
      }
      /**
      * Align a known loaded turn and return its actual clamped position.
      * A split Node anchor selects its first visible part.
      * @param turn - loaded turn to align below the scrollport's top edge.
      * @returns the actual landing, or null when its anchor is unavailable.
      */
      scrollToTurn(turn) {
        const item = this.turns.find((candidate) => candidate.turn === turn);
        if (item === void 0) return null;
        const row = this.anchor(item.anchorKey, "node");
        return row === null ? null : this.align(row, 24, turn);
      }
      /**
      * Align the nearest available fallback for an unavailable turn anchor.
      * @param turn - minimum turn number for a mounted fallback row.
      * @returns the fallback landing, or null when no eligible row exists.
      */
      scrollToTurnAtOrAfter(turn) {
        if (this.elements === null) return null;
        for (const row of this.elements.list.querySelectorAll("[data-chat-turn]:not([hidden]):not([hidden] *)")) {
          const candidate = Number(row.dataset.chatTurn);
          if (Number.isSafeInteger(candidate) && candidate >= turn) return this.align(row, 24, candidate);
        }
        return null;
      }
      /**
      * Restore a semantic anchor with a raw-position fallback.
      * @param position - semantic scroll memory; raw top is used only if its row is absent.
      * @returns the actual landing, or null while detached.
      */
      restore(position) {
        const row = this.anchor(position.anchorKey);
        if (row !== null) return this.align(row, position.anchorTop, null);
        const metrics = this.metrics();
        return metrics === null ? null : this.write(position.scrollTop, metrics, null);
      }
      /** Retain the first eligible transcript seat in DOM order; selection reads no geometry. */
      beginPaging() {
        this.stopPreserving();
        const row = this.elements?.list.querySelector("[data-chat-paging-anchor]:not(:empty):not([hidden]):not([hidden] *)");
        if (row != null) this.retain(row);
      }
      /**
      * Retain one old row and its inner/outer offsets for paging and later content growth.
      * @param position - an explicit landing to retain; omitted callers capture the current reading position.
      */
      beginPreserving(position = this.capturePosition()) {
        this.stopPreserving();
        if (position === null) return;
        const row = this.anchor(position.anchorKey);
        if (row === null) return;
        this.retain(row, position);
      }
      retain(row, position, groupTop) {
        const elements = this.elements;
        const key = row.dataset.chatAnchorKey;
        if (elements === null || key === void 0) return null;
        const previous = this.paging?.group;
        if (previous != null) this.observer?.unobserve(previous.content);
        const top = row.getBoundingClientRect().top;
        const body = row.closest("[data-step-process-body]");
        const content = body?.querySelector("[data-step-process-content]");
        const group = body === null || content == null ? null : {
          body,
          content,
          top: groupTop ?? top - body.getBoundingClientRect().top
        };
        this.paging = {
          row,
          group,
          position: position ?? {
            anchorKey: key,
            anchorTop: top - elements.scroller.getBoundingClientRect().top,
            scrollTop: elements.scroller.scrollTop
          }
        };
        if (group !== null) this.observer?.observe(group.content);
        return this.paging;
      }
      /** Release paging ownership and its content-size observation. */
      stopPreserving() {
        const group = this.paging?.group;
        if (group != null) this.observer?.unobserve(group.content);
        this.paging = null;
      }
      /**
      * Expose retained paging ownership to navigation and resize policy.
      * @returns whether a paging row is retained for subsequent layout changes.
      */
      get preserving() {
        return this.paging !== null;
      }
      /**
      * Compensate inner scrolling first, then the outer scrollport, within their actual scroll ranges.
      * An inner write pauses its bound follow controller so the reading anchor takes priority.
      * @returns the actual landing, or null when no visible retained row remains.
      */
      preserve() {
        let paging = this.paging;
        const elements = this.elements;
        if (paging === null || elements === null) return null;
        if (!elements.list.contains(paging.row)) {
          const replacement = this.anchor(paging.position.anchorKey);
          if (replacement === null) {
            this.stopPreserving();
            return null;
          }
          paging = this.retain(replacement, paging.position, paging.group?.top);
          if (paging === null) return null;
        }
        const { row, group, position } = paging;
        if (row.closest("[hidden]") !== null || row.matches(":empty")) {
          this.stopPreserving();
          return null;
        }
        if (group !== null && group.body.contains(row)) {
          const top2 = row.getBoundingClientRect().top - group.body.getBoundingClientRect().top;
          const metrics2 = scrollMetrics(group.body);
          const target2 = Math.max(0, Math.min(metrics2.floor, metrics2.top + top2 - group.top));
          if (metrics2.top !== target2) {
            const follow = ScrollFollow.forElement(group.body);
            if (follow === void 0) group.body.scrollTop = target2;
            else {
              follow.jump(group.body, metrics2, target2);
              follow.setFollowing(false);
            }
          }
        }
        const metrics = this.metrics();
        if (metrics === null) return null;
        const top = row.getBoundingClientRect().top - elements.scroller.getBoundingClientRect().top;
        const target = metrics.top + top - position.anchorTop;
        return this.write(target, metrics, null, {
          key: position.anchorKey,
          top
        });
      }
      /**
      * Align the scrollport with its current floor.
      * @param follow - independent follow intent and scrolling controller.
      * @returns the actual floor landing, or null while detached.
      */
      scrollToBottom(follow) {
        const metrics = this.metrics();
        if (metrics === null || this.elements === null) return null;
        const landing = {
          metrics: follow.toBottom(this.elements.scroller, metrics, "instant"),
          position: null,
          turn: this.latestTurn
        };
        this.observation = {
          top: landing.metrics.top,
          landing
        };
        return landing;
      }
      align(row, offset, turn) {
        const metrics = this.metrics();
        if (metrics === null || this.elements === null) return null;
        const top = row.getBoundingClientRect().top - this.elements.scroller.getBoundingClientRect().top;
        return this.write(metrics.top + top - offset, metrics, turn, {
          key: row.dataset.chatAnchorKey,
          top
        });
      }
      write(target, metrics, turn, anchor) {
        if (this.elements === null) return null;
        const top = Math.max(0, Math.min(metrics.floor, target));
        if (top !== metrics.top) this.elements.scroller.scrollTop = top;
        const actual = this.elements.scroller.scrollTop;
        const landing = {
          metrics: {
            ...metrics,
            top: actual
          },
          turn,
          position: anchor?.key === void 0 ? null : {
            anchorKey: anchor.key,
            anchorTop: anchor.top - (actual - metrics.top),
            scrollTop: actual
          }
        };
        this.observation = {
          top: actual,
          landing
        };
        return landing;
      }
      onScroll = (event) => {
        if (this.elements === null || event.target !== this.elements.scroller) return;
        if (this.observation.landing !== null && this.elements.scroller.scrollTop === this.observation.top) return;
        this.invalidate();
        if (this.paging !== null) {
          this.events?.resize();
          return;
        }
        const scroll = this.readScroll();
        if (scroll !== null) this.events?.scroll(scroll);
      };
      onScrollEnd = (event) => {
        if (event.target === this.elements?.scroller || event.target instanceof HTMLElement && event.target.hasAttribute("data-step-process-body")) this.events?.scrollEnd();
      };
      onIntent = (event) => {
        if (event.type === "keydown" || event.type === "pointerdown") {
          if (event.target instanceof Element && event.target.closest("[data-composer-seat]") !== null) return;
          if (event.type === "keydown" && (!(event instanceof KeyboardEvent) || !SCROLL_KEYS.has(event.key))) return;
        }
        if (this.paging === null) return;
        this.stopPreserving();
        this.events?.interact();
      };
    };
    function useChatViewport() {
      const listRef = (0, react.useRef)(null);
      const columnRef = (0, react.useRef)(null);
      const [viewport] = (0, react.useState)(() => new ChatViewport());
      (0, react.useLayoutEffect)(() => {
        if (listRef.current === null || columnRef.current === null) return;
        viewport.attach(listRef.current, columnRef.current);
        return () => {
          viewport.detach();
        };
      }, [viewport]);
      return {
        viewport,
        listRef,
        columnRef
      };
    }
    function useChatScroll(input) {
      const { ready, order, firstSeq, lastKey, lastIsUser, steeringId, submissionId, running, loadedTurns, chatScroll, hasMore, loadingOlder, loadOlder, loadThrough } = input;
      const { viewport, listRef, columnRef } = useChatViewport();
      const { reading, state } = useChatReading(viewport, chatScroll, loadedTurns.at(-1)?.turn ?? null);
      const navigationInput = (0, react.useMemo)(() => ({
        firstSeq,
        loadingOlder,
        hasMore,
        loadOlder,
        loadThrough
      }), [
        firstSeq,
        loadingOlder,
        hasMore,
        loadOlder,
        loadThrough
      ]);
      const { navigation, busyTurn } = useChatNavigation(viewport, reading, navigationInput);
      const content = (0, react.useRef)({
        input,
        applied: null,
        opened: false
      });
      const processContent = (0, react.useCallback)(() => {
        const current = content.current.input;
        const previous = content.current.applied;
        const ownInput = current.lastIsUser && current.lastKey !== previous?.lastKey || current.steeringId !== null && current.steeringId !== previous?.steeringId && current.steeringId !== previous?.submissionId || current.submissionId !== null && current.submissionId !== previous?.submissionId && current.submissionId !== previous?.steeringId;
        if (reading.pending && !ownInput) return;
        content.current.applied = current;
        if (current.ready && !content.current.opened) {
          content.current.opened = true;
          navigation.reset();
          reading.restore();
          return;
        }
        if (ownInput) {
          navigation.cancel();
          reading.followTail();
          return;
        }
        if (navigation.contentCommitted()) {
          navigation.reconcile();
          return;
        }
        if ((previous === null || current.ready !== previous.ready || current.firstSeq !== previous.firstSeq || current.lastKey !== previous.lastKey || current.order.length !== previous.order.length || current.running !== previous.running || current.steeringId !== previous.steeringId || current.submissionId !== previous.submissionId) && reading.followingTail) {
          navigation.cancel();
          reading.followTail();
        } else navigation.reconcile();
      }, [reading, navigation]);
      (0, react.useLayoutEffect)(() => {
        const disconnectViewport = viewport.connect({
          scroll: reading.onScroll,
          scrollEnd: () => {
            reading.onScrollEnd();
            navigation.readerSettled();
          },
          interact: () => {
            navigation.cancel();
          },
          resize: () => {
            if (!navigation.contentCommitted()) reading.onResize();
            navigation.reconcile();
          }
        });
        const disconnectReading = reading.connect((sample) => {
          navigation.readerSampled(sample);
          processContent();
        });
        return () => {
          disconnectViewport();
          disconnectReading();
          content.current.opened = false;
          content.current.applied = null;
        };
      }, [
        viewport,
        reading,
        navigation,
        processContent
      ]);
      (0, react.useLayoutEffect)(() => {
        const previous = content.current.input;
        content.current.input = {
          ready,
          order,
          lastKey,
          lastIsUser,
          steeringId,
          submissionId,
          running,
          loadedTurns,
          chatScroll,
          ...navigationInput
        };
        viewport.updateTurns(loadedTurns);
        const layoutChanged = previous.order !== order || previous.ready !== ready;
        if (layoutChanged) viewport.invalidate();
        processContent();
        if (layoutChanged) reading.refreshActiveTurn();
      }, [
        viewport,
        reading,
        processContent,
        navigationInput,
        ready,
        order,
        lastKey,
        lastIsUser,
        steeringId,
        submissionId,
        running,
        loadedTurns,
        chatScroll
      ]);
      const returnToBottom = (0, react.useCallback)(() => {
        navigation.cancel();
        reading.followTail();
      }, [navigation, reading]);
      return {
        listRef,
        columnRef,
        ...state,
        busyTurn,
        navigateToTurn: navigation.navigateToTurn,
        loadEarlier: navigation.loadEarlier,
        returnToBottom
      };
    }
    function openFailureMessage(error, fallback) {
      const message = error instanceof Error ? error.message : String(error);
      return message === "" ? fallback : message;
    }
    function observedInputs(order, nodes) {
      const observed = /* @__PURE__ */ new Set();
      let lastInputTurn;
      for (const key of order) {
        const node = nodes.get(key);
        if (node === void 0 || node.kind !== "user" && node.kind !== "steering" && node.kind !== "turn-trigger") continue;
        if (node.location.kind === "turn" || node.location.kind === "step") lastInputTurn = node.location.turn.turn;
        if (node.kind === "turn-trigger") continue;
        const source = node.data.source;
        if (source?.kind === "user" && typeof source.rpcId === "string") observed.add(source.rpcId);
      }
      return {
        rpcIds: observed,
        lastInputTurn
      };
    }
    const ChatNodeList = (0, react.memo)(function ChatNodeList2({ entries, useChatGroup, pendingInputs, lastInputTurn, ...seatProps }) {
      const rows = entries.map((entry) => {
        switch (entry.kind) {
          case "node":
            return /* @__PURE__ */ (0, react.createElement)(ChatNodeSeat, {
              ...seatProps,
              key: chatRenderKey(entry),
              nodeKey: entry.key,
              ...entry.groupPart === void 0 ? {} : { groupPart: entry.groupPart }
            });
          case "group":
            return /* @__PURE__ */ (0, react.createElement)(ChatGroupSeat, {
              ...seatProps,
              key: chatRenderKey(entry),
              groupKey: entry.key,
              useChatGroup
            });
          default:
            return assertNever(entry);
        }
      });
      const pendingRows = pendingInputs.map((item) => "requestId" in item ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PendingSubmissionBubble, {
        submission: item,
        renderMessageImages: seatProps.renderMessageImages,
        t: seatProps.t
      }, item.requestId) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PendingSteeringBubble, {
        content: item.content,
        renderMessageImages: seatProps.renderMessageImages,
        t: seatProps.t
      }, item.id));
      const tail = entries.at(-1);
      const node = tail?.kind === "node" ? seatProps.nodeStore.get(tail.key) : void 0;
      if (node?.kind === "turn-process" && node.location.kind === "turn" && node.location.turn.status === "open" && node.location.turn.turn !== lastInputTurn) {
        const index = pendingInputs.findIndex((item) => "requestId" in item && item.placement === "transcript");
        if (index !== -1) rows.splice(rows.length - 1, 0, ...pendingRows.splice(index, 1));
      }
      return [...rows, ...pendingRows];
    });
    function ChatView({ useSession, useChat, useChatNode, useChatNodeProcess, useChatGroup, useConversation, useSessions, useStore, actions, renderSlot, sessionId, openFile, openSkill, openExternalLink, loadOlder, loadThrough, loadImage, inspectCall, chatScroll, forkAt, fileMentions, usePresentation, useProjection, t }) {
      const order = useChat((s) => s.order);
      const groupedEntries = useConversation((snapshot2) => snapshot2.views.grouped("chat")?.entries);
      const entries = (0, react.useMemo)(() => groupedEntries ?? order.map((key) => ({
        kind: "node",
        key
      })), [groupedEntries, order]);
      const nodeStore = useChat((s) => s.nodes);
      const turnNavigationItems = useChat((s) => s.navigation.items());
      const turnOutline = useProjection("turnOutline");
      const railItems = (0, react.useMemo)(() => mergeTurnRailItems(turnNavigationItems, turnOutline), [turnNavigationItems, turnOutline]);
      const inbox = useProjection("inbox");
      const cwd = useSessions((s) => s.byId[sessionId]?.cwd);
      const running = useSession((s) => s.running);
      const openState = useSession((s) => s.openState);
      const openError = useSession((s) => s.openError);
      const hasMore = useSession((s) => s.hasMore);
      const loadingOlder = useSession((s) => s.loadingOlder);
      const [fileOpenError, setFileOpenError] = (0, react.useState)(null);
      const [fileOpenBusy, setFileOpenBusy] = (0, react.useState)(false);
      const fileOpenRequest = (0, react.useRef)(0);
      const requestOpenFile = (0, react.useCallback)((path, options) => {
        const id = ++fileOpenRequest.current;
        setFileOpenBusy(true);
        (options === void 0 ? openFile(path) : openFile(path, options)).then(() => {
          if (id !== fileOpenRequest.current) return;
          setFileOpenError(null);
          setFileOpenBusy(false);
        }, (error) => {
          if (id !== fileOpenRequest.current) return;
          setFileOpenError({
            path,
            message: openFailureMessage(error, t("fileOpen.unknown"))
          });
          setFileOpenBusy(false);
        });
      }, [openFile, t]);
      const closeFileOpenError = (0, react.useCallback)(() => {
        fileOpenRequest.current += 1;
        setFileOpenError(null);
        setFileOpenBusy(false);
      }, []);
      const inboxSteering = (0, react.useMemo)(() => inbox?.["next-step"].filter((message) => message.source.kind === "user") ?? [], [inbox]);
      const pendingSubmissions = useSession((s) => s.pendingSubmissions);
      const [visibleSubmissions, lastInputTurn] = (0, react.useMemo)(() => {
        if (pendingSubmissions.length === 0) return [pendingSubmissions, void 0];
        const observed = observedInputs(order, nodeStore);
        return [pendingSubmissions.filter((submission) => submission.placement !== "queued" && !observed.rpcIds.has(submission.requestId)), observed.lastInputTurn];
      }, [
        pendingSubmissions,
        order,
        nodeStore
      ]);
      const pendingInputs = (0, react.useMemo)(() => {
        const local = new Map(visibleSubmissions.map((submission) => [submission.requestId, submission]));
        const localIds = new Set(pendingSubmissions.filter((submission) => submission.placement !== "queued").map((submission) => submission.requestId));
        return [...inboxSteering.flatMap((item) => {
          const source = item.source;
          if (source.kind !== "user" || !("rpcId" in source)) return [item];
          const submission = local.get(source.rpcId);
          if (submission === void 0) return localIds.has(source.rpcId) ? [] : [item];
          local.delete(source.rpcId);
          return [submission];
        }), ...local.values()];
      }, [
        inboxSteering,
        pendingSubmissions,
        visibleSubmissions
      ]);
      const renderMessageImages = (0, react.useCallback)((owner) => renderSlot("conversation.message.images", {
        ...owner,
        loadImage
      }), [loadImage, renderSlot]);
      const firstKey = order[0];
      const firstSeq = firstKey === void 0 ? null : nodeStore.get(firstKey)?.anchorSeq ?? null;
      const lastKey = order.at(-1) ?? null;
      const latestSteering = pendingInputs.findLast((item) => "source" in item);
      const steeringId = latestSteering?.source.kind === "user" && "rpcId" in latestSteering.source ? latestSteering.source.rpcId : latestSteering?.id ?? null;
      const scroll = useChatScroll({
        ready: openState === "open",
        order,
        firstSeq,
        lastKey,
        running,
        loadingOlder,
        hasMore,
        chatScroll,
        loadOlder,
        loadThrough,
        lastIsUser: lastKey !== null && nodeStore.get(lastKey)?.kind === "user",
        steeringId,
        submissionId: visibleSubmissions.at(-1)?.requestId ?? null,
        loadedTurns: turnNavigationItems
      });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: ChatView_module_css_default.frame,
        children: [
          scroll.initialized && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnNavigator, {
            items: railItems,
            activeTurn: scroll.activeTurn,
            busyTurn: scroll.busyTurn,
            onNavigate: scroll.navigateToTurn,
            t
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
            className: ChatView_module_css_default.root,
            "data-chat-following-tail": scroll.followingTail ? "" : void 0,
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              ref: scroll.listRef,
              className: ChatView_module_css_default.scroll,
              children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
                ref: scroll.columnRef,
                className: ChatView_module_css_default.column,
                "data-chat-flow": "",
                children: [
                  openState === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
                    className: ChatView_module_css_default.hint,
                    children: t("chat.loadingHistory")
                  }),
                  openState === "error" && openError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
                    className: ChatView_module_css_default.openError,
                    children: t("chat.loadError", {
                      message: openError.message,
                      code: openError.code
                    })
                  }),
                  hasMore && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
                    className: ChatView_module_css_default.older,
                    children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
                      type: "button",
                      disabled: loadingOlder,
                      onClick: scroll.loadEarlier,
                      children: loadingOlder ? t("loading") : t("chat.loadOlder")
                    })
                  }),
                  /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownDelegateProvider, {
                    openExternalLink,
                    openFile: requestOpenFile,
                    children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChatNodeList, {
                      entries,
                      pendingInputs,
                      lastInputTurn,
                      nodeStore,
                      useChatGroup,
                      useChatNode,
                      useChatNodeProcess,
                      usePresentation,
                      useStore,
                      actions,
                      cwd,
                      openFile: requestOpenFile,
                      openSkill,
                      inspectCall,
                      forkAt,
                      loadImage,
                      renderMessageImages,
                      fileMentions,
                      renderSlot,
                      t
                    })
                  })
                ]
              })
            })
          }),
          !scroll.followingTail && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
            className: ChatView_module_css_default.toBottomSlot,
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
              type: "button",
              className: ChatView_module_css_default.toBottom,
              "aria-label": t("chat.toBottom"),
              onClick: scroll.returnToBottom,
              children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})
            })
          }),
          fileOpenError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileOpenErrorDialog, {
            message: fileOpenError.message,
            busy: fileOpenBusy,
            onClose: closeFileOpenError,
            onRetry: () => {
              requestOpenFile(fileOpenError.path);
            },
            t
          })
        ]
      });
    }
    function FileOpenErrorDialog({ message, busy, onClose, onRetry, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
        open: true,
        onClose,
        closeLabel: t("close"),
        title: t("fileOpen.title"),
        description: message,
        footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
          variant: "outline",
          className: ChatView_module_css_default.modalAction,
          onClick: onClose,
          children: t("cancel")
        }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
          variant: "primary",
          className: ChatView_module_css_default.modalAction,
          disabled: busy,
          onClick: onRetry,
          children: t("retry")
        })] })
      });
    }
    const NS = "chat";
    const zh = {
      "message.stepProcess.thinking": "\u6B63\u5728\u5206\u6790\u8BF7\u6C42",
      "message.stepProcess.read": "\u6B63\u5728\u8BFB\u53D6\u6587\u4EF6",
      "message.stepProcess.search": "\u6B63\u5728\u641C\u7D22\u4EE3\u7801",
      "message.stepProcess.edit": "\u6B63\u5728\u7F16\u8F91\u6587\u4EF6",
      "message.stepProcess.commands": "\u6B63\u5728\u8FD0\u884C\u547D\u4EE4",
      "message.stepProcess.code": "\u6B63\u5728\u8FD0\u884C\u4EE3\u7801",
      "message.stepProcess.webSearch": "\u6B63\u5728\u641C\u7D22\u7F51\u9875",
      "message.stepProcess.webFetch": "\u6B63\u5728\u8BBF\u95EE\u7F51\u9875",
      "message.stepProcess.subagents": "\u6B63\u5728\u534F\u8C03\u5B50\u4EFB\u52A1",
      "message.stepProcess.plan": "\u6B63\u5728\u66F4\u65B0\u8BA1\u5212",
      "message.stepProcess.questions": "\u7B49\u5F85\u4F60\u7684\u64CD\u4F5C",
      "message.stepProcess.tools": "\u6B63\u5728\u8C03\u7528\u5DE5\u5177",
      "message.stepProcess.computer": "\u6B63\u5728\u64CD\u4F5C\u7535\u8111",
      "message.stepProcess.done.computer": "\u5DF2\u64CD\u4F5C\u7535\u8111",
      "message.stepProcess.images": "\u6B63\u5728\u67E5\u770B\u56FE\u50CF",
      "message.stepProcess.done.images": "\u5DF2\u67E5\u770B\u56FE\u50CF",
      "message.stepProcess.count": "{count} \u6B21\u64CD\u4F5C",
      "message.stepProcess.failures": "{count} \u9879\u5931\u8D25",
      "message.stepProcess.stopped": "{count} \u9879\u5DF2\u505C\u6B62",
      "message.stepProcess.done.thinking": "\u5DF2\u5B8C\u6210\u5206\u6790",
      "message.stepProcess.done.read": "\u5DF2\u8BFB\u53D6\u6587\u4EF6",
      "message.stepProcess.done.search": "\u5DF2\u641C\u7D22\u4EE3\u7801",
      "message.stepProcess.done.edit": "\u4FEE\u6539\u4E86\u6587\u4EF6",
      "message.stepProcess.done.commands": "\u5DF2\u8FD0\u884C\u547D\u4EE4",
      "message.stepProcess.done.code": "\u8FD0\u884C\u4E86\u4EE3\u7801",
      "message.stepProcess.done.webSearch": "\u5DF2\u641C\u7D22\u7F51\u9875",
      "message.stepProcess.done.webFetch": "\u5DF2\u8BBF\u95EE\u7F51\u9875",
      "message.stepProcess.done.subagents": "\u5DF2\u534F\u8C03\u5B50\u4EFB\u52A1",
      "message.stepProcess.done.plan": "\u66F4\u65B0\u4E86\u8BA1\u5212",
      "message.stepProcess.done.questions": "\u5411\u7528\u6237\u63D0\u51FA\u4E86\u95EE\u9898",
      "message.stepProcess.done.tools": "\u5DF2\u8C03\u7528\u5DE5\u5177",
      "message.stepProcess.joinTwo": "{first}\u5E76{second}",
      "message.stepProcess.comma": "\uFF0C",
      "message.stepProcess.sharedPrefix": "\u5DF2",
      "message.stepProcess.more": "{title}\u7B49",
      "message.trigger.request": "\u6536\u5230\u6267\u884C\u8BF7\u6C42",
      "message.trigger.goal": "\u7EE7\u7EED\u6267\u884C\u76EE\u6807",
      "message.trigger.agent": "\u6536\u5230\u4EFB\u52A1\u6D88\u606F",
      "message.trigger.team": "\u6536\u5230\u56E2\u961F\u6D88\u606F",
      "message.trigger.subagent": "\u5B50\u4EFB\u52A1\u72B6\u6001\u66F4\u65B0",
      "message.trigger.github": "\u6536\u5230 GitHub \u4E8B\u4EF6",
      "message.trigger.webhook": "\u6536\u5230\u5916\u90E8\u4E8B\u4EF6",
      "message.trigger.schedule": "\u5B9A\u65F6\u4EFB\u52A1",
      "message.trigger.job": "\u540E\u53F0\u4EFB\u52A1\u72B6\u6001\u66F4\u65B0",
      "message.trigger.plugin": "\u63D2\u4EF6\u72B6\u6001\u66F4\u65B0",
      "message.trigger.explanation": "\u8FD9\u6761\u901A\u77E5\u89E6\u53D1\u4E86\u672C\u8F6E\u56DE\u590D\u3002",
      "message.turnProcess.worked": "\u5DF2\u5B8C\u6210\u5DE5\u4F5C",
      "message.turnProcess.deepDivingFor": "\u6DF1\u5EA6\u6C42\u7D22\u4E2D\uFF0C\u7528\u65F6{duration}",
      "message.turnProcess.took": "\u7528\u65F6 {duration}",
      "message.turnProcess.failed": "\u5904\u7406\u5931\u8D25",
      "view.chat": "\u5BF9\u8BDD",
      "number.groupSeparator": ",",
      "duration.compactSeconds": "{seconds}\u79D2",
      "duration.compactMinutes": "{minutes}\u5206{seconds}\u79D2",
      "duration.milliseconds": "{milliseconds}\u6BEB\u79D2",
      "stats.counts": "{turns} \u8F6E {steps} \u6B65",
      "stats.cacheHit": "\u7F13\u5B58\u547D\u4E2D {percent}%",
      "stats.dialog.title": "\u4F1A\u8BDD\u7EDF\u8BA1",
      "stats.dialog.usageTitle": "Token \u7528\u91CF",
      "stats.dialog.llmTime": "\u6A21\u578B\u7528\u65F6",
      "stats.dialog.toolTime": "\u5DE5\u5177\u8C03\u7528\u7528\u65F6",
      "stats.dialog.ttft": "\u9996 token \u5E73\u5747\uFF08TTFT\uFF09",
      "stats.dialog.speed": "\u8F93\u51FA\u901F\u5EA6\uFF08TPS\uFF09",
      "chat.loadingHistory": "\u8F7D\u5165\u5386\u53F2\u2026",
      "chat.loadError": "\u5386\u53F2\u52A0\u8F7D\u5931\u8D25\uFF1A{message}\uFF08{code}\uFF09",
      "chat.loadOlder": "\u52A0\u8F7D\u66F4\u65E9",
      "chat.toBottom": "\u56DE\u5230\u5E95\u90E8",
      "chat.deepDiving": "\u6DF1\u5EA6\u6C42\u7D22\u4E2D",
      "chat.turnNavigation.label": "\u8F6E\u6B21\u5BFC\u822A",
      "chat.turnNavigation.jump": "\u8DF3\u8F6C\u5230\u7B2C {turn} \u8F6E",
      "chat.turnNavigation.jumpLoad": "\u52A0\u8F7D\u5E76\u8DF3\u8F6C\u5230\u7B2C {turn} \u8F6E",
      "chat.turnNavigation.turn": "\u7B2C {turn} \u8F6E",
      "settings.performance.title": "\u6027\u80FD\u4E0E\u7528\u91CF",
      "settings.performance.description": "\u9009\u62E9\u6027\u80FD\u4E0E\u7528\u91CF\u4FE1\u606F\u5C55\u793A\u7684\u8BE6\u7EC6\u7A0B\u5EA6",
      "settings.performance.compact": "\u7B80\u6D01",
      "settings.performance.detailed": "\u8BE6\u7EC6",
      "settings.links.title": "\u7F51\u9875\u94FE\u63A5\u9ED8\u8BA4\u6253\u5F00\u65B9\u5F0F",
      "settings.links.description": "\u5BF9\u8BDD\u4E2D\u7F51\u9875\u94FE\u63A5\u7684\u6253\u5F00\u4F4D\u7F6E",
      "settings.links.sidebar": "\u5E94\u7528\u5185\u4FA7\u8FB9\u680F",
      "settings.links.newTab": "\u9ED8\u8BA4\u6D4F\u89C8\u5668",
      "settings.transcript.title": "\u5DE5\u4F5C\u8FC7\u7A0B\u5C55\u793A",
      "settings.transcript.description": "\u63A7\u5236\u8F6E\u6B21\u548C\u6B65\u9AA4\u7684\u9ED8\u8BA4\u5C55\u5F00\u65B9\u5F0F",
      "settings.transcript.compact": "\u7B80\u6D01",
      "settings.transcript.detailed": "\u8BE6\u7EC6",
      "settings.transcript.expanded": "\u5B8C\u5168\u5C55\u5F00",
      "fileOpen.title": "\u65E0\u6CD5\u6253\u5F00\u6587\u4EF6",
      "fileOpen.unknown": "\u65E0\u6CD5\u6253\u5F00\u6B64\u6587\u4EF6",
      "message.extraBlock": "\u9644\u52A0\u5185\u5BB9\u5757",
      "message.systemPrompt": "\u7CFB\u7EDF\u63D0\u793A\u8BCD",
      "message.systemPromptUpdate": "\u7CFB\u7EDF\u63D0\u793A\u8BCD\u66F4\u65B0",
      "message.contextInjection": "\u4E0A\u4E0B\u6587\u6CE8\u5165",
      "message.contextRecall": "\u8DE8\u4F1A\u8BDD\u53EC\u56DE",
      "message.referenceSummary": "\u5F15\u7528\u4F1A\u8BDD \xB7 {labels}",
      "message.referenceSeparator": "\u3001",
      "message.context.instructions.loaded": "\u5DF2\u8F7D\u5165",
      "message.context.instructions.added": "\u5DF2\u65B0\u589E",
      "message.context.instructions.updated": "\u5DF2\u66F4\u65B0",
      "message.context.instructions.removed": "\u5DF2\u79FB\u9664",
      "message.context.catalog.replaced": "\u66FF\u6362\u76EE\u5F55",
      "message.context.catalog.more": "\u2026\u8FD8\u6709 {count} \u6761",
      "message.context.snapshot.supersedes": "\u53D6\u4EE3\u5148\u524D\u7684\u5FEB\u7167",
      "message.context.relay.from": "\u6765\u81EA\u4F1A\u8BDD {session}",
      "message.context.recall.counts": "\u4FDD\u7559 {retained} \u6761 \xB7 \u7701\u7565 {omitted} \u6761",
      "message.context.recall.truncated": "\u5DF2\u622A\u65AD",
      "message.compaction": "\u4E0A\u4E0B\u6587\u5DF2\u538B\u7F29",
      "message.compaction.running": "\u6B63\u5728\u538B\u7F29\u2026",
      "message.compaction.completed": "\u5DF2\u538B\u7F29 {items} \u6761\u5386\u53F2\u8BB0\u5F55\uFF08\u7EA6 {tokens} tokens\uFF09",
      "message.compaction.expand": "\u70B9\u51FB\u67E5\u770B\u538B\u7F29\u6458\u8981",
      "message.compaction.unavailable": "\u538B\u7F29\u6458\u8981\u4E0D\u53EF\u7528",
      "message.compaction.commandTitle": "compact",
      "message.think": "\u601D\u8003",
      "message.unknownSurface": "\u672A\u77E5 surface \u4E8B\u4EF6\uFF1A{type}",
      "message.unknownBlock": "\u672A\u77E5\u5185\u5BB9\u5757",
      "message.turnProcess.toolCalls.one": "{count} \u6B21\u5DE5\u5177\u8C03\u7528",
      "message.turnProcess.toolCalls.other": "{count} \u6B21\u5DE5\u5177\u8C03\u7528",
      "message.turnProcess.messages.one": "{count} \u6761\u6D88\u606F",
      "message.turnProcess.messages.other": "{count} \u6761\u6D88\u606F",
      "message.turnProcess.subagents.one": "{count} \u4E2A subagent",
      "message.turnProcess.subagents.other": "{count} \u4E2A subagent",
      "message.turnProcess.thoughtForAWhile": "\u5DF2\u601D\u8003",
      "message.turnProcess.separator": " \xB7 ",
      "message.stopped": "\u5DF2\u505C\u6B62",
      "message.branch": "\u5728\u65B0\u5BF9\u8BDD\u4E2D\u5206\u652F",
      "message.branchUnavailable": "\u4EC5\u53EF\u4ECE\u5DF2\u5B8C\u6210\u8F6E\u6B21\u7684\u6700\u540E\u4E00\u6761\u6D88\u606F\u5206\u652F",
      "message.retry.active": "\u6B63\u5728\u91CD\u8BD5\u6A21\u578B\u8BF7\u6C42",
      "message.retry.cancelled": "\u6A21\u578B\u8BF7\u6C42\u91CD\u8BD5\u5DF2\u53D6\u6D88",
      "message.retry.started": "\u5DF2\u91CD\u8BD5\u6A21\u578B\u8BF7\u6C42",
      "message.retry.scheduled": "\u7B49\u5F85\u91CD\u8BD5\u6A21\u578B\u8BF7\u6C42",
      "message.retry.status": "{label}\uFF08{retry}/{maximum}\uFF09 \xB7 {seconds}s",
      "message.retry.delay": "\u91CD\u8BD5\u5EF6\u8FDF\uFF1A",
      "message.retry.failure": "\u5931\u8D25\u539F\u56E0\uFF1A",
      "message.failure.auth": "API \u5BC6\u94A5\u65E0\u6548",
      "message.turnError": "\u672C\u8F6E\u8FD0\u884C\u5931\u8D25",
      "message.maxTokens": "\u5DF2\u8FBE\u5230\u8F93\u51FA token \u4E0A\u9650",
      "message.maxTokens.hint": "\u56DE\u7B54\u88AB\u622A\u65AD\uFF0C\u5DF2\u6709\u8F93\u51FA\u4FDD\u7559\u5728\u5BF9\u8BDD\u4E2D\u3002\u53D1\u9001\u201C\u7EE7\u7EED\u201D\u53EF\u8BA9\u6A21\u578B\u63A5\u7740\u8F93\u51FA\u3002",
      "message.tokensPerSecond": "{tps} tok/s",
      "message.turnUsage.title": "\u672C\u8F6E\u7528\u91CF",
      "message.turnUsage.consumed": "\u7528\u91CF {total}",
      "message.turnUsage.model": "\u63D0\u4F9B\u65B9 / \u6A21\u578B",
      "message.turnUsage.cacheHit": "\u7F13\u5B58\u547D\u4E2D",
      "message.turnUsage.input": "\u672A\u7F13\u5B58\u8F93\u5165",
      "message.turnUsage.cacheRead": "\u7F13\u5B58\u8BFB\u53D6",
      "message.turnUsage.cacheWrite": "\u7F13\u5B58\u5199\u5165",
      "message.turnUsage.output": "\u8F93\u51FA",
      "message.turnUsage.reasoning": "\uFF08\u5176\u4E2D\u63A8\u7406 {tokens}\uFF09",
      "message.turnUsage.count": "{count} tok",
      "duration.seconds": "{seconds}\u79D2",
      "duration.minutes": "{minutes}\u5206{seconds}\u79D2",
      "duration.hours": "{hours}\u5C0F\u65F6{minutes}\u5206{seconds}\u79D2",
      "command.running": "\u6267\u884C\u4E2D\u2026",
      "command.failed": "\u6307\u4EE4\u5931\u8D25",
      "command.done": "\u5DF2\u5B8C\u6210",
      "command.title": "\u6307\u4EE4",
      "row.running": "\u8FD0\u884C\u4E2D",
      "row.failed": "\u5931\u8D25",
      "json.truncated": "\u2026 \u5DF2\u622A\u65AD\uFF0C\u5171 {total} \u5B57\u7B26",
      "clock.md": "{m}\u6708{d}\u65E5",
      "clock.ymd": "{y}\u5E74{m}\u6708{d}\u65E5"
    };
    const en = {
      "message.stepProcess.thinking": "Analyzing the request",
      "message.stepProcess.read": "Reading files",
      "message.stepProcess.search": "Searching code",
      "message.stepProcess.edit": "Editing files",
      "message.stepProcess.commands": "Running commands",
      "message.stepProcess.code": "Running code",
      "message.stepProcess.webSearch": "Searching the web",
      "message.stepProcess.webFetch": "Visiting web pages",
      "message.stepProcess.subagents": "Coordinating subagents",
      "message.stepProcess.plan": "Updating the plan",
      "message.stepProcess.questions": "Waiting for your action",
      "message.stepProcess.tools": "Calling tools",
      "message.stepProcess.computer": "Operating computer",
      "message.stepProcess.done.computer": "Operated computer",
      "message.stepProcess.images": "Viewing images",
      "message.stepProcess.done.images": "Viewed images",
      "message.stepProcess.count": "{count} operations",
      "message.stepProcess.failures": "{count} failed",
      "message.stepProcess.stopped": "{count} stopped",
      "message.stepProcess.done.thinking": "Analysis completed",
      "message.stepProcess.done.read": "Read files",
      "message.stepProcess.done.search": "Searched code",
      "message.stepProcess.done.edit": "Edited files",
      "message.stepProcess.done.commands": "Ran commands",
      "message.stepProcess.done.code": "Ran code",
      "message.stepProcess.done.webSearch": "Searched the web",
      "message.stepProcess.done.webFetch": "Visited web pages",
      "message.stepProcess.done.subagents": "Coordinated subagents",
      "message.stepProcess.done.plan": "Updated the plan",
      "message.stepProcess.done.questions": "Asked questions",
      "message.stepProcess.done.tools": "Called tools",
      "message.stepProcess.joinTwo": "{first} and {second}",
      "message.stepProcess.comma": ", ",
      "message.stepProcess.sharedPrefix": "",
      "message.stepProcess.more": "{title}, etc.",
      "message.trigger.request": "Execution requested",
      "message.trigger.goal": "Continuing goal",
      "message.trigger.agent": "Task message received",
      "message.trigger.team": "Team message received",
      "message.trigger.subagent": "Subtask status updated",
      "message.trigger.github": "GitHub event received",
      "message.trigger.webhook": "External event received",
      "message.trigger.schedule": "Scheduled task",
      "message.trigger.job": "Background task updated",
      "message.trigger.plugin": "Plugin status updated",
      "message.trigger.explanation": "This notification triggered this response.",
      "message.turnProcess.worked": "Worked",
      "message.turnProcess.deepDivingFor": "Deep diving for {duration}",
      "message.turnProcess.took": "Took {duration}",
      "message.turnProcess.failed": "Failed",
      "view.chat": "Chat",
      "number.groupSeparator": ",",
      "duration.compactSeconds": "{seconds}s",
      "duration.compactMinutes": "{minutes}m{seconds}s",
      "duration.milliseconds": "{milliseconds}ms",
      "stats.counts": "{turns} turns {steps} steps",
      "stats.cacheHit": "Cache hit {percent}%",
      "stats.dialog.title": "Session statistics",
      "stats.dialog.usageTitle": "Token usage",
      "stats.dialog.llmTime": "LLM time",
      "stats.dialog.toolTime": "Tool time",
      "stats.dialog.ttft": "Avg time to first token (TTFT)",
      "stats.dialog.speed": "Tokens per second (TPS)",
      "chat.loadingHistory": "Loading history\u2026",
      "chat.loadError": "Failed to load history: {message} ({code})",
      "chat.loadOlder": "Load earlier",
      "chat.toBottom": "Back to bottom",
      "chat.deepDiving": "Deep diving...",
      "chat.turnNavigation.label": "Turn navigation",
      "chat.turnNavigation.jump": "Jump to turn {turn}",
      "chat.turnNavigation.jumpLoad": "Load and jump to turn {turn}",
      "chat.turnNavigation.turn": "Turn {turn}",
      "settings.performance.title": "Performance & usage",
      "settings.performance.description": "Choose how much performance and usage information to show",
      "settings.performance.compact": "Compact",
      "settings.performance.detailed": "Detailed",
      "settings.links.title": "Open chat links in",
      "settings.links.description": "Choose where to open web links",
      "settings.links.sidebar": "In-App Sidebar",
      "settings.links.newTab": "Default Browser",
      "settings.transcript.title": "Work details",
      "settings.transcript.description": "Controls how turns and steps expand by default",
      "settings.transcript.compact": "Compact",
      "settings.transcript.detailed": "Detailed",
      "settings.transcript.expanded": "Expanded",
      "fileOpen.title": "Couldn\u2019t open file",
      "fileOpen.unknown": "Couldn\u2019t open this file",
      "message.extraBlock": "Extra content block",
      "message.systemPrompt": "System prompt",
      "message.systemPromptUpdate": "System prompt update",
      "message.contextInjection": "Context injection",
      "message.contextRecall": "Session recall",
      "message.referenceSummary": "Referenced session \xB7 {labels}",
      "message.referenceSeparator": ", ",
      "message.context.instructions.loaded": "loaded",
      "message.context.instructions.added": "added",
      "message.context.instructions.updated": "updated",
      "message.context.instructions.removed": "removed",
      "message.context.catalog.replaced": "Replacement catalog",
      "message.context.catalog.more": "\u2026 {count} more",
      "message.context.snapshot.supersedes": "Supersedes earlier snapshots",
      "message.context.relay.from": "From session {session}",
      "message.context.recall.counts": "{retained} kept \xB7 {omitted} omitted",
      "message.context.recall.truncated": "truncated",
      "message.compaction": "Context compacted",
      "message.compaction.running": "Compacting context\u2026",
      "message.compaction.completed": "Compacted {items} history items (~{tokens} tokens)",
      "message.compaction.expand": "View compaction summary",
      "message.compaction.unavailable": "Compaction summary unavailable",
      "message.compaction.commandTitle": "compact",
      "message.think": "Think",
      "message.unknownSurface": "Unknown surface event: {type}",
      "message.unknownBlock": "Unknown content block",
      "message.turnProcess.toolCalls.one": "{count} tool call",
      "message.turnProcess.toolCalls.other": "{count} tool calls",
      "message.turnProcess.messages.one": "{count} message",
      "message.turnProcess.messages.other": "{count} messages",
      "message.turnProcess.subagents.one": "{count} subagent",
      "message.turnProcess.subagents.other": "{count} subagents",
      "message.turnProcess.thoughtForAWhile": "Thought for a while",
      "message.turnProcess.separator": " \xB7 ",
      "message.stopped": "Stopped",
      "message.branch": "Branch into a new conversation",
      "message.branchUnavailable": "Available only on the last message of a completed turn",
      "message.retry.active": "Retrying model request",
      "message.retry.cancelled": "Model request retry cancelled",
      "message.retry.started": "Retried model request",
      "message.retry.scheduled": "Waiting to retry model request",
      "message.retry.status": "{label} ({retry}/{maximum}) \xB7 {seconds}s",
      "message.retry.delay": "Retry delay: ",
      "message.retry.failure": "Failure reason: ",
      "message.failure.auth": "API key is invalid",
      "message.turnError": "This turn failed",
      "message.maxTokens": "Output token limit reached",
      "message.maxTokens.hint": 'The reply was cut off; earlier output is preserved in the conversation. Send "continue" to let the model resume.',
      "message.tokensPerSecond": "{tps} tok/s",
      "message.turnUsage.title": "Turn usage",
      "message.turnUsage.consumed": "Usage {total}",
      "message.turnUsage.model": "Provider / model",
      "message.turnUsage.cacheHit": "Cache hit",
      "message.turnUsage.input": "Uncached input",
      "message.turnUsage.cacheRead": "Cached input",
      "message.turnUsage.cacheWrite": "Cache write",
      "message.turnUsage.output": "Output",
      "message.turnUsage.reasoning": " ({tokens} reasoning)",
      "message.turnUsage.count": "{count} tok",
      "duration.seconds": "{seconds}s",
      "duration.minutes": "{minutes}m {seconds}s",
      "duration.hours": "{hours}h {minutes}m {seconds}s",
      "command.running": "Running\u2026",
      "command.failed": "Command failed",
      "command.done": "Completed",
      "command.title": "Command",
      "row.running": "Running",
      "row.failed": "Failed",
      "json.truncated": "\u2026 truncated, {total} characters total",
      "clock.md": "{m}/{d}",
      "clock.ymd": "{y}-{m}-{d}"
    };
    const css$10 = ".TTCZqG_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
    const tagId$10 = "@deepseek-ai/dsh-client-ui-chat/accessibility.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$10) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$10;
      tag.textContent = css$10;
      document.head.appendChild(tag);
    }
    var accessibility_module_css_default = { "visuallyHidden": "TTCZqG_visuallyHidden" };
    const css$9 = '.lcKema_root{flex-direction:column;display:flex}.lcKema_root:not([data-expanded]){contain:size layout;height:calc(24px + var(--dsh-content-font-delta,0px))}.lcKema_row{position:relative;overflow:hidden}.lcKema_root[data-expanded] [data-open] [data-disclosure-row]{z-index:1;background:var(--dsw-alias-bg-base);position:sticky;top:0}.lcKema_root[data-state=running] .lcKema_row:after{content:"";inset-block:0;background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite lcKema_dsh-reasoning-row-sweep;position:absolute;left:0}@keyframes lcKema_dsh-reasoning-row-sweep{0%{left:-300px}90%,to{left:100%}}.lcKema_leading{flex-shrink:0}.lcKema_chevron{color:var(--dsw-alias-label-secondary)}.lcKema_title{font-weight:400}.lcKema_separator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.lcKema_summary{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;flex:auto;overflow:hidden}.lcKema_summaryText{text-overflow:ellipsis;display:block;overflow:hidden}.lcKema_summary[data-streaming]{mask-image:linear-gradient(90deg,#000 calc(100% - 48px),#0000)}.lcKema_summary[data-streaming] .lcKema_summaryText{text-overflow:clip;overflow:visible}.lcKema_root:not([data-preview]) .lcKema_separator,.lcKema_root:not([data-preview]) .lcKema_summary{display:none}.lcKema_thinkBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0}@media (prefers-reduced-motion:reduce){.lcKema_root[data-state=running] .lcKema_row:after{animation:none}}';
    const tagId$9 = "@deepseek-ai/dsh-client-ui-chat/ReasoningRow.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$9) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$9;
      tag.textContent = css$9;
      document.head.appendChild(tag);
    }
    var ReasoningRow_module_css_default = {
      "chevron": "lcKema_chevron",
      "dsh-reasoning-row-sweep": "lcKema_dsh-reasoning-row-sweep",
      "leading": "lcKema_leading",
      "root": "lcKema_root",
      "row": "lcKema_row",
      "separator": "lcKema_separator",
      "summary": "lcKema_summary",
      "summaryText": "lcKema_summaryText",
      "thinkBody": "lcKema_thinkBody",
      "title": "lcKema_title"
    };
    const THINK_ICON = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutlineRegular, { size: 14 });
    function firstLine(text) {
      const newline = text.indexOf("\n");
      return newline === -1 ? text : text.slice(0, newline);
    }
    function latestCompletedParagraphFirstLine(text) {
      let summary = "";
      let paragraphStart = 0;
      const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
      while (true) {
        const nextParagraph = separator.exec(text);
        const paragraphEnd = nextParagraph === null ? text.length : nextParagraph.index + nextParagraph[0].indexOf("\n");
        const newline = text.indexOf("\n", paragraphStart);
        if (newline !== -1 && newline <= paragraphEnd) {
          const candidate = text.slice(paragraphStart, newline).trim();
          if (candidate !== "") summary = candidate;
        }
        if (nextParagraph === null) return summary;
        paragraphStart = nextParagraph.index + nextParagraph[0].length;
      }
    }
    const ReasoningRow = (0, react.memo)(function ReasoningRow2({ text, running, usePresentation, useDisclosure: useDisclosure2, t }) {
      const { expanded, toggle } = useDisclosure2();
      const labels = (0, react.useMemo)(() => markdownLabels(t), [t]);
      const summaryText = running ? latestCompletedParagraphFirstLine(text) : firstLine(text);
      const summary = (0, react.useMemo)(() => summaryText.replaceAll("**", ""), [summaryText]);
      const preview2 = usePresentation((policy) => !expanded && summary !== "" && (running || policy.settledReasoningPreview));
      const collapsedContent = (0, react.useMemo)(() => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
        className: ReasoningRow_module_css_default.separator,
        "aria-hidden": true
      }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
        className: ReasoningRow_module_css_default.summary,
        "data-streaming": running || void 0,
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
          className: ReasoningRow_module_css_default.summaryText,
          children: summary
        })
      })] }), [running, summary]);
      const content = (0, react.useMemo)(() => expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        className: ReasoningRow_module_css_default.thinkBody,
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
          text,
          streaming: running,
          labels,
          variant: "compact"
        })
      }) : void 0, [
        expanded,
        labels,
        running,
        text
      ]);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: ReasoningRow_module_css_default.root,
        "data-variant": "think",
        "data-state": running ? "running" : "ok",
        "data-expanded": expanded || void 0,
        "data-preview": preview2 || void 0,
        children: [running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
          className: accessibility_module_css_default.visuallyHidden,
          children: t("row.running")
        }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
          rowClassName: ReasoningRow_module_css_default.row,
          leadingClassName: ReasoningRow_module_css_default.leading,
          titleClassName: ReasoningRow_module_css_default.title,
          chevronClassName: ReasoningRow_module_css_default.chevron,
          icon: THINK_ICON,
          title: t("message.think"),
          open: expanded,
          expandable: true,
          expandOnRowClick: true,
          onToggle: toggle,
          collapsedContent,
          children: content
        })]
      });
    });
    const css$8 = ".hWmORq_root{font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary);flex-direction:column;display:flex}.hWmORq_body{flex-direction:column;gap:16px;display:flex}.hWmORq_body .md-table-wide{--dsh-table-spare:max(0px, calc((100cqw - var(--dsh-chat-content-width)) / 2));--dsh-table-lead:calc(var(--dsh-table-spare) + min(var(--dsh-chat-content-width), 100cqw) - 100%);box-sizing:border-box;width:calc(100% + var(--dsh-table-lead) + var(--dsh-table-spare));max-width:none;margin-left:calc(-1 * var(--dsh-table-lead));padding-left:var(--dsh-table-lead)}.hWmORq_body .md-table-wide>table{z-index:1;position:relative}.hWmORq_body>[data-turn-process-inline][hidden]{margin-bottom:-16px}.hWmORq_stopped{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:6px;align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}.hWmORq_actions{margin-top:16px;margin-left:-6px}";
    const tagId$8 = "@deepseek-ai/dsh-client-ui-chat/AssistantMarkdown.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$8) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$8;
      tag.textContent = css$8;
      document.head.appendChild(tag);
    }
    var AssistantMarkdown_module_css_default = {
      "actions": "hWmORq_actions",
      "body": "hWmORq_body",
      "root": "hWmORq_root",
      "stopped": "hWmORq_stopped"
    };
    function localPathMediaUrl(base2, value) {
      if (!value.startsWith("/") || value.startsWith("//")) return void 0;
      if (!base2.startsWith("http:") && !base2.startsWith("https:")) return void 0;
      return new URL(`api/file?path=${encodeURIComponent(value)}`, base2).href;
    }
    const AssistantMarkdown = (0, react.memo)(function AssistantMarkdown2({ blocks, streaming, interrupted, renderMessageImages, groupPart, useDisclosure: useDisclosure2, reasoningHidden = false, usePresentation, revealProcess, mentions, t }) {
      const labels = (0, react.useMemo)(() => markdownLabels(t), [t]);
      const pathImages = (0, react.useMemo)(() => {
        return { resolve: (value) => localPathMediaUrl(document.baseURI, value) };
      }, []);
      const last = blocks.length - 1;
      if (!(streaming || interrupted === true || blocks.some((block) => block.kind !== "tool-call"))) return null;
      const rendered = [];
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block === void 0) continue;
        if (groupPart === "reasoning" && block.kind !== "reasoning") continue;
        if (groupPart === "response" && block.kind === "reasoning") continue;
        switch (block.kind) {
          case "text":
            rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
              text: block.text,
              streaming,
              labels,
              fileMentions: mentions,
              pathImages
            }, i));
            break;
          case "reasoning": {
            const start = i;
            const parts = [block.text];
            while (i + 1 < blocks.length) {
              const next = blocks[i + 1];
              if (next?.kind !== "reasoning") break;
              parts.push(next.text);
              i += 1;
            }
            rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProcessReasoning, {
              hidden: reasoningHidden,
              reveal: revealProcess,
              children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReasoningRow, {
                text: parts.join("\n\n"),
                running: streaming && i === last,
                usePresentation,
                useDisclosure: useDisclosure2,
                t
              })
            }, start));
            break;
          }
          case "image": {
            const start = i;
            const group = [block];
            while (i + 1 < blocks.length) {
              const next = blocks[i + 1];
              if (next === void 0 || next.kind !== "image") break;
              group.push(next);
              i += 1;
            }
            rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: renderMessageImages({
              images: group.map(({ attachment }) => ({ attachment })),
              align: "start"
            }) }, start));
            break;
          }
          case "tool-call":
            break;
          default:
            rendered.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
              label: t("message.unknownBlock"),
              payload: block.block,
              truncatedLabel: (total) => t("json.truncated", { total })
            }, i));
        }
      }
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        className: AssistantMarkdown_module_css_default.root,
        "data-streaming": streaming || void 0,
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          className: AssistantMarkdown_module_css_default.body,
          children: [rendered, interrupted && (groupPart === void 0 || groupPart === "response" || !blocks.some((block) => block.kind !== "reasoning" && block.kind !== "tool-call")) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: AssistantMarkdown_module_css_default.stopped,
            children: t("message.stopped")
          })]
        })
      });
    });
    function ProcessReasoning({ hidden, reveal, children }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        ref: useSearchableHidden(hidden, reveal ?? NOOP),
        "data-turn-process-inline": hidden || void 0,
        children
      });
    }
    const NOOP = () => {
    };
    const AssistantNodeView = (0, react.memo)(function AssistantNodeView2({ node, groupPart, useDisclosure: useDisclosure2, useTurnData, turnProcess, openFile, renderMessageImages, fileMentions, usePresentation, t }) {
      const data = node.data;
      const turn = node.location.kind === "turn" || node.location.kind === "step" ? node.location.turn : void 0;
      const tail = useTurnData("turn-tail");
      const owner = (0, react.useMemo)(() => {
        if (turn?.status !== "closed" || data.finalNode === void 0) return void 0;
        if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return void 0;
        return {
          turn,
          seq: data.finalNode.seq,
          openFile
        };
      }, [
        data.finalNode,
        openFile,
        tail,
        turn
      ]);
      const mentions = (0, react.useMemo)(() => owner === void 0 ? void 0 : fileMentions(owner), [fileMentions, owner]);
      const reasoningHidden = turnProcess !== void 0 && turnProcess.foldable && turnProcess.spec.answerStep === data.step && turnProcess.spec.inlineReasoning && !turnProcess.open;
      const revealProcess = (0, react.useCallback)(() => {
        turnProcess?.setOpen(true);
      }, [turnProcess]);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistantMarkdown, {
        blocks: data.blocks,
        groupPart,
        useDisclosure: useDisclosure2,
        streaming: data.status === "running",
        interrupted: data.status === "interrupted",
        renderMessageImages,
        reasoningHidden,
        usePresentation,
        revealProcess,
        mentions,
        t
      });
    });
    const css$7 = "._5OnbHa_root{flex-direction:column;display:flex}._5OnbHa_leading{flex-shrink:0}._5OnbHa_chevron{color:var(--dsw-alias-label-secondary)}._5OnbHa_title{font-weight:400;transition:color .1s}._5OnbHa_separator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}._5OnbHa_summary{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;flex:auto;transition:color .1s;overflow:hidden}._5OnbHa_row:hover ._5OnbHa_title,._5OnbHa_row:hover ._5OnbHa_summary:not([data-error]){color:var(--dsw-alias-label-primary)}._5OnbHa_summary[data-error],._5OnbHa_body[data-error]{color:var(--dsw-alias-state-error-primary)}._5OnbHa_body{border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);max-height:260px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-markdown-code-block-small);white-space:pre-wrap;border-radius:12px;margin:4px 0 4px 4px;padding:12px 16px;overflow:auto}";
    const tagId$7 = "@deepseek-ai/dsh-client-ui-chat/GenericCommandCard.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$7) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$7;
      tag.textContent = css$7;
      document.head.appendChild(tag);
    }
    var GenericCommandCard_module_css_default = {
      "body": "_5OnbHa_body",
      "chevron": "_5OnbHa_chevron",
      "leading": "_5OnbHa_leading",
      "root": "_5OnbHa_root",
      "row": "_5OnbHa_row",
      "separator": "_5OnbHa_separator",
      "summary": "_5OnbHa_summary",
      "title": "_5OnbHa_title"
    };
    const COMMAND_ICON = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutlineRegular, { size: 14 });
    function stateOf(outcome) {
      if (outcome === null) return "running";
      return outcome.kind === "error" ? "error" : "ok";
    }
    const GenericCommandCard = (0, react.memo)(function GenericCommandCard2({ node, t, runningSummary }) {
      const [expanded, setExpanded] = (0, react.useState)(false);
      const text = node.outcome?.text;
      const summary = node.outcome === null ? runningSummary ?? t("command.running") : text ?? (node.outcome.kind === "error" ? t("command.failed") : t("command.done"));
      const title = node.name ?? t("command.title");
      const state = stateOf(node.outcome);
      const running = state === "running";
      const body = text !== void 0 && text.includes("\n") ? text : null;
      const open = expanded && body !== null;
      const toggle = (0, react.useCallback)(() => {
        setExpanded((value) => !value);
      }, []);
      const collapsedContent = (0, react.useMemo)(() => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
        className: GenericCommandCard_module_css_default.separator,
        "aria-hidden": true
      }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
        className: GenericCommandCard_module_css_default.summary,
        "data-error": state === "error" || void 0,
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TextShimmer, {
          active: running,
          children: summary
        })
      })] }), [
        running,
        state,
        summary
      ]);
      const content = (0, react.useMemo)(() => open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
        className: GenericCommandCard_module_css_default.body,
        "data-error": state === "error" || void 0,
        children: body
      }) : void 0, [
        body,
        open,
        state
      ]);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: GenericCommandCard_module_css_default.root,
        "data-variant": "others",
        "data-state": state,
        children: [
          state === "running" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: accessibility_module_css_default.visuallyHidden,
            children: t("row.running")
          }),
          state === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: accessibility_module_css_default.visuallyHidden,
            children: t("row.failed")
          }),
          /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
            rowClassName: GenericCommandCard_module_css_default.row,
            leadingClassName: GenericCommandCard_module_css_default.leading,
            titleClassName: GenericCommandCard_module_css_default.title,
            chevronClassName: GenericCommandCard_module_css_default.chevron,
            icon: COMMAND_ICON,
            title,
            running,
            open,
            expandable: body !== null,
            expandOnRowClick: true,
            keepContentWhenOpen: true,
            onToggle: toggle,
            collapsedContent,
            children: content
          })
        ]
      });
    });
    function CompactionCommandCard({ node, compaction, t }) {
      if (compaction !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CompactionItem, {
        node: compaction,
        title: t("message.compaction.commandTitle"),
        fallbackSummary: node.outcome?.text ?? null,
        t
      });
      if (node.outcome !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GenericCommandCard, {
        node,
        t
      });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GenericCommandCard, {
        node,
        t,
        runningSummary: t("message.compaction.running")
      });
    }
    const CommandNodeView = (0, react.memo)(function CommandNodeView2({ node, renderSlot, t }) {
      const command = node.data;
      const owner = (0, react.useMemo)(() => ({ node: command }), [command]);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        className: ChatView_module_css_default.callRow,
        children: renderSlot("conversation.chat.commandview", owner, {
          entryKey: command.name ?? "",
          fallback: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GenericCommandCard, {
            ...owner,
            t
          })
        })
      });
    });
    const ManualCompactionNodeView = (0, react.memo)(function ManualCompactionNodeView2({ node, t }) {
      const data = node.data;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        className: ChatView_module_css_default.callRow,
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CompactionCommandCard, {
          node: data.command,
          ...data.compaction === null ? {} : { compaction: data.compaction },
          t
        })
      });
    });
    function SystemPromptRow({ text, update = false, t }) {
      const [open, setOpen] = (0, react.useState)(false);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
        className: ContextInjectionRow_module_css_default.root,
        icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular, { size: 14 }),
        chevronClassName: ContextInjectionRow_module_css_default.chevron,
        title: t(update ? "message.systemPromptUpdate" : "message.systemPrompt"),
        open,
        expandable: true,
        expandOnRowClick: true,
        onToggle: () => {
          setOpen((value) => !value);
        },
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
          className: ContextInjectionRow_module_css_default.body,
          "data-system-prompt-body": true,
          children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpaqueBody, {
            content: [{
              type: "text",
              text
            }],
            source: null,
            t
          })
        })
      });
    }
    const SystemPromptNodeView = (0, react.memo)(function SystemPromptNodeView2({ node, t }) {
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SystemPromptRow, {
        text: node.data.text,
        update: node.data.update === true,
        t
      });
    });
    const css$6 = ".l_V-RG_root{box-sizing:border-box;width:100%;min-width:0;height:calc(33px + var(--dsh-content-font-delta,0px));border:none;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);cursor:pointer;text-align:left;background:0 0;align-items:center;padding:0 0 8px;transition:color .1s;display:flex}.l_V-RG_root:disabled{cursor:default}.l_V-RG_root:not(:disabled):hover{color:var(--dsw-alias-label-primary)}.l_V-RG_root:not([data-open]){margin-bottom:8px}.l_V-RG_chevron{width:14px;height:14px;color:var(--dsw-alias-label-caption);flex:none;margin-left:4px;transition:transform .1s}.l_V-RG_root[data-open] .l_V-RG_chevron{transform:rotate(180deg)}.l_V-RG_label{min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;overflow:hidden}@media (prefers-reduced-motion:reduce){.l_V-RG_root,.l_V-RG_chevron{transition:none}}";
    const tagId$6 = "@deepseek-ai/dsh-client-ui-chat/TurnProcessNodeView.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$6) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$6;
      tag.textContent = css$6;
      document.head.appendChild(tag);
    }
    var TurnProcessNodeView_module_css_default = {
      "chevron": "l_V-RG_chevron",
      "label": "l_V-RG_label",
      "root": "l_V-RG_root"
    };
    const TurnProcessNodeView = (0, react.memo)(function TurnProcessNodeView2({ node, turnProcess, t }) {
      if (turnProcess === void 0) throw new Error("turn-process node requires Turn process owner state");
      const open = turnProcess.open;
      const turn = node.location.kind === "turn" || node.location.kind === "step" ? node.location.turn : void 0;
      const [now, setNow] = (0, react.useState)(Date.now);
      const ticking = turnProcess.foldable && turn?.status === "open";
      (0, react.useEffect)(() => {
        if (!ticking) return;
        setNow(Date.now());
        const timer = setInterval(() => {
          setNow(Date.now());
        }, LIVE_RUN_CLOCK_INTERVAL_MS);
        return () => {
          clearInterval(timer);
        };
      }, [ticking]);
      if (!turnProcess.foldable) return null;
      const canCollapse = turnProcess.hasContent && !turnProcessAlwaysOpen(node);
      const running = turn?.status === "open";
      const reason = turn?.end?.data.reason.kind;
      const elapsedMs = turn?.start === void 0 ? void 0 : Math.max(1e3, (turn.end?.time ?? now) - turn.start.time);
      const duration = elapsedMs === void 0 ? void 0 : running ? formatLiveRunDuration(elapsedMs, t) : formatRunDuration(elapsedMs, t);
      const label = running ? duration === void 0 ? t("chat.deepDiving") : t("message.turnProcess.deepDivingFor", { duration }) : reason === "aborted" ? t("message.stopped") : reason === "error" ? t("message.turnProcess.failed") : duration === void 0 ? t("message.turnProcess.worked") : t("message.turnProcess.took", { duration });
      const announcement = running ? t("chat.deepDiving") : reason === "aborted" ? t("message.stopped") : reason === "error" ? t("message.turnProcess.failed") : t("message.turnProcess.worked");
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
        className: accessibility_module_css_default.visuallyHidden,
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
        children: announcement
      }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
        type: "button",
        className: TurnProcessNodeView_module_css_default.root,
        "data-open": open || void 0,
        "data-turn-process": node.data.turn,
        "data-turn-process-messages": node.data.messageCount,
        "data-turn-process-tool-calls": node.data.toolCallCount,
        "data-turn-process-subagents": node.data.subagentCount,
        disabled: !canCollapse,
        "aria-expanded": turnProcess.hasContent ? open : void 0,
        onClick: (event) => {
          event.currentTarget.focus();
          turnProcess.setOpen(!open);
        },
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
          className: TurnProcessNodeView_module_css_default.label,
          children: label
        }), canCollapse && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: TurnProcessNodeView_module_css_default.chevron })]
      })] });
    });
    function formatTokens(value, t) {
      const scaled = (candidate) => candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
      if (value < 1e3) return String(value);
      if (value < 1e6) return t("number.thousand", { value: scaled(value / 1e3) });
      return t("number.million", { value: scaled(value / 1e6) });
    }
    function formatExactTokens(value, t) {
      const digits = String(value);
      const groups = [];
      for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
      return groups.join(t("number.groupSeparator"));
    }
    function roundedPercentUnits(cacheReadTokens, denominator, decimalPlaces) {
      const scale = (decimalPlaces === 0 ? 1 : 10) * 100;
      const doubledScale = scale * 2;
      const denominatorQuotient = Math.floor(denominator / doubledScale);
      const denominatorRemainder = denominator % doubledScale;
      let lower = 0;
      let upper = scale;
      while (lower < upper) {
        const candidate = Math.floor((lower + upper + 1) / 2);
        const factor = candidate * 2 - 1;
        if (cacheReadTokens >= factor * denominatorQuotient + Math.ceil(factor * denominatorRemainder / doubledScale)) lower = candidate;
        else upper = candidate - 1;
      }
      return lower;
    }
    function displayPercentUnits(units, decimalPlaces) {
      if (decimalPlaces === 0) return String(units);
      const whole = Math.floor(units / 10);
      const tenths = units % 10;
      return tenths === 0 ? String(whole) : `${whole}.${tenths}`;
    }
    function formatCacheHitPercent(cacheReadTokens, promptTokens, decimalPlaces = 0) {
      if (promptTokens === 0) return null;
      const missedInputTokens = promptTokens - cacheReadTokens;
      if (missedInputTokens === 0) return "100";
      const roundedUnits = roundedPercentUnits(cacheReadTokens, promptTokens, decimalPlaces);
      if (roundedUnits < (decimalPlaces === 0 ? 100 : 1e3)) return displayPercentUnits(roundedUnits, decimalPlaces);
      let distinguishingPlaces = 1;
      let scaledDoubleGap = missedInputTokens * 200;
      const denominatorTens = Math.floor(promptTokens / 10);
      while (scaledDoubleGap <= denominatorTens) {
        scaledDoubleGap *= 10;
        distinguishingPlaces += 1;
      }
      const denominatorOnes = promptTokens % 10;
      let roundedLoss = 5;
      for (let loss = 1; loss < 5; loss += 1) {
        const factor = loss * 2 + 1;
        const threshold = factor * denominatorTens + Math.floor(factor * denominatorOnes / 10);
        if (scaledDoubleGap <= threshold) {
          roundedLoss = loss;
          break;
        }
      }
      return `99.${"9".repeat(distinguishingPlaces - 1)}${10 - roundedLoss}`;
    }
    const PANEL_MARGIN = 12;
    const PANEL_GAP = 8;
    const MEASURE_STYLE = {
      visibility: "hidden",
      left: 0,
      top: 0
    };
    function useStatDialog(controlled) {
      const [ownOpen, setOwnOpen] = (0, react.useState)(false);
      const open = controlled?.open ?? ownOpen;
      const setOpen = controlled?.setOpen ?? setOwnOpen;
      const rootRef = (0, react.useRef)(null);
      const panelRef = (0, react.useRef)(null);
      const pos = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
        open,
        anchorRef: rootRef,
        panelRef,
        side: "top",
        gap: PANEL_GAP,
        margin: PANEL_MARGIN
      });
      (0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open, setOpen, panelRef);
      (0, react.useEffect)(() => {
        if (!open) return;
        const onKeyDown = (e) => {
          if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
          document.removeEventListener("keydown", onKeyDown);
        };
      }, [open, setOpen]);
      return {
        open,
        setOpen,
        rootRef,
        panelRef,
        pos
      };
    }
    const css$5 = ".Q51KRG_root{min-width:0;display:inline-flex}.Q51KRG_root+.Q51KRG_root{margin-left:-6px}.Q51KRG_trigger{min-width:0;height:calc(28px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);font-variant-numeric:tabular-nums;line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:28px;align-items:center;gap:4px;padding:6px 8px;display:inline-flex}.Q51KRG_label{text-overflow:ellipsis;min-width:0;overflow:hidden}.Q51KRG_trigger svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px));flex:none}.Q51KRG_trigger:hover,.Q51KRG_trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary)}@media (width<=480px){.Q51KRG_trigger{width:calc(28px + var(--dsh-content-font-delta,0px));justify-content:center;padding:6px}.Q51KRG_trigger .Q51KRG_label{display:none}.Q51KRG_root+.Q51KRG_root{margin-left:0}}";
    const tagId$5 = "@deepseek-ai/dsh-client-ui-chat/TurnUsagePanel.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$5) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$5;
      tag.textContent = css$5;
      document.head.appendChild(tag);
    }
    var TurnUsagePanel_module_css_default = {
      "label": "Q51KRG_label",
      "root": "Q51KRG_root",
      "trigger": "Q51KRG_trigger"
    };
    const css$4 = ".bRhRbq_panel{z-index:1100;box-sizing:border-box;background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;border-radius:12px;padding:16px;font-size:12px;line-height:18px;position:fixed}.bRhRbq_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}.bRhRbq_titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}.bRhRbq_titleValue{font-variant-numeric:tabular-nums}.bRhRbq_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}.bRhRbq_titleLabel svg{flex:none;width:14px;height:14px}.bRhRbq_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}.bRhRbq_details dt,.bRhRbq_details dd{min-width:0;margin:0}.bRhRbq_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}.bRhRbq_details .bRhRbq_route{overflow-wrap:anywhere}.bRhRbq_reasoning{color:var(--dsw-alias-label-tertiary);white-space:nowrap}";
    const tagId$4 = "@deepseek-ai/dsh-client-ui-chat/stat-dialog.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$4;
      tag.textContent = css$4;
      document.head.appendChild(tag);
    }
    var stat_dialog_module_css_default = {
      "details": "bRhRbq_details",
      "panel": "bRhRbq_panel",
      "reasoning": "bRhRbq_reasoning",
      "route": "bRhRbq_route",
      "title": "bRhRbq_title",
      "titleLabel": "bRhRbq_titleLabel",
      "titleRule": "bRhRbq_titleRule",
      "titleValue": "bRhRbq_titleValue"
    };
    function formatCompactCount(value, t) {
      return t("message.turnUsage.count", { count: formatTokens(value, t) });
    }
    function formatExactCount(value, t) {
      return t("message.turnUsage.count", { count: formatExactTokens(value, t) });
    }
    function TurnUsagePanel({ usage, t }) {
      const { open, setOpen, rootRef, panelRef, pos } = useStatDialog();
      const cacheHit = usage.cacheReadTokens === void 0 ? null : formatCacheHitPercent(usage.cacheReadTokens, usage.totalTokens - usage.outputTokens, 1);
      const total = formatCompactCount(usage.totalTokens, t);
      const routes = usage.routes?.map((route) => `${route.provider}/${route.model}`).join(", ") ?? "";
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
        ref: rootRef,
        className: TurnUsagePanel_module_css_default.root,
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
          type: "button",
          className: TurnUsagePanel_module_css_default.trigger,
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          onClick: () => {
            setOpen(!open);
          },
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDatabaseOutlineRegular, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
            className: TurnUsagePanel_module_css_default.label,
            children: t("message.turnUsage.consumed", { total })
          })]
        }), open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          ref: panelRef,
          className: stat_dialog_module_css_default.panel,
          role: "dialog",
          "aria-label": t("message.turnUsage.title"),
          style: pos ?? MEASURE_STYLE,
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
              className: stat_dialog_module_css_default.title,
              children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
                className: stat_dialog_module_css_default.titleLabel,
                children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDatabaseOutlineRegular, {}), t("message.turnUsage.title")]
              }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
                className: stat_dialog_module_css_default.titleValue,
                children: formatExactCount(usage.totalTokens, t)
              })]
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              className: stat_dialog_module_css_default.titleRule,
              "aria-hidden": true
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
              className: stat_dialog_module_css_default.details,
              "data-turn-usage-details": true,
              children: [
                routes !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.model") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", {
                  className: stat_dialog_module_css_default.route,
                  children: routes
                })] }),
                cacheHit !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.cacheHit") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: `${cacheHit}%` })] }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.input") }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatExactCount(usage.uncachedInputTokens, t) }),
                usage.cacheReadTokens !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.cacheRead") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatExactCount(usage.cacheReadTokens, t) })] }),
                usage.cacheWriteTokens !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.cacheWrite") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatExactCount(usage.cacheWriteTokens, t) })] }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.output") }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [formatExactCount(usage.outputTokens, t), usage.reasoningTokens !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
                  className: stat_dialog_module_css_default.reasoning,
                  children: t("message.turnUsage.reasoning", { tokens: formatExactCount(usage.reasoningTokens, t) })
                })] })
              ]
            })
          ]
        }), document.body)]
      });
    }
    function assistantText(blocks) {
      return blocks.flatMap((block) => block.kind === "text" ? [block.text] : []).join("");
    }
    function hasAssistantReplyContent(blocks) {
      return blocks.some((block) => {
        if (block.kind === "reasoning" || block.kind === "tool-call") return false;
        if (block.kind === "text") return block.text.trim() !== "";
        return true;
      });
    }
    const css$3 = ".TS9iAW_root{flex-direction:column;gap:16px;display:flex}.TS9iAW_actions{margin-top:4px;margin-left:-6px}";
    const tagId$3 = "@deepseek-ai/dsh-client-ui-chat/TurnTailNodeView.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$3;
      tag.textContent = css$3;
      document.head.appendChild(tag);
    }
    var TurnTailNodeView_module_css_default = {
      "actions": "TS9iAW_actions",
      "root": "TS9iAW_root"
    };
    function lastContent(snapshot2, turn, skipWarning) {
      const keys = snapshot2.locations.getTurn(turn);
      for (let index = keys.length - 1; index >= 0; index--) {
        const node = snapshot2.nodes.get(keys[index]);
        if (node === void 0 || node.kind === "turn-tail" || node.kind === "turn-process" || skipWarning && node.kind === "turn-max-tokens") continue;
        return node;
      }
    }
    const TurnTailNodeView = (0, react.memo)(function TurnTailNodeView2({ node, openFile, forkAt, renderSlot, t, useChat, usePerformanceUsage }) {
      const detailed = usePerformanceUsage((mode) => mode) === "detailed";
      const data = node.data;
      const hasLaterChatNode = useChat((snapshot2) => (lastContent(snapshot2, data.turn, true)?.anchorSeq ?? -1) > (data.closing?.finalNode.seq ?? data.seq));
      const endsWithResponse = useChat((snapshot2) => {
        if (snapshot2.timeline.turnOrder.at(-1) !== data.turn) return false;
        const last = lastContent(snapshot2, data.turn, false);
        const block = last?.kind === "assistant-step" ? last.data.blocks.findLast((candidate) => candidate.kind !== "text" && candidate.kind !== "reasoning" || candidate.text.trim() !== "") : void 0;
        return block !== void 0 && hasAssistantReplyContent([block]);
      });
      const turn = node.location.kind === "turn" || node.location.kind === "step" ? node.location.turn : void 0;
      if (turn === void 0) return null;
      const closing = data.closing;
      const tail = renderSlot("conversation.chat.turnTail", {
        turn,
        seq: closing?.finalNode.seq ?? data.seq,
        openFile
      });
      if (closing === null) return tail === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
        className: TurnTailNodeView_module_css_default.root,
        "data-turn-tail": data.turn,
        children: tail
      });
      const messageId = closing.finalNode.messageId;
      const assistantActions = messageId === void 0 ? null : renderSlot("conversation.chat.assistant-actions", { messageId });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: TurnTailNodeView_module_css_default.root,
        "data-turn-tail": data.turn,
        "data-actions-reveal": endsWithResponse ? "always" : "hover",
        children: [tail, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageIconActions, {
          text: assistantText(closing.blocks),
          time: closing.time,
          clock: "end",
          onBranch: () => {
            forkAt(data.seq);
          },
          branchUnavailable: data.branchUnavailable || hasLaterChatNode,
          className: TurnTailNodeView_module_css_default.actions,
          extraActions: assistantActions,
          usageAction: detailed && data.tokenUsage !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnUsagePanel, {
            usage: data.tokenUsage,
            t
          }) : null,
          t
        })]
      });
    });
    function record(value) {
      return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
    }
    function field(source, key) {
      return typeof source[key] === "string" ? source[key] : "";
    }
    function turnTriggerDetails(node) {
      const source = record(node.source);
      const kind = field(source, "kind");
      let title = "message.trigger.request";
      let icon = "request";
      switch (kind) {
        case "goal":
          title = "message.trigger.goal";
          icon = "goal";
          break;
        case "agent-message":
          title = "message.trigger.agent";
          icon = "agent";
          break;
        case "team-message":
          title = "message.trigger.team";
          icon = "team";
          break;
        case "subagent-settled":
          title = "message.trigger.subagent";
          icon = "subagent";
          break;
        case "webhook": {
          const github = field(source, "provider") === "github";
          title = github ? "message.trigger.github" : "message.trigger.webhook";
          icon = github ? "github" : "webhook";
          break;
        }
        case "schedule":
          title = "message.trigger.schedule";
          icon = "schedule";
          break;
        case "tool-jobs":
          title = "message.trigger.job";
          icon = "job";
          break;
        case "cordis-host-runner":
          title = "message.trigger.plugin";
          icon = "plugin";
          break;
        default:
          break;
      }
      return {
        title,
        icon
      };
    }
    const css$2 = ".oz9t_a_root{border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);border-radius:16px;min-width:0;transition:background-color .1s}.oz9t_a_root:hover{background:var(--dsw-alias-interactive-bg-hover)}.oz9t_a_header{width:100%;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:10px;padding:12px 16px;display:flex}.oz9t_a_icon{color:var(--dsw-alias-label-tertiary);flex:none;display:inline-flex}.oz9t_a_title{font:var(--dsw-font-xs-13);flex:none}.oz9t_a_time{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xxs-12);flex:none;margin-left:auto}.oz9t_a_chevron,.oz9t_a_openChevron{color:var(--dsw-alias-label-tertiary);flex:none}.oz9t_a_openChevron{transform:rotate(180deg)}.oz9t_a_body{padding:0 16px 12px 40px}.oz9t_a_explanation{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);margin:8px 0}.oz9t_a_content{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;font:var(--dsw-font-xxs-12);overflow:auto}@media (prefers-reduced-motion:reduce){.oz9t_a_root{transition:none}}";
    const tagId$2 = "@deepseek-ai/dsh-client-ui-chat/TurnTriggerNodeView.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$2;
      tag.textContent = css$2;
      document.head.appendChild(tag);
    }
    var TurnTriggerNodeView_module_css_default = {
      "body": "oz9t_a_body",
      "chevron": "oz9t_a_chevron",
      "content": "oz9t_a_content",
      "explanation": "oz9t_a_explanation",
      "header": "oz9t_a_header",
      "icon": "oz9t_a_icon",
      "openChevron": "oz9t_a_openChevron",
      "root": "oz9t_a_root",
      "time": "oz9t_a_time",
      "title": "oz9t_a_title"
    };
    const TRIGGER_ICONS = {
      request: _deepseek_ai_dsh_client_ui_primitives.IconContextInjectionOutlineRegular,
      goal: _deepseek_ai_dsh_client_ui_primitives.IconGoalOutlineRegular,
      agent: _deepseek_ai_dsh_client_ui_primitives.IconPaperPlaneOutlineRegular,
      team: _deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutlineRegular,
      subagent: _deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutlineRegular,
      github: _deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular,
      webhook: _deepseek_ai_dsh_client_ui_primitives.IconGlobeOutlineRegular,
      schedule: _deepseek_ai_dsh_client_ui_primitives.IconAlarmClockOutlineRegular,
      job: _deepseek_ai_dsh_client_ui_primitives.IconQueueOutlineRegular,
      plugin: _deepseek_ai_dsh_client_ui_primitives.IconCordisPluginOutlineRegular
    };
    function TurnTriggerNodeView({ node, t }) {
      const [open, setOpen] = (0, react.useState)(false);
      const bodyId = (0, react.useId)();
      const details = turnTriggerDetails(node.data);
      const TriggerIcon = TRIGGER_ICONS[details.icon];
      const date = new Date(node.data.time);
      const time = formatMessageClock(node.data.time, t);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
        className: TurnTriggerNodeView_module_css_default.root,
        "data-turn-trigger": true,
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
          className: TurnTriggerNodeView_module_css_default.header,
          type: "button",
          "aria-expanded": open,
          "aria-controls": bodyId,
          onClick: () => {
            setOpen(!open);
          },
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: TurnTriggerNodeView_module_css_default.icon,
              "aria-hidden": true,
              children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TriggerIcon, { size: 14 })
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: TurnTriggerNodeView_module_css_default.title,
              children: t(details.title)
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
              className: TurnTriggerNodeView_module_css_default.time,
              dateTime: date.toISOString(),
              children: time
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
              size: 12,
              className: open ? TurnTriggerNodeView_module_css_default.openChevron : TurnTriggerNodeView_module_css_default.chevron
            })
          ]
        }), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          id: bodyId,
          className: TurnTriggerNodeView_module_css_default.body,
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
            className: TurnTriggerNodeView_module_css_default.explanation,
            children: t("message.trigger.explanation")
          }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
            className: TurnTriggerNodeView_module_css_default.content,
            children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NoticeBody, {
              content: node.data.content,
              source: node.data.source,
              t
            })
          })]
        })]
      });
    }
    function registerChatNodeRenderers(ctx, performanceUsage, presentation) {
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "user",
        locale: NS
      }, UserMessageNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "steering",
        locale: NS
      }, UserMessageNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "context",
        locale: NS
      }, ContextMessageNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "turn-trigger",
        locale: NS
      }, TurnTriggerNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "system-prompt",
        locale: NS
      }, SystemPromptNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "assistant-step",
        locale: NS,
        inject: () => ({ hooks: { presentation } })
      }, AssistantNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "command",
        locale: NS,
        children: { "conversation.chat.commandview": {
          kind: "keyed",
          scope: "session"
        } }
      }, CommandNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "manual-compaction",
        locale: NS
      }, ManualCompactionNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "compaction",
        locale: NS
      }, CompactionNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "model-retry",
        locale: NS
      }, RetryNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "turn-error",
        locale: NS
      }, TurnErrorNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "turn-max-tokens",
        locale: NS
      }, TurnMaxTokensNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "turn-process",
        locale: NS
      }, TurnProcessNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "turn-tail",
        locale: NS,
        inject: () => ({ hooks: { performanceUsage } }),
        children: {
          "conversation.chat.turnTail": {
            kind: "list",
            scope: "session"
          },
          "conversation.chat.assistant-actions": {
            kind: "list",
            scope: "session"
          }
        }
      }, TurnTailNodeView));
      ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
        name: "conversation.chat.node",
        key: "unknown",
        locale: NS
      }, UnknownNodeView));
    }
    function usageOutputTokens(usage) {
      if (typeof usage !== "object" || usage === null) return null;
      const value = usage.outputTokens;
      return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    }
    function assistantStepReading(node) {
      const timing = node.timing;
      return {
        ttftMs: timing !== void 0 && timing.stepStartTime !== null && timing.firstTokenTime !== null ? Math.max(0, timing.firstTokenTime - timing.stepStartTime) : null,
        decodeMs: timing !== void 0 && timing.firstTokenTime !== null ? Math.max(0, timing.completedTime - timing.firstTokenTime) : null,
        outputTokens: usageOutputTokens(node.usage)
      };
    }
    const css$1 = ".bOPqQW_root{box-sizing:border-box;min-width:0;max-width:100%;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));justify-content:center;gap:12px;display:flex}.bOPqQW_anchor{min-width:0;display:inline-flex}.bOPqQW_pill{box-sizing:border-box;max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;border-radius:24px;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}.bOPqQW_pill svg{flex:none;width:14px;height:14px}button.bOPqQW_pill{cursor:pointer}button.bOPqQW_pill:hover,button.bOPqQW_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.bOPqQW_label{text-overflow:ellipsis;min-width:0;overflow:hidden}.bOPqQW_sep{color:var(--dsw-alias-separator-primary);margin:0 6px}";
    const tagId$1 = "@deepseek-ai/dsh-client-ui-chat/StatsPills.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId$1;
      tag.textContent = css$1;
      document.head.appendChild(tag);
    }
    var StatsPills_module_css_default = {
      "anchor": "bOPqQW_anchor",
      "label": "bOPqQW_label",
      "pill": "bOPqQW_pill",
      "root": "bOPqQW_root",
      "sep": "bOPqQW_sep"
    };
    function deriveStats(nodes) {
      const turns = /* @__PURE__ */ new Set();
      let steps = 0;
      let llmMs = 0;
      let toolMs = 0;
      let ttftMs = 0;
      let ttftSteps = 0;
      let decodeMs = 0;
      let decodeTokens = 0;
      for (const node of nodes) {
        if (node.kind === "tool-result") {
          if (node.callTime !== null) toolMs += Math.max(0, node.time - node.callTime);
          continue;
        }
        if (node.kind !== "assistant") continue;
        turns.add(node.turn);
        steps += 1;
        if (node.timing !== void 0 && node.timing.stepStartTime !== null) llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime);
        const reading = assistantStepReading(node);
        if (reading.ttftMs !== null) {
          ttftMs += reading.ttftMs;
          ttftSteps += 1;
        }
        if (reading.decodeMs !== null && reading.outputTokens !== null) {
          decodeMs += reading.decodeMs;
          decodeTokens += reading.outputTokens;
        }
      }
      return {
        turns: turns.size,
        steps,
        llmMs,
        toolMs,
        ttftMs,
        ttftSteps,
        decodeMs,
        decodeTokens
      };
    }
    function formatDuration(ms, t) {
      const s = ms / 1e3;
      if (s < 60) return t("duration.compactSeconds", { seconds: Math.round(s * 10) / 10 });
      const whole = Math.round(s);
      return t("duration.compactMinutes", {
        minutes: Math.floor(whole / 60),
        seconds: whole % 60
      });
    }
    function cacheHitPercent(usage) {
      const denominator = billedInputTokens(usage);
      return formatCacheHitPercent(usage.cacheReadTokens, denominator);
    }
    function billedInputTokens(usage) {
      return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    }
    function exactCount(value, t) {
      return t("message.turnUsage.count", { count: formatExactTokens(value, t) });
    }
    function TimePill({ stats, t, dialog }) {
      const { open, setOpen, rootRef, panelRef, pos } = useStatDialog(dialog);
      const counts = t("stats.counts", {
        turns: stats.turns,
        steps: stats.steps
      });
      const tps = stats.decodeMs > 0 ? t("message.tokensPerSecond", { tps: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1e3)) }) : null;
      const label = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
        className: StatsPills_module_css_default.label,
        children: [counts, tps !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
          className: StatsPills_module_css_default.sep,
          "aria-hidden": true,
          children: "\xB7"
        }), tps] })]
      });
      if (stats.llmMs <= 0 && stats.toolMs <= 0 && stats.ttftSteps <= 0 && stats.decodeMs <= 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
        className: StatsPills_module_css_default.anchor,
        children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
          className: StatsPills_module_css_default.pill,
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGaugeOutlineRegular, {}), label]
        })
      });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
        ref: rootRef,
        className: StatsPills_module_css_default.anchor,
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
          type: "button",
          className: StatsPills_module_css_default.pill,
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-label": tps === null ? counts : `${counts} \xB7 ${tps}`,
          onClick: () => {
            setOpen(!open);
          },
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGaugeOutlineRegular, {}), label]
        }), open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          ref: panelRef,
          className: stat_dialog_module_css_default.panel,
          role: "dialog",
          "aria-label": t("stats.dialog.title"),
          style: pos ?? MEASURE_STYLE,
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              className: stat_dialog_module_css_default.title,
              children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
                className: stat_dialog_module_css_default.titleLabel,
                children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGaugeOutlineRegular, {}), t("stats.dialog.title")]
              })
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              className: stat_dialog_module_css_default.titleRule,
              "aria-hidden": true
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
              className: stat_dialog_module_css_default.details,
              "data-session-stats-details": true,
              children: [
                stats.llmMs > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("stats.dialog.llmTime") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatDuration(stats.llmMs, t) })] }),
                stats.toolMs > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("stats.dialog.toolTime") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatDuration(stats.toolMs, t) })] }),
                stats.ttftSteps > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("stats.dialog.ttft") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: formatDuration(stats.ttftMs / stats.ttftSteps, t) })] }),
                stats.decodeMs > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("stats.dialog.speed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("message.tokensPerSecond", { tps: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1e3)) }) })] })
              ]
            })
          ]
        }), document.body)]
      });
    }
    function UsagePill({ usage, t, dialog }) {
      const { open, setOpen, rootRef, panelRef, pos } = useStatDialog(dialog);
      const total = billedInputTokens(usage) + usage.outputTokens;
      const totalText = t("message.turnUsage.count", { count: formatTokens(total, t) });
      const cacheHit = cacheHitPercent(usage);
      const cacheHitText = cacheHit !== null ? t("stats.cacheHit", { percent: cacheHit }) : null;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
        ref: rootRef,
        className: StatsPills_module_css_default.anchor,
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
          type: "button",
          className: StatsPills_module_css_default.pill,
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-label": cacheHitText === null ? totalText : `${totalText} \xB7 ${cacheHitText}`,
          onClick: () => {
            setOpen(!open);
          },
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDatabaseOutlineRegular, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
            className: StatsPills_module_css_default.label,
            children: [totalText, cacheHitText !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
              className: StatsPills_module_css_default.sep,
              "aria-hidden": true,
              children: "\xB7"
            }), cacheHitText] })]
          })]
        }), open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          ref: panelRef,
          className: stat_dialog_module_css_default.panel,
          role: "dialog",
          "aria-label": t("stats.dialog.usageTitle"),
          style: pos ?? MEASURE_STYLE,
          children: [
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
              className: stat_dialog_module_css_default.title,
              children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
                className: stat_dialog_module_css_default.titleLabel,
                children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDatabaseOutlineRegular, {}), t("stats.dialog.usageTitle")]
              }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
                className: stat_dialog_module_css_default.titleValue,
                children: exactCount(total, t)
              })]
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
              className: stat_dialog_module_css_default.titleRule,
              "aria-hidden": true
            }),
            /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
              className: stat_dialog_module_css_default.details,
              "data-session-stats-usage": true,
              children: [
                cacheHit !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.cacheHit") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: `${cacheHit}%` })] }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.input") }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: exactCount(usage.uncachedInputTokens, t) }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.cacheRead") }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: exactCount(usage.cacheReadTokens, t) }),
                usage.cacheWriteTokens !== 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.cacheWrite") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: exactCount(usage.cacheWriteTokens, t) })] }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("message.turnUsage.output") }),
                /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: exactCount(usage.outputTokens, t) })
              ]
            })
          ]
        }), document.body)]
      });
    }
    const StatsPills = (0, react.memo)(function StatsPills2({ useChat, useProjection, usePerformanceUsage, t }) {
      const mode = usePerformanceUsage((value) => value);
      const settledNodes = useChat((s) => s.legacy.nodes);
      const usage = useProjection("tokenUsage");
      const [openPill, setOpenPill] = (0, react.useState)(null);
      const projected = useProjection("sessionStats");
      const stats = (0, react.useMemo)(() => projected ?? deriveStats(settledNodes), [projected, settledNodes]);
      const hasTokens = usage !== void 0 && (billedInputTokens(usage) > 0 || usage.outputTokens > 0);
      if (mode === "compact") {
        const speed = stats.decodeMs > 0 ? t("message.tokensPerSecond", { tps: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1e3)) }) : null;
        const cacheHit = hasTokens ? cacheHitPercent(usage) : null;
        if (speed === null && cacheHit === null) return null;
        return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          className: StatsPills_module_css_default.root,
          "data-composer-stats": true,
          children: [speed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
            className: StatsPills_module_css_default.pill,
            children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGaugeOutlineRegular, {}), speed]
          }), cacheHit !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
            className: StatsPills_module_css_default.pill,
            children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDatabaseOutlineRegular, {}), t("stats.cacheHit", { percent: cacheHit })]
          })]
        });
      }
      if (stats.steps === 0 && !hasTokens) return null;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: StatsPills_module_css_default.root,
        "data-composer-stats": true,
        children: [stats.steps > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TimePill, {
          stats,
          t,
          dialog: {
            open: openPill === "time",
            setOpen: (open) => {
              setOpenPill(open ? "time" : null);
            }
          }
        }), hasTokens && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsagePill, {
          usage,
          t,
          dialog: {
            open: openPill === "usage",
            setOpen: (open) => {
              setOpenPill(open ? "usage" : null);
            }
          }
        })]
      });
    });
    const CHAT_SYNTHETIC_SEQ_OFFSETS = {
      interruptedAssistant: -0.9,
      interruptedFollowup: -0.8,
      processControl: -0.1,
      maxTokensNotice: 0.05,
      finalizedFollowup: 0.1
    };
    function contextLocation(context) {
      return context.start?.location ?? context.matches[0]?.location ?? { kind: "unresolved" };
    }
    function chatNode(context, kind, anchorSeq, data, options = {}) {
      return {
        key: context.key,
        kind,
        id: context.id,
        target: "chat",
        anchorSeq,
        location: options.location ?? contextLocation(context),
        visibility: options.visibility ?? "visible",
        data
      };
    }
    function asRecord(value) {
      return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
    }
    function readString(record2, key) {
      const value = record2[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    }
    function collect(source, member, field2) {
      const list = source[member];
      if (!Array.isArray(list)) return [];
      const seen = [];
      for (const entry of list) {
        const record2 = asRecord(entry);
        const value = record2 === null ? null : readString(record2, field2);
        if (value !== null && !seen.includes(value)) seen.push(value);
      }
      return seen;
    }
    function joined(names2) {
      return names2.length > 0 ? names2.join(", ") : null;
    }
    const KNOWN_FORMS = [
      "instructions",
      "catalog",
      "snapshot",
      "notice",
      "relay",
      "recall"
    ];
    function contextForm(source) {
      const record2 = asRecord(source);
      const form = record2 === null ? null : readString(record2, "form");
      return form !== null && KNOWN_FORMS.includes(form) ? form : null;
    }
    function contextProducer(source) {
      const record2 = asRecord(source);
      const kind = record2 === null ? null : readString(record2, "kind");
      if (record2 === null || kind === null) return {
        role: "inject",
        label: null
      };
      switch (kind) {
        case "session-reference":
          return {
            role: "recall",
            label: joined(collect(record2, "references", "label")) ?? kind
          };
        case "agent-instructions":
          return {
            role: "inject",
            label: joined(collect(record2, "changes", "path")) ?? kind
          };
        case "skill-invocation":
          return {
            role: "inject",
            label: readString(record2, "name") ?? kind
          };
        default:
          return {
            role: "inject",
            label: kind
          };
      }
    }
    function sessionRecallLabels(source) {
      const record2 = asRecord(source);
      if (record2 === null || readString(record2, "kind") !== "session-reference") return [];
      return collect(record2, "references", "label");
    }
    function skillInvocationName(source) {
      const record2 = asRecord(source);
      if (record2 === null || readString(record2, "kind") !== "skill-invocation") return null;
      return readString(record2, "name");
    }
    function toAssistantBlocks(content) {
      return content.map(toAssistantBlock);
    }
    function toAssistantBlock(block) {
      switch (block.type) {
        case "text":
          return {
            kind: "text",
            text: block.text
          };
        case "reasoning":
          return {
            kind: "reasoning",
            text: block.text
          };
        case "image":
          return {
            kind: "image",
            attachment: block.attachment
          };
        case "tool-call":
          return {
            kind: "tool-call",
            callId: String(block.id),
            name: block.name,
            argsRaw: block.arguments
          };
        default:
          return {
            kind: "other",
            block
          };
      }
    }
    function emptyAssistantBlock(blockType) {
      switch (blockType) {
        case "text":
          return {
            kind: "text",
            text: ""
          };
        case "reasoning":
          return {
            kind: "reasoning",
            text: ""
          };
        case "tool-call":
          return {
            kind: "tool-call",
            callId: "",
            name: "",
            argsRaw: ""
          };
        default:
          return {
            kind: "other",
            block: null
          };
      }
    }
    function displayFailure(failure) {
      if (failure === null || typeof failure !== "object") return { message: String(failure) };
      const record2 = failure;
      const code = typeof record2.code === "string" ? record2.code : void 0;
      if (code === "AUTH") return {
        code,
        message: ""
      };
      return {
        ...code === void 0 ? {} : { code },
        message: typeof record2.message === "string" ? record2.message : JSON.stringify(failure)
      };
    }
    function isTokenDelta(chunk) {
      switch (chunk.type) {
        case "text-delta":
        case "reasoning-delta":
          return chunk.text !== "";
        case "tool-call-delta":
          return chunk.argumentsDelta !== "" || chunk.name !== void 0;
        default:
          return false;
      }
    }
    function initialState(turn, step) {
      return {
        turn,
        step,
        blocks: [],
        visibleBlocks: 0,
        firstVisibleSeq: void 0,
        firstVisibleTime: void 0,
        firstTokenTime: void 0,
        final: void 0,
        usage: void 0
      };
    }
    function compactBlocks(blocks) {
      return blocks.filter((block) => block !== void 0);
    }
    function blockIsVisible(block) {
      if (block === void 0 || block.kind === "tool-call") return false;
      if (block.kind === "text" || block.kind === "reasoning") return block.text.trim() !== "";
      return true;
    }
    function countVisibleBlocks(blocks) {
      let count = 0;
      for (const block of blocks) if (blockIsVisible(block)) count++;
      return count;
    }
    function hasVisibleContent(blocks) {
      return blocks.some(blockIsVisible);
    }
    function hasInterruptionEvidence(blocks) {
      return blocks.some((block) => {
        if (block.kind === "text" || block.kind === "reasoning") return block.text.trim() !== "";
        return true;
      });
    }
    function resetForRetry(state) {
      return {
        ...initialState(state.turn, state.step),
        firstTokenTime: state.firstTokenTime
      };
    }
    function updateChunk(state, chunk, seq, time) {
      const blocks = [...state.blocks];
      let changedIndex = -1;
      let previousVisible = false;
      switch (chunk.type) {
        case "block-start":
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(blocks[chunk.index]);
          blocks[chunk.index] = emptyAssistantBlock(chunk.blockType);
          break;
        case "text-delta": {
          const previous = blocks[chunk.index];
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(previous);
          blocks[chunk.index] = {
            kind: "text",
            text: (previous?.kind === "text" ? previous.text : "") + chunk.text
          };
          break;
        }
        case "reasoning-delta": {
          const previous = blocks[chunk.index];
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(previous);
          blocks[chunk.index] = {
            kind: "reasoning",
            text: (previous?.kind === "reasoning" ? previous.text : "") + chunk.text
          };
          break;
        }
        case "tool-call-delta": {
          const previous = blocks[chunk.index];
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(previous);
          const base2 = previous?.kind === "tool-call" ? previous : {
            kind: "tool-call",
            callId: "",
            name: "",
            argsRaw: ""
          };
          blocks[chunk.index] = {
            kind: "tool-call",
            callId: base2.callId || String(chunk.id),
            name: chunk.name ?? base2.name,
            argsRaw: base2.argsRaw + chunk.argumentsDelta
          };
          break;
        }
        case "block-end":
          changedIndex = chunk.index;
          previousVisible = blockIsVisible(blocks[chunk.index]);
          blocks[chunk.index] = toAssistantBlock(chunk.block);
          break;
        case "usage":
          return {
            ...state,
            usage: chunk.usage
          };
        default:
          return state;
      }
      const visibleBlocks = state.visibleBlocks - Number(previousVisible) + Number(blockIsVisible(blocks[changedIndex]));
      const firstToken = isTokenDelta(chunk);
      return {
        ...state,
        blocks,
        visibleBlocks,
        ...visibleBlocks > 0 && state.firstVisibleSeq === void 0 ? {
          firstVisibleSeq: seq,
          firstVisibleTime: time
        } : {},
        ...firstToken && state.firstTokenTime === void 0 ? { firstTokenTime: time } : {}
      };
    }
    function settleMessage(state, match, event) {
      const blocks = toAssistantBlocks(event.data.message.content);
      return {
        ...state,
        blocks,
        visibleBlocks: countVisibleBlocks(blocks),
        final: match,
        usage: event.data.usage
      };
    }
    function closedBoundary(location) {
      if (location.kind === "step" && location.step.status === "closed" && location.step.end !== void 0) return location.step.end;
      if ((location.kind === "step" || location.kind === "turn") && location.turn.status === "closed" && location.turn.end !== void 0) return location.turn.end;
    }
    function finalNode(state, context) {
      const final = state.final;
      if (final?.event.type === "assistant/message") {
        const event = final.event;
        return {
          kind: "assistant",
          seq: event.seq,
          messageId: event.data.message.id,
          time: event.time,
          turn: state.turn,
          step: state.step,
          blocks: toAssistantBlocks(event.data.message.content),
          usage: event.data.usage,
          timing: {
            stepStartTime: context.start?.event.time ?? null,
            firstTokenTime: state.firstTokenTime ?? null,
            completedTime: event.time
          },
          ...event.data.interrupted === true ? { interrupted: true } : {}
        };
      }
      const location = context.start?.location ?? context.matches.at(-1)?.location;
      const boundary = location === void 0 ? void 0 : closedBoundary(location);
      if (boundary === void 0) return void 0;
      const blocks = compactBlocks(state.blocks);
      if (!hasInterruptionEvidence(blocks)) return void 0;
      return {
        kind: "assistant",
        seq: boundary.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.interruptedAssistant,
        time: boundary.time,
        turn: state.turn,
        step: state.step,
        blocks,
        interrupted: true
      };
    }
    function fallbackState$5(context) {
      let state;
      for (const match of context.matches) {
        if (match.event.type === "assistant/live-chunk") {
          state ??= initialState(match.event.data.turn, match.event.data.step);
          state = updateChunk(state, match.event.data.chunk, match.event.seq, match.event.time);
          continue;
        }
        if (match.event.type === "assistant/message") {
          state ??= initialState(match.event.data.turn, match.event.data.step);
          state = settleMessage(state, match, match.event);
          continue;
        }
        if (match.event.type === "llm/retry" && state !== void 0) state = resetForRetry(state);
      }
      return state;
    }
    function projectAssistant(context) {
      const state = context.state ?? fallbackState$5(context);
      if (state === void 0) return void 0;
      const settled = finalNode(state, context);
      const blocks = settled?.blocks ?? compactBlocks(state.blocks);
      const visible = settled === void 0 ? state.visibleBlocks > 0 : hasVisibleContent(blocks);
      const status = settled?.interrupted === true ? "interrupted" : settled === void 0 ? "running" : "settled";
      const anchorSeq = settled?.seq ?? state.firstVisibleSeq ?? context.matches[0]?.event.seq ?? 0;
      const time = settled?.time ?? state.firstVisibleTime ?? context.matches[0]?.event.time ?? 0;
      return {
        anchorSeq,
        visible,
        settled,
        data: {
          status,
          turn: state.turn,
          step: state.step,
          blocks,
          time,
          ...state.usage === void 0 ? {} : { usage: state.usage },
          ...settled === void 0 ? {} : { finalNode: settled }
        }
      };
    }
    function publishedAssistantData(context) {
      const location = context.start?.location ?? context.matches.at(-1)?.location;
      return location?.kind === "step" ? location.step.data.get("assistant-step") : void 0;
    }
    const assistantDefinition = {
      kind: "assistant-step",
      target: "chat",
      match: (event) => {
        if (event.type === "step/start") return {
          id: `${event.data.turn}:${event.data.step}`,
          role: "start"
        };
        if (event.type === "assistant/live-chunk" || event.type === "assistant/message" && event.surfaceOp === "append") return {
          id: `${event.data.turn}:${event.data.step}`,
          role: "update"
        };
        if (event.type === "llm/retry") return {
          id: `${event.data.turn}:${event.data.step}`,
          role: "update"
        };
        return null;
      },
      start: (_context, match) => {
        if (match.event.type !== "step/start") throw new Error("assistant-step start requires step/start");
        return initialState(match.event.data.turn, match.event.data.step);
      },
      update: (context, match) => {
        if (match.event.type === "assistant/live-chunk") return updateChunk(context.state, match.event.data.chunk, match.event.seq, match.event.time);
        if (match.event.type === "assistant/message") return settleMessage(context.state, match, match.event);
        if (match.event.type === "llm/retry") return resetForRetry(context.state);
        return context.state;
      },
      publication: (match) => {
        if (match.event.type === "step/start") return "none";
        if (match.event.type !== "assistant/live-chunk") return "immediate";
        const type = match.event.data.chunk.type;
        return type === "usage" || type === "finish" ? "none" : "animation-frame";
      },
      buildLocationData: (context, scope) => {
        if (scope !== "step") return null;
        const projected = projectAssistant(context);
        if (projected === void 0) return null;
        return {
          kind: "step",
          turn: projected.data.turn,
          step: projected.data.step,
          key: "assistant-step",
          value: projected.data
        };
      },
      buildViewNode: (context) => {
        const current = context.current.get("chat");
        const state = context.state ?? fallbackState$5(context);
        const data = publishedAssistantData(context);
        if (state === void 0 || data === void 0) return current == null ? null : {
          ...current,
          visibility: "hidden"
        };
        const settled = data.finalNode;
        const visible = settled === void 0 ? state.visibleBlocks > 0 : hasVisibleContent(data.blocks);
        if (settled === void 0 && !visible && current == null) return null;
        return chatNode(context, "assistant-step", settled?.seq ?? state.firstVisibleSeq ?? context.matches[0]?.event.seq ?? 0, data, { visibility: settled?.interrupted === true || visible ? "visible" : "hidden" });
      }
    };
    function registerAssistantConversationNode(ctx) {
      ctx.uiConversation.events.register(assistantDefinition);
    }
    function isSettledTool(block) {
      return "kind" in block;
    }
    function isRunningTool(block) {
      return !isSettledTool(block);
    }
    function isVisibleChatNode(node) {
      return node.visibility === "visible" && node.kind !== "system-prompt" && node.kind !== "context" && !(node.kind === "command" && node.data.name === "permission");
    }
    const PROMPT_PREVIEW_LIMIT = 50;
    const RESPONSE_PREVIEW_LIMIT = 120;
    function preview(parts, limit) {
      let text = "";
      let unread = false;
      for (const part of parts) {
        if (text.length >= limit * 2) {
          unread = true;
          break;
        }
        const clipped = part.length > limit * 2;
        const chunk = clipped ? part.slice(0, limit * 2) : part;
        text += text === "" ? chunk : ` ${chunk}`;
        if (clipped) {
          unread = true;
          break;
        }
      }
      const normalized = text.replace(/\s+/g, " ").trim();
      if (normalized.length > limit - 1) return `${normalized.slice(0, limit - 1).trimEnd()}\u2026`;
      return unread ? `${normalized}\u2026` : normalized;
    }
    function promptText(node) {
      if (node.kind !== "user") return "";
      return preview(node.data.content.flatMap((block) => block.type === "text" ? [block.text] : []), PROMPT_PREVIEW_LIMIT);
    }
    function responseText(node) {
      if (node.kind !== "assistant-step") return "";
      return preview(node.data.blocks.flatMap((block) => block.kind === "text" ? [block.text] : []), RESPONSE_PREVIEW_LIMIT);
    }
    function sameTurnNavigationItem(left, right) {
      if (left === void 0 || right === void 0) return left === right;
      return left.turn === right.turn && left.anchorKey === right.anchorKey && left.prompt === right.prompt && left.response === right.response;
    }
    function turnNavigationItem(turn, locations, nodes) {
      const loaded = locations.getTurn(turn).map((key) => nodes.get(key)).filter((node) => node !== void 0 && isVisibleChatNode(node));
      const user = loaded.find((node) => node.kind === "user");
      const anchor = user ?? loaded[0];
      if (anchor === void 0) return void 0;
      const response = loaded.findLast((node) => responseText(node) !== "");
      return {
        turn,
        anchorKey: anchor.key,
        prompt: user === void 0 ? "" : promptText(user),
        response: response === void 0 ? "" : responseText(response)
      };
    }
    function nodeTurn(node) {
      const location = node?.location;
      return location?.kind === "turn" || location?.kind === "step" ? location.turn.turn : void 0;
    }
    function samePresentation(left, right) {
      return left === right || left !== void 0 && right !== void 0 && left.spec === right.spec && left.turn === right.turn && left.turnStarted === right.turnStarted && left.turnClosed === right.turnClosed && left.hasExternalProcess === right.hasExternalProcess && left.hasInterleavedInput === right.hasInterleavedInput && left.compactAnswer === right.compactAnswer;
    }
    function derivePresentation(turn, locations, nodes) {
      const keys = locations.getTurn(turn);
      const control = keys.map((key) => nodes.get(key)).find((node) => node?.kind === "turn-process");
      if (control === void 0) return void 0;
      const spec = control.data;
      const location = control.location;
      if (location.kind !== "turn" && location.kind !== "step") return void 0;
      let openingHumanAnchor;
      for (const key of keys) {
        const node = nodes.get(key);
        if ((node?.kind === "user" || node?.kind === "steering" || node?.kind === "turn-trigger") && (spec.controlAnchorSeq === location.turn.start?.seq || node.anchorSeq < spec.controlAnchorSeq)) openingHumanAnchor = Math.max(openingHumanAnchor ?? node.anchorSeq, node.anchorSeq);
      }
      let hasExternalProcess = false;
      let hasInterleavedInput = false;
      let compactAnswer = true;
      for (const key of keys) {
        const node = nodes.get(key);
        if (node === void 0 || !isVisibleChatNode(node) || node.kind === "turn-process") continue;
        if ((node.kind === "user" || node.kind === "steering" || node.kind === "turn-trigger") && (openingHumanAnchor === void 0 || node.anchorSeq > openingHumanAnchor)) {
          hasInterleavedInput = true;
          if (spec.answerAnchorSeq === null || node.anchorSeq < spec.answerAnchorSeq) compactAnswer = false;
        }
        if (TURN_PROCESS_INDEPENDENT_KINDS.has(node.kind) || node.anchorSeq < spec.processStartSeq || spec.answerAnchorSeq !== null && node.anchorSeq >= spec.answerAnchorSeq) continue;
        if (node.kind !== "assistant-step" || spec.answerStep === null || node.data.step !== spec.answerStep) hasExternalProcess = true;
      }
      return {
        turn,
        spec,
        turnStarted: location.turn.start !== void 0,
        turnClosed: location.turn.status === "closed",
        hasExternalProcess,
        hasInterleavedInput,
        compactAnswer
      };
    }
    var ChatTurnProcessProjector = class {
      presentations = /* @__PURE__ */ new Map();
      /**
      * Read the retained process presentation for a Node's Turn.
      * @param node - Current Chat Node.
      * @returns The Turn's process presentation, when present.
      */
      get(node) {
        const turn = nodeTurn(node);
        return turn === void 0 ? void 0 : this.presentations.get(turn);
      }
      /**
      * Replace every projected Turn.
      * @param order - visible Chat Node order.
      * @param locations - current Chat Location index.
      * @param nodes - current Chat Node store.
      * @returns Turns whose process presentation changed.
      */
      replace(order, locations, nodes) {
        const turns = /* @__PURE__ */ new Set();
        for (const key of order) {
          const turn = nodeTurn(nodes.get(key));
          if (turn !== void 0) turns.add(turn);
        }
        const changed = /* @__PURE__ */ new Set();
        for (const turn of /* @__PURE__ */ new Set([...this.presentations.keys(), ...turns])) if (this.set(turn, turns.has(turn) ? derivePresentation(turn, locations, nodes) : void 0)) changed.add(turn);
        return changed;
      }
      /**
      * Recompute selected Turns after incremental Node changes.
      * @param turns - affected Turn numbers.
      * @param locations - current Chat Location index.
      * @param nodes - current Chat Node store.
      * @returns Turns whose process presentation changed.
      */
      update(turns, locations, nodes) {
        const changed = /* @__PURE__ */ new Set();
        for (const turn of turns) if (this.set(turn, derivePresentation(turn, locations, nodes))) changed.add(turn);
        return changed;
      }
      set(turn, next) {
        if (samePresentation(this.presentations.get(turn), next)) return false;
        if (next === void 0) this.presentations.delete(turn);
        else this.presentations.set(turn, next);
        return true;
      }
    };
    const EMPTY_KEYS = [];
    const EMPTY_TURNS = [];
    const EMPTY_ITEMS = [];
    const EMPTY_LIST = [];
    function sameReferences$1(left, right) {
      return left.length === right.length && left.every((value, index) => value === right[index]);
    }
    function cachedSource(sources, key, create) {
      let source = sources.get(key);
      if (source === void 0) {
        source = create();
        sources.set(key, source);
      }
      return source;
    }
    var MutableChatSource = class {
      read;
      label;
      listeners = /* @__PURE__ */ new Set();
      published;
      constructor(read, label) {
        this.read = read;
        this.label = label;
        this.published = read();
      }
      getSnapshot = () => this.read();
      subscribe = (listener) => {
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      };
      publish() {
        const next = this.getSnapshot();
        if (this.published === next) return;
        this.published = next;
        (0, _deepseek_ai_dsh_client_store.notifySubscribers)(this.listeners, this.label);
      }
    };
    var TurnKindNodes = class {
      nodes = /* @__PURE__ */ new Map();
      current = EMPTY_LIST;
      dirty = false;
      observable;
      source() {
        return this.observable ??= new MutableChatSource(() => this.read(), "[ui-chat] turn kind nodes");
      }
      set(node) {
        const previous = this.nodes.get(node.key);
        this.nodes.set(node.key, node);
        if (previous !== void 0 && previous.data === node.data && previous.anchorSeq === node.anchorSeq) return;
        this.dirty = true;
      }
      delete(key) {
        this.nodes.delete(key);
        this.dirty = true;
      }
      publish() {
        this.observable?.publish();
      }
      read() {
        if (this.dirty) {
          this.current = [...this.nodes.values()].sort((a, b) => a.anchorSeq - b.anchorSeq).map((node) => node.data);
          this.dirty = false;
        }
        return this.current;
      }
    };
    var MutableChatNodeStore = class {
      byKey = /* @__PURE__ */ new Map();
      turnProcesses = new ChatTurnProcessProjector();
      sources = /* @__PURE__ */ new Map();
      processSources = /* @__PURE__ */ new Map();
      dirtyKeys = /* @__PURE__ */ new Set();
      dirtyProcessKeys = /* @__PURE__ */ new Set();
      turnKinds = /* @__PURE__ */ new Map();
      dirtyTurnKinds = /* @__PURE__ */ new Set();
      valuesCache = EMPTY_LIST;
      valuesDirty = false;
      get(key) {
        return this.byKey.get(key);
      }
      source(key) {
        return cachedSource(this.sources, key, () => new MutableChatSource(() => this.get(key), `[ui-chat] node source ${key}`));
      }
      turnDataSource(turn, kind) {
        return this.turnKind(turn, kind).source();
      }
      turnKind(turn, kind) {
        return cachedSource(cachedSource(this.turnKinds, turn, () => /* @__PURE__ */ new Map()), kind, () => new TurnKindNodes());
      }
      updateTurnKind(previous, next) {
        const before = previous === void 0 ? void 0 : locationCoordinates(previous.location).turn;
        const after = next === void 0 ? void 0 : locationCoordinates(next.location).turn;
        if (previous !== void 0 && before !== void 0 && (before !== after || previous.kind !== next?.kind)) {
          const collection = this.turnKind(before, previous.kind);
          collection.delete(previous.key);
          this.dirtyTurnKinds.add(collection);
        }
        if (next !== void 0 && after !== void 0) {
          const collection = this.turnKind(after, next.kind);
          collection.set(next);
          this.dirtyTurnKinds.add(collection);
        }
      }
      processSource(key) {
        return cachedSource(this.processSources, key, () => new MutableChatSource(() => this.process(key), `[ui-chat] node process source ${key}`));
      }
      process(key) {
        return this.turnProcesses.get(this.get(key));
      }
      values() {
        if (this.valuesDirty) {
          this.valuesCache = [...this.byKey.values()];
          this.valuesDirty = false;
        }
        return this.valuesCache;
      }
      replace(nodes) {
        const previous = new Map(this.byKey);
        this.byKey.clear();
        for (const node of nodes) {
          this.byKey.set(node.key, node);
          if (previous.get(node.key) !== node) {
            this.updateTurnKind(previous.get(node.key), node);
            this.dirtyKeys.add(node.key);
            this.dirtyProcessKeys.add(node.key);
          }
          previous.delete(node.key);
        }
        for (const key of previous.keys()) {
          this.updateTurnKind(previous.get(key), void 0);
          this.dirtyKeys.add(key);
          this.dirtyProcessKeys.add(key);
        }
        this.valuesCache = [...this.byKey.values()];
        this.valuesDirty = false;
      }
      upsert(nodes) {
        let changed = false;
        for (const node of nodes) {
          if (this.byKey.get(node.key) === node) continue;
          this.updateTurnKind(this.byKey.get(node.key), node);
          this.byKey.set(node.key, node);
          this.dirtyKeys.add(node.key);
          this.dirtyProcessKeys.add(node.key);
          changed = true;
        }
        if (changed) this.valuesDirty = true;
      }
      touchProcesses(turns, locations) {
        for (const turn of turns) for (const key of locations.getTurn(turn)) this.dirtyProcessKeys.add(key);
      }
      replaceProcesses(order, locations) {
        this.touchProcesses(this.turnProcesses.replace(order, locations, this), locations);
      }
      updateProcesses(turns, locations) {
        this.touchProcesses(this.turnProcesses.update(turns, locations, this), locations);
      }
      publish() {
        const dirty = [...this.dirtyKeys];
        const dirtyProcesses = [...this.dirtyProcessKeys];
        const dirtyTurnKinds = [...this.dirtyTurnKinds];
        this.dirtyKeys.clear();
        this.dirtyProcessKeys.clear();
        this.dirtyTurnKinds.clear();
        for (const key of dirty) this.sources.get(key)?.publish();
        for (const key of dirtyProcesses) this.processSources.get(key)?.publish();
        for (const collection of dirtyTurnKinds) collection.publish();
      }
    };
    var MutableChatLocationIndex = class {
      turns = /* @__PURE__ */ new Map();
      steps = /* @__PURE__ */ new Map();
      positions = /* @__PURE__ */ new Map();
      getTurn(turn) {
        return this.turns.get(turn) ?? EMPTY_KEYS;
      }
      getStep(turn, step) {
        return this.steps.get(stepKey(turn, step)) ?? EMPTY_KEYS;
      }
      getPosition(key) {
        return this.positions.get(key);
      }
      rebuild(order, store) {
        const turns = /* @__PURE__ */ new Map();
        const steps = /* @__PURE__ */ new Map();
        const positions = /* @__PURE__ */ new Map();
        const changedTurns = /* @__PURE__ */ new Set();
        for (const [index, key] of order.entries()) {
          const location = store.get(key)?.location;
          if (location === void 0) continue;
          const coordinates = locationCoordinates(location);
          const previous = this.positions.get(key);
          const position = {
            turn: coordinates.turn,
            previous: order[index - 1],
            next: order[index + 1]
          };
          const unchanged = previous !== void 0 && previous.turn === position.turn && previous.previous === position.previous && previous.next === position.next;
          positions.set(key, unchanged ? previous : position);
          if (!unchanged) {
            if (previous?.turn !== void 0) changedTurns.add(previous.turn);
            if (position.turn !== void 0) changedTurns.add(position.turn);
          }
          if (coordinates.turn === void 0) continue;
          const turnKeys = turns.get(coordinates.turn) ?? [];
          turnKeys.push(key);
          turns.set(coordinates.turn, turnKeys);
          if (coordinates.step === void 0) continue;
          const step = stepKey(coordinates.turn, coordinates.step);
          const stepKeys = steps.get(step) ?? [];
          stepKeys.push(key);
          steps.set(step, stepKeys);
        }
        for (const [key, position] of this.positions) if (!positions.has(key) && position.turn !== void 0) changedTurns.add(position.turn);
        this.positions = positions;
        this.turns = updateIndex(this.turns, turns);
        this.steps = updateIndex(this.steps, steps);
        return [...changedTurns];
      }
      /** Invalidate aggregate readers when member data changes without moving. */
      touch(nodes) {
        const turns = /* @__PURE__ */ new Set();
        const steps = /* @__PURE__ */ new Set();
        for (const node of nodes) {
          const coordinates = locationCoordinates(node.location);
          if (coordinates.turn === void 0 || !this.turns.get(coordinates.turn)?.includes(node.key)) continue;
          turns.add(coordinates.turn);
          if (coordinates.step !== void 0) steps.add(stepKey(coordinates.turn, coordinates.step));
        }
        for (const turn of turns) {
          const keys = this.turns.get(turn);
          if (keys === void 0) continue;
          this.turns.set(turn, [...keys]);
        }
        for (const step of steps) {
          const keys = this.steps.get(step);
          if (keys === void 0) continue;
          this.steps.set(step, [...keys]);
        }
      }
    };
    function updateIndex(previous, nextMutable) {
      const next = /* @__PURE__ */ new Map();
      const keys = /* @__PURE__ */ new Set([...previous.keys(), ...nextMutable.keys()]);
      for (const key of keys) {
        const before = previous.get(key) ?? EMPTY_KEYS;
        const candidate = nextMutable.get(key) ?? EMPTY_KEYS;
        const value = sameReferences$1(before, candidate) ? before : candidate;
        if (candidate.length > 0) next.set(key, value);
      }
      return next;
    }
    var MutableTurnNavigationIndex = class {
      current = EMPTY_ITEMS;
      byTurn = /* @__PURE__ */ new Map();
      items() {
        return this.current;
      }
      /** Re-derive the whole Turn set; runs only when the loaded structure moves. */
      rebuild(timeline, locations, nodes) {
        const next = [];
        const byTurn = /* @__PURE__ */ new Map();
        for (const turn of timeline.turnOrder) {
          const derived = turnNavigationItem(turn, locations, nodes);
          if (derived === void 0) continue;
          const previous = this.byTurn.get(turn);
          const item = previous !== void 0 && sameTurnNavigationItem(previous, derived) ? previous : derived;
          next.push(item);
          byTurn.set(turn, item);
        }
        this.byTurn = byTurn;
        if (!(next.length === this.current.length && next.every((item, index) => item === this.current[index]))) this.current = next;
      }
      /** Re-derive only the Turns a content-only upsert touched. */
      touch(turns, locations, nodes) {
        if (turns.size === 0) return;
        const next = this.current.map((item) => {
          if (!turns.has(item.turn)) return item;
          const derived = turnNavigationItem(item.turn, locations, nodes);
          if (derived === void 0 || sameTurnNavigationItem(item, derived)) return item;
          this.byTurn.set(item.turn, derived);
          return derived;
        });
        if (next.some((item, index) => item !== this.current[index])) this.current = next;
      }
    };
    function stepKey(turn, step) {
      return `${turn}:${step}`;
    }
    function locationCoordinates(location) {
      if (location.kind === "step") return {
        turn: location.turn.turn,
        step: location.step.step
      };
      if (location.kind === "turn") return { turn: location.turn.turn };
      return {};
    }
    function locationTurnStatus(location) {
      return location.kind === "turn" || location.kind === "step" ? location.turn.status : void 0;
    }
    function processPresentationInputChanged(previous, next, structural) {
      if (structural || previous === void 0) return true;
      if (locationTurnStatus(previous.location) !== locationTurnStatus(next.location)) return true;
      if (previous.kind === "turn-process" && next.kind === "turn-process") return previous.data !== next.data;
      return previous.kind === "assistant-step" && next.kind === "assistant-step" && previous.data.step !== next.data.step;
    }
    function turnProcessPresentations(nodes) {
      const presentations = /* @__PURE__ */ new Map();
      for (const raw of nodes) {
        const node = raw;
        if (node.kind === "turn-process") presentations.set(node.data.turn, {
          ...presentations.get(node.data.turn),
          control: node
        });
      }
      for (const raw of nodes) {
        const node = raw;
        const location = node.location;
        if (location.kind !== "turn" && location.kind !== "step") continue;
        const current = presentations.get(location.turn.turn) ?? {};
        const controlAnchor = current.control?.data.controlAnchorSeq;
        if ((node.kind === "user" || node.kind === "turn-trigger" || node.kind === "steering") && controlAnchor !== void 0 && (controlAnchor === location.turn.start?.seq || node.anchorSeq < controlAnchor)) {
          presentations.set(location.turn.turn, {
            ...current,
            openingInputAnchor: Math.max(current.openingInputAnchor ?? node.anchorSeq, node.anchorSeq)
          });
          continue;
        }
        if (TURN_PROCESS_INDEPENDENT_KINDS.has(node.kind)) continue;
        presentations.set(location.turn.turn, {
          ...current,
          earliestProcessAnchor: Math.min(current.earliestProcessAnchor ?? node.anchorSeq, node.anchorSeq)
        });
      }
      return presentations;
    }
    function presentationPosition(raw, presentations) {
      const node = raw;
      const location = node.location;
      if (location.kind !== "turn" && location.kind !== "step") return {
        anchor: node.anchorSeq,
        rank: 0,
        originalAnchor: node.anchorSeq
      };
      const presentation = presentations.get(location.turn.turn);
      if (presentation === void 0) return {
        anchor: node.anchorSeq,
        rank: 0,
        originalAnchor: node.anchorSeq
      };
      const openingInputAnchor = presentation.openingInputAnchor;
      if (openingInputAnchor !== void 0 && node.anchorSeq < openingInputAnchor && !TURN_PROCESS_INDEPENDENT_KINDS.has(node.kind)) return {
        anchor: openingInputAnchor,
        rank: 2,
        originalAnchor: node.anchorSeq
      };
      if (presentation.control !== void 0 && node.key === presentation.control.key) return openingInputAnchor === void 0 ? {
        anchor: presentation.earliestProcessAnchor ?? node.anchorSeq,
        rank: -1,
        originalAnchor: node.anchorSeq
      } : {
        anchor: openingInputAnchor,
        rank: 1,
        originalAnchor: node.anchorSeq
      };
      return {
        anchor: node.anchorSeq,
        rank: 0,
        originalAnchor: node.anchorSeq
      };
    }
    function orderedVisibleChatNodes(nodes) {
      const visible = nodes.filter((node) => isVisibleChatNode(node));
      const presentations = turnProcessPresentations(visible);
      return visible.sort((left, right) => {
        const leftPosition = presentationPosition(left, presentations);
        const rightPosition = presentationPosition(right, presentations);
        return leftPosition.anchor - rightPosition.anchor || leftPosition.rank - rightPosition.rank || leftPosition.originalAnchor - rightPosition.originalAnchor || left.key.localeCompare(right.key);
      });
    }
    function referenceMessageSeq(node) {
      const candidate = node;
      return candidate.kind === "user" || candidate.kind === "steering" ? candidate.data.seq : void 0;
    }
    function followingRecall(node) {
      const candidate = node;
      if (candidate.kind !== "context") return void 0;
      return {
        messageSeq: candidate.data.seq - 1,
        labels: sessionRecallLabels(candidate.data.source)
      };
    }
    function withReferenceLabels(node, labels) {
      const candidate = node;
      if (candidate.kind !== "user" && candidate.kind !== "steering") return node;
      const current = candidate.data.referenceLabels ?? EMPTY_KEYS;
      const hasLabels = Object.hasOwn(candidate.data, "referenceLabels");
      if (sameReferences$1(current, labels) && hasLabels === labels.length > 0) return node;
      const data = { ...candidate.data };
      if (labels.length === 0) delete data.referenceLabels;
      else data.referenceLabels = labels;
      return {
        ...candidate,
        data
      };
    }
    var ReferenceLabelProjector = class {
      messagesBySeq = /* @__PURE__ */ new Map();
      labelsByMessageSeq = /* @__PURE__ */ new Map();
      replace(nodes) {
        this.messagesBySeq.clear();
        this.labelsByMessageSeq.clear();
        for (const node of nodes) {
          const messageSeq = referenceMessageSeq(node);
          if (messageSeq !== void 0) this.messagesBySeq.set(messageSeq, node.key);
          const recall = followingRecall(node);
          if (recall !== void 0 && recall.labels.length > 0) this.labelsByMessageSeq.set(recall.messageSeq, recall.labels);
        }
        return nodes.map((node) => {
          const messageSeq = referenceMessageSeq(node);
          return messageSeq === void 0 ? node : withReferenceLabels(node, this.labelsByMessageSeq.get(messageSeq) ?? EMPTY_KEYS);
        });
      }
      apply(upserts, store) {
        const byKey = new Map(upserts.map((node) => [node.key, node]));
        const affected = /* @__PURE__ */ new Set();
        for (const node of upserts) {
          const messageSeq = referenceMessageSeq(node);
          if (messageSeq !== void 0) {
            this.messagesBySeq.set(messageSeq, node.key);
            affected.add(messageSeq);
          }
          const recall = followingRecall(node);
          if (recall === void 0) continue;
          const current = this.labelsByMessageSeq.get(recall.messageSeq);
          if (recall.labels.length === 0) this.labelsByMessageSeq.delete(recall.messageSeq);
          else this.labelsByMessageSeq.set(recall.messageSeq, current !== void 0 && sameReferences$1(current, recall.labels) ? current : recall.labels);
          affected.add(recall.messageSeq);
        }
        for (const messageSeq of affected) {
          const key = this.messagesBySeq.get(messageSeq);
          if (key === void 0) continue;
          const node = byKey.get(key) ?? store.get(key);
          if (node === void 0) continue;
          byKey.set(key, withReferenceLabels(node, this.labelsByMessageSeq.get(messageSeq) ?? EMPTY_KEYS));
        }
        return [...byKey.values()];
      }
    };
    function withSkillNames(node, names2) {
      const candidate = node;
      if (candidate.kind !== "user" && candidate.kind !== "steering") return node;
      const current = candidate.data.skillNames ?? EMPTY_KEYS;
      const hasNames = Object.hasOwn(candidate.data, "skillNames");
      if (sameReferences$1(current, names2) && hasNames === names2.length > 0) return node;
      const data = { ...candidate.data };
      if (names2.length === 0) delete data.skillNames;
      else data.skillNames = names2;
      return {
        ...candidate,
        data
      };
    }
    function slashEntryOf(node) {
      const candidate = node;
      if (candidate.kind === "user" || candidate.kind === "steering") return {
        key: node.key,
        seq: node.anchorSeq,
        kind: "message",
        name: null
      };
      if (candidate.kind === "context") {
        const name = skillInvocationName(candidate.data.source);
        return name === null ? null : {
          key: node.key,
          seq: node.anchorSeq,
          kind: "skill",
          name
        };
      }
      return {
        key: node.key,
        seq: node.anchorSeq,
        kind: "boundary",
        name: null
      };
    }
    function sameSlashEntry(left, right) {
      return left.seq === right.seq && left.kind === right.kind && left.name === right.name;
    }
    var SkillNameProjector = class {
      entries = /* @__PURE__ */ new Map();
      /** Every indexed entry in `anchorSeq` order. */
      sorted = [];
      /**
      * Rebuild the index from a whole Node set and attach names to its messages.
      * @param nodes - every materialized Chat Node, in any order.
      * @returns the same Nodes, direct messages carrying their batch's names.
      */
      replace(nodes) {
        this.entries.clear();
        this.sorted = [];
        for (const node of nodes) {
          const entry = slashEntryOf(node);
          if (entry === null) continue;
          this.entries.set(entry.key, entry);
          this.sorted.push(entry);
        }
        this.sorted.sort((left, right) => left.seq - right.seq);
        const names2 = /* @__PURE__ */ new Map();
        for (let index = 0; index < this.sorted.length; index++) {
          if (this.sorted[index]?.kind === "boundary") continue;
          const end = this.runEnd(index);
          this.assignRun(index, end, names2);
          index = end;
        }
        return nodes.map((node) => withSkillNames(node, names2.get(node.key) ?? EMPTY_KEYS));
      }
      /**
      * Fold one incremental upsert set: re-read only the batches around the
      * Nodes whose classification changed.
      * @param upserts - the changed Nodes.
      * @param store - the resident Nodes, read by key for the messages of an affected batch.
      * @returns the upserts plus any resident message whose names changed.
      */
      apply(upserts, store) {
        const dirty = [];
        for (const node of upserts) {
          const next = slashEntryOf(node);
          const previous = this.entries.get(node.key);
          if (previous !== void 0) {
            if (next !== null && sameSlashEntry(previous, next)) {
              if (next.kind === "message") dirty.push(next.seq);
              continue;
            }
            this.remove(previous);
            dirty.push(previous.seq);
          }
          if (next === null) continue;
          this.insert(next);
          dirty.push(next.seq);
        }
        if (dirty.length === 0) return upserts;
        const names2 = /* @__PURE__ */ new Map();
        for (const seq of dirty) this.collectAround(seq, names2);
        const byKey = new Map(upserts.map((node) => [node.key, node]));
        for (const [key, list] of names2) {
          const node = byKey.get(key) ?? store.get(key);
          if (node === void 0) continue;
          const next = withSkillNames(node, list);
          if (next !== node || byKey.has(key)) byKey.set(key, next);
        }
        return [...byKey.values()];
      }
      insert(entry) {
        this.sorted.splice(this.lowerBound(entry.seq), 0, entry);
        this.entries.set(entry.key, entry);
      }
      remove(entry) {
        this.sorted.splice(this.sorted.indexOf(entry), 1);
        this.entries.delete(entry.key);
      }
      /** First index whose seq is at least `seq`. */
      lowerBound(seq) {
        let low = 0;
        let high = this.sorted.length;
        while (low < high) {
          const middle = low + high >>> 1;
          if ((this.sorted[middle]?.seq ?? Number.POSITIVE_INFINITY) < seq) low = middle + 1;
          else high = middle;
        }
        return low;
      }
      /** Last index of the boundary-free run containing `index`. */
      runEnd(index) {
        let end = index;
        while (end + 1 < this.sorted.length && this.sorted[end + 1]?.kind !== "boundary") end++;
        return end;
      }
      /** First index of the boundary-free run containing `index`. */
      runStart(index) {
        let start = index;
        while (start - 1 >= 0 && this.sorted[start - 1]?.kind !== "boundary") start--;
        return start;
      }
      /** Record the names every message of the run `[start, end]` carries. */
      assignRun(start, end, names2) {
        const list = [];
        for (let index = start; index <= end; index++) {
          const entry = this.sorted[index];
          if (entry?.kind === "skill" && entry.name !== null && !list.includes(entry.name)) list.push(entry.name);
        }
        for (let index = start; index <= end; index++) {
          const entry = this.sorted[index];
          if (entry?.kind === "message") names2.set(entry.key, list);
        }
      }
      /**
      * Re-read the run(s) around one changed seq: the run holding a message or
      * skill entry, or — for a boundary, or a seq that left the index — the runs
      * on both sides of that position.
      */
      collectAround(seq, names2) {
        const at = this.lowerBound(seq);
        const here = this.sorted[at];
        if (here !== void 0 && here.seq === seq && here.kind !== "boundary") {
          this.assignRun(this.runStart(at), this.runEnd(at), names2);
          return;
        }
        if (at - 1 >= 0 && this.sorted[at - 1]?.kind !== "boundary") this.assignRun(this.runStart(at - 1), at - 1, names2);
        const right = here !== void 0 && here.seq === seq ? at + 1 : at;
        if (right < this.sorted.length && this.sorted[right]?.kind !== "boundary") this.assignRun(right, this.runEnd(right), names2);
      }
    };
    const EMPTY_CONTRIBUTION = {
      anchorSeq: 0,
      nodes: EMPTY_LIST,
      partial: null,
      running: null
    };
    function legacyContribution(raw) {
      const node = raw;
      if (raw.visibility !== "visible" && node.kind !== "assistant-step") return EMPTY_CONTRIBUTION;
      switch (node.kind) {
        case "user":
        case "steering":
        case "context":
        case "command":
        case "compaction":
        case "turn-error":
        case "turn-max-tokens":
        case "unknown":
          return {
            anchorSeq: node.anchorSeq,
            nodes: [node.data],
            partial: null,
            running: null
          };
        case "assistant-step": {
          const data = node.data;
          if (data.status === "running") {
            if (raw.visibility !== "visible") return EMPTY_CONTRIBUTION;
            return {
              anchorSeq: node.anchorSeq,
              nodes: EMPTY_LIST,
              partial: {
                turn: data.turn,
                step: data.step,
                blocks: data.blocks
              },
              running: null
            };
          }
          return {
            anchorSeq: node.anchorSeq,
            nodes: data.finalNode === void 0 ? EMPTY_LIST : [data.finalNode],
            partial: null,
            running: null
          };
        }
        case "tool-call": {
          const root = node.data.root;
          return isRunningTool(root) ? {
            anchorSeq: node.anchorSeq,
            nodes: EMPTY_LIST,
            partial: null,
            running: root
          } : {
            anchorSeq: node.anchorSeq,
            nodes: [root],
            partial: null,
            running: null
          };
        }
        case "manual-compaction": {
          const data = node.data;
          return {
            anchorSeq: node.anchorSeq,
            nodes: data.compaction === null ? [data.command] : [data.command, data.compaction],
            partial: null,
            running: null
          };
        }
        case "model-retry":
          return {
            anchorSeq: node.anchorSeq,
            nodes: node.data.attempts,
            partial: null,
            running: null
          };
        case "turn-tail":
        case "system-prompt":
          return EMPTY_CONTRIBUTION;
        default:
          return EMPTY_CONTRIBUTION;
      }
    }
    function sameContribution(left, right) {
      return left !== void 0 && left.anchorSeq === right.anchorSeq && left.partial?.blocks === right.partial?.blocks && left.partial?.turn === right.partial?.turn && left.partial?.step === right.partial?.step && left.running === right.running && sameReferences$1(left.nodes, right.nodes);
    }
    var LegacySliceBuilder = class {
      contributions = /* @__PURE__ */ new Map();
      finalizedContributions = /* @__PURE__ */ new Map();
      runningContributions = /* @__PURE__ */ new Map();
      partialContributions = /* @__PURE__ */ new Map();
      finalized = EMPTY_LIST;
      runningCalls = EMPTY_LIST;
      partial = null;
      timeline;
      turnTimings = /* @__PURE__ */ new Map();
      turnEnds = /* @__PURE__ */ new Map();
      replace(nodes, timeline) {
        this.contributions.clear();
        this.finalizedContributions.clear();
        this.runningContributions.clear();
        this.partialContributions.clear();
        for (const node of nodes) {
          const contribution = legacyContribution(node);
          this.contributions.set(node.key, contribution);
          this.indexContribution(node.key, contribution);
        }
        this.rebuildFinalized();
        this.rebuildRunning();
        this.rebuildPartial();
        this.updateTimeline(timeline);
        return this.snapshot();
      }
      apply(upserts, timeline) {
        let finalizedChanged = false;
        let runningChanged = false;
        let partialChanged = false;
        for (const node of upserts) {
          const contribution = legacyContribution(node);
          const previous = this.contributions.get(node.key);
          if (sameContribution(previous, contribution)) continue;
          finalizedChanged ||= finalizedContributionChanged(previous, contribution);
          runningChanged ||= runningContributionChanged(previous, contribution);
          partialChanged ||= partialContributionChanged(previous, contribution);
          this.contributions.set(node.key, contribution);
          this.indexContribution(node.key, contribution);
        }
        if (finalizedChanged) this.rebuildFinalized();
        if (runningChanged) this.rebuildRunning();
        if (partialChanged) this.rebuildPartial();
        this.updateTimeline(timeline);
        return this.snapshot();
      }
      indexContribution(key, contribution) {
        updateContributionIndex(this.finalizedContributions, key, contribution, contribution.nodes.length > 0);
        updateContributionIndex(this.runningContributions, key, contribution, contribution.running !== null);
        updateContributionIndex(this.partialContributions, key, contribution, contribution.partial !== null);
      }
      rebuildFinalized() {
        const finalized = [...this.finalizedContributions.values()].flatMap((value) => value.nodes).sort((left, right) => left.seq - right.seq);
        if (!sameReferences$1(this.finalized, finalized)) this.finalized = finalized;
      }
      rebuildRunning() {
        const runningCalls = [...this.runningContributions.values()].sort((left, right) => left.anchorSeq - right.anchorSeq).flatMap((value) => value.running === null ? [] : [value.running]);
        if (!sameReferences$1(this.runningCalls, runningCalls)) this.runningCalls = runningCalls;
      }
      rebuildPartial() {
        const partial = [...this.partialContributions.values()].sort((left, right) => left.anchorSeq - right.anchorSeq).findLast((value) => value.partial !== null)?.partial ?? null;
        if (this.partial?.blocks !== partial?.blocks || this.partial?.turn !== partial?.turn || this.partial?.step !== partial?.step) this.partial = partial;
      }
      updateTimeline(timeline) {
        if (this.timeline === timeline) return;
        this.timeline = timeline;
        const turnTimings = /* @__PURE__ */ new Map();
        const turnEnds = /* @__PURE__ */ new Map();
        for (const turn of timeline.turns.values()) {
          if (turn.start !== void 0) turnTimings.set(turn.turn, {
            startTime: turn.start.time,
            ...turn.end === void 0 ? {} : { endTime: turn.end.time }
          });
          if (turn.end !== void 0) turnEnds.set(turn.turn, turn.end.seq);
        }
        this.turnTimings = turnTimings;
        this.turnEnds = turnEnds;
      }
      snapshot() {
        return {
          nodes: this.finalized,
          turnTimings: this.turnTimings,
          turnEnds: this.turnEnds,
          partial: this.partial,
          runningCalls: this.runningCalls
        };
      }
    };
    function updateContributionIndex(index, key, contribution, present) {
      if (present) index.set(key, contribution);
      else index.delete(key);
    }
    function finalizedContributionChanged(previous, next) {
      const previousNodes = previous?.nodes ?? EMPTY_LIST;
      return !sameReferences$1(previousNodes, next.nodes) || (previousNodes.length > 0 || next.nodes.length > 0) && previous?.anchorSeq !== next.anchorSeq;
    }
    function runningContributionChanged(previous, next) {
      return previous?.running !== next.running || (previous.running !== null || next.running !== null) && previous.anchorSeq !== next.anchorSeq;
    }
    function partialContributionChanged(previous, next) {
      return previous?.partial?.blocks !== next.partial?.blocks || previous?.partial?.turn !== next.partial?.turn || previous?.partial?.step !== next.partial?.step || ((previous?.partial ?? null) !== null || next.partial !== null) && previous?.anchorSeq !== next.anchorSeq;
    }
    var ChatSnapshotBuilder = class {
      store = new MutableChatNodeStore();
      locations = new MutableChatLocationIndex();
      navigation = new MutableTurnNavigationIndex();
      legacy = new LegacySliceBuilder();
      referenceLabels = new ReferenceLabelProjector();
      skillNames = new SkillNameProjector();
      order = EMPTY_KEYS;
      latestGroupInput;
      readGroupNode = (key) => this.store.get(key);
      readGroupTurn = (turn) => this.locations.getTurn(turn);
      readGroupPosition = (key) => this.locations.getPosition(key);
      /** Last published timeline: a Turn boundary can land without a new node. */
      timeline = null;
      empty;
      constructor() {
        this.empty = this.snapshot({
          turnOrder: EMPTY_TURNS,
          turns: /* @__PURE__ */ new Map()
        });
        this.latestGroupInput = {
          kind: "replace",
          order: this.order,
          readNode: this.readGroupNode,
          readTurn: this.readGroupTurn,
          readPosition: this.readGroupPosition,
          timeline: this.empty.timeline
        };
      }
      replace(input) {
        const nodes = this.skillNames.replace(this.referenceLabels.replace(input.nodes));
        this.store.replace(nodes);
        this.order = orderedVisibleChatNodes(nodes).map((node) => node.key);
        this.locations.rebuild(this.order, this.store);
        this.store.replaceProcesses(this.order, this.locations);
        this.navigation.rebuild(input.timeline, this.locations, this.store);
        this.timeline = input.timeline;
        this.latestGroupInput = {
          kind: "replace",
          order: this.order,
          readNode: this.readGroupNode,
          readTurn: this.readGroupTurn,
          readPosition: this.readGroupPosition,
          timeline: input.timeline
        };
        return this.snapshot(input.timeline, this.legacy.replace(nodes, input.timeline));
      }
      apply(input) {
        const upserts = this.skillNames.apply(this.referenceLabels.apply(input.upserts, this.store), this.store);
        const processTurns = /* @__PURE__ */ new Set();
        let structural = false;
        const contentOnly = [];
        const changes = [];
        for (const node of upserts) {
          const previous = this.store.get(node.key);
          if (previous !== node) changes.push({
            previous,
            current: node
          });
          const nodeStructural = previous === void 0 || previous.kind !== node.kind || previous.anchorSeq !== node.anchorSeq || previous.visibility !== node.visibility || locationIdentity(previous.location) !== locationIdentity(node.location);
          structural ||= nodeStructural;
          if (!nodeStructural) contentOnly.push(node);
          if (processPresentationInputChanged(previous, node, nodeStructural)) {
            const previousTurn = previous === void 0 ? void 0 : locationCoordinates(previous.location).turn;
            const nextTurn = locationCoordinates(node.location).turn;
            if (previousTurn !== void 0) processTurns.add(previousTurn);
            if (nextTurn !== void 0) processTurns.add(nextTurn);
          }
        }
        this.store.upsert(upserts);
        let changedTurnOrders = EMPTY_TURNS;
        if (structural) {
          const next = orderedVisibleChatNodes(this.store.values()).map((node) => node.key);
          this.order = sameReferences$1(this.order, next) ? this.order : next;
          changedTurnOrders = this.locations.rebuild(this.order, this.store);
        }
        this.locations.touch(contentOnly);
        this.store.updateProcesses(processTurns, this.locations);
        if (structural || input.timeline !== this.timeline) this.navigation.rebuild(input.timeline, this.locations, this.store);
        else this.navigation.touch(turnsOf(contentOnly), this.locations, this.store);
        this.timeline = input.timeline;
        this.latestGroupInput = {
          kind: "apply",
          changes,
          order: this.order,
          readNode: this.readGroupNode,
          readTurn: this.readGroupTurn,
          readPosition: this.readGroupPosition,
          timeline: input.timeline,
          changedTurns: input.changedTurns ?? EMPTY_TURNS,
          changedTurnOrders
        };
        return this.snapshot(input.timeline, this.legacy.apply(upserts, input.timeline));
      }
      groupInput() {
        return this.latestGroupInput;
      }
      publish() {
        this.store.publish();
      }
      snapshot(timeline, legacy = this.legacy.replace(EMPTY_LIST, timeline)) {
        return {
          order: this.order,
          nodes: this.store,
          locations: this.locations,
          navigation: this.navigation,
          timeline,
          legacy
        };
      }
    };
    function turnsOf(nodes) {
      const turns = /* @__PURE__ */ new Set();
      for (const node of nodes) {
        const turn = locationCoordinates(node.location).turn;
        if (turn !== void 0) turns.add(turn);
      }
      return turns;
    }
    function locationIdentity(location) {
      const coordinates = locationCoordinates(location);
      return `${location.kind}:${coordinates.turn ?? ""}:${coordinates.step ?? ""}`;
    }
    const chatViewDefinition = {
      target: "chat",
      create: () => new ChatSnapshotBuilder(),
      isActive: (snapshot2) => snapshot2.order.some((key) => snapshot2.nodes.get(key)?.kind !== "command")
    };
    function registerChatConversationView(ctx) {
      ctx.uiConversation.views.register(chatViewDefinition);
    }
    const SURFACE_EVENT_TYPES = /* @__PURE__ */ new Set([
      "system/message",
      "developer/message",
      "user/message",
      "assistant/message",
      "tool/result"
    ]);
    function isSurfaceEvent(event) {
      if (!SURFACE_EVENT_TYPES.has(event.type)) return false;
      return event.surfaceOp !== void 0;
    }
    function isAppendSurfaceEvent(event) {
      return isSurfaceEvent(event) && event.surfaceOp === "append";
    }
    function isReplacementSurfaceEvent(event) {
      return isSurfaceEvent(event) && event.surfaceOp !== "append";
    }
    const COMPACT_KIND = "compact-checkpoint";
    function commandFromRun(match) {
      if (match.event.type !== "command/run") throw new Error("command start requires command/run");
      const data = match.event.data;
      return {
        kind: "command",
        seq: match.event.seq,
        time: match.event.time,
        commandId: data.commandId,
        name: data.name,
        args: data.args ?? null,
        outcome: null
      };
    }
    function commandFromDone(match, previous) {
      if (match.event.type !== "command/done") throw new Error("command update requires command/done");
      const data = match.event.data;
      const sourceEventSeq = data.kind === "success" && data.sourceEventSeq !== void 0 && Number.isSafeInteger(data.sourceEventSeq) && data.sourceEventSeq >= 0 ? data.sourceEventSeq : void 0;
      return {
        kind: "command",
        seq: previous?.seq ?? match.event.seq,
        time: previous?.time ?? match.event.time,
        commandId: data.commandId,
        name: previous?.name ?? null,
        args: previous?.args ?? null,
        outcome: {
          kind: data.kind,
          ...data.text === void 0 ? {} : { text: data.text },
          ...sourceEventSeq === void 0 ? {} : { sourceEventSeq }
        }
      };
    }
    function compactSource(event) {
      if (event.type !== "user/message" || !isReplacementSurfaceEvent(event)) return void 0;
      const source = event.data.source;
      if (source.kind !== COMPACT_KIND || typeof source.compactionId !== "string") return void 0;
      return {
        compactionId: source.compactionId,
        ...source.sourceCommandId === void 0 ? {} : { sourceCommandId: source.sourceCommandId }
      };
    }
    function compactSummary(match, checkpoint) {
      let summary = null;
      let shadowedItemCount = null;
      let shadowedTokenCount = null;
      if (match?.event.type === "compaction/summary") {
        const data = match.event.data;
        if (Array.isArray(data.summary)) {
          const text = data.summary.map((block) => block.type === "text" ? block.text : "").join("");
          summary = text.trim() === "" ? null : text;
        }
        shadowedItemCount = Array.isArray(data.shadowedSeqs) && data.shadowedSeqs.every((seq) => Number.isSafeInteger(seq) && seq >= 0) ? data.shadowedSeqs.length : null;
        shadowedTokenCount = Number.isSafeInteger(data.shadowedTokenCount) && data.shadowedTokenCount >= 0 ? data.shadowedTokenCount : null;
      }
      return {
        kind: "compaction",
        seq: checkpoint.event.seq,
        time: checkpoint.event.time,
        summary,
        summaryEventSeq: match?.event.seq ?? null,
        shadowedItemCount,
        shadowedTokenCount
      };
    }
    function fallbackState$4(context) {
      const done = context.matches.find((match) => match.event.type === "command/done");
      const checkpoint = context.matches.find((match) => compactSource(match.event) !== void 0);
      const summary = context.matches.find((match) => match.event.type === "compaction/summary");
      if (checkpoint === void 0) return done === void 0 ? void 0 : { command: commandFromDone(done) };
      const source = compactSource(checkpoint.event);
      if (source?.sourceCommandId === void 0) return done === void 0 ? void 0 : { command: commandFromDone(done) };
      return {
        command: done === void 0 ? {
          kind: "command",
          seq: checkpoint.event.seq,
          time: checkpoint.event.time,
          commandId: source.sourceCommandId,
          name: "compact",
          args: null,
          outcome: null
        } : {
          ...commandFromDone(done),
          name: "compact"
        },
        checkpoint,
        ...summary === void 0 ? {} : { summary }
      };
    }
    function updateCompactionState(state, match) {
      if (match.event.type === "compaction/summary") return {
        ...state,
        summary: match
      };
      if (compactSource(match.event) !== void 0) return {
        ...state,
        checkpoint: match
      };
      return state;
    }
    const commandDefinition = {
      kind: "command",
      target: "chat",
      match: (event) => {
        if (event.type === "command/run") return {
          id: String(event.data.commandId),
          role: "start"
        };
        if (event.type === "command/done") return {
          id: String(event.data.commandId),
          role: "update"
        };
        const checkpoint = compactSource(event);
        if (checkpoint?.sourceCommandId !== void 0) return {
          id: String(checkpoint.sourceCommandId),
          role: "update"
        };
        if (event.type === "compaction/start" || event.type === "compaction/summary" || event.type === "compaction/end") {
          if (event.data.sourceCommandId !== void 0) return {
            id: String(event.data.sourceCommandId),
            role: "update"
          };
        }
        return null;
      },
      start: (_context, match) => ({ command: commandFromRun(match) }),
      update: (context, match) => {
        if (match.event.type === "command/done") return {
          ...context.state,
          command: commandFromDone(match, context.state.command)
        };
        return updateCompactionState(context.state, match);
      },
      buildViewNode: (context) => {
        const state = context.state ?? fallbackState$4(context);
        if (state === void 0) return null;
        if (state.command.name !== "compact") return chatNode(context, "command", state.command.seq, state.command);
        const compaction = state.checkpoint === void 0 ? null : compactSummary(state.summary, state.checkpoint);
        const data = {
          command: state.command,
          compaction
        };
        return chatNode(context, "manual-compaction", compaction?.seq ?? state.command.seq, data);
      }
    };
    function registerCommandConversationNode(ctx) {
      ctx.uiConversation.events.register(commandDefinition);
    }
    function fallbackState$3(context) {
      const summary = context.matches.find((match) => match.event.type === "compaction/summary");
      const checkpoint = context.matches.find((match) => compactSource(match.event) !== void 0);
      return {
        ...summary === void 0 ? {} : { summary },
        ...checkpoint === void 0 ? {} : { checkpoint }
      };
    }
    const compactionDefinition = {
      kind: "compaction",
      target: "chat",
      match: (event) => {
        const checkpoint = compactSource(event);
        if (checkpoint !== void 0 && checkpoint.sourceCommandId === void 0) return {
          id: checkpoint.compactionId,
          role: "update"
        };
        if (event.type === "compaction/start" || event.type === "compaction/summary" || event.type === "compaction/end") {
          if (event.data.sourceCommandId !== void 0) return null;
          const compactionId = event.data.compactionId;
          if (typeof compactionId !== "string" || compactionId === "") return null;
          return {
            id: compactionId,
            role: event.type === "compaction/start" ? "start" : "update"
          };
        }
        return null;
      },
      start: () => ({}),
      update: (context, match) => updateCompactionState(context.state, match),
      buildViewNode: (context) => {
        const state = context.state ?? fallbackState$3(context);
        if (state.checkpoint === void 0) return null;
        const marker = compactSummary(state.summary, state.checkpoint);
        return chatNode(context, "compaction", marker.seq, marker);
      }
    };
    function registerCompactionConversationNode(ctx) {
      ctx.uiConversation.events.register(compactionDefinition);
    }
    const unknownFallbackDefinition = {
      kind: "unknown-surface",
      target: "chat",
      match: (event) => event.type !== "assistant/live-chunk" && isAppendSurfaceEvent(event) ? {
        id: String(event.seq),
        role: "start"
      } : null,
      start: (_context, match) => ({
        kind: "unknown",
        seq: match.event.seq,
        time: match.event.time,
        type: match.event.type,
        data: match.event.data
      }),
      update: (context) => context.state,
      buildViewNode: (context) => context.state === void 0 ? null : chatNode(context, "unknown", context.state.seq, context.state)
    };
    function registerUnknownConversationFallback(ctx) {
      ctx.uiConversation.events.registerFallback(unknownFallbackDefinition);
    }
    const EMPTY_PENDING = {
      kind: "snapshot",
      ids: []
    };
    const EMPTY_CURRENT_CLAIMED = /* @__PURE__ */ new Set();
    function materializePending(state) {
      const splices = [];
      let current = state;
      while (current.kind === "splice") {
        splices.push(current);
        current = current.previous;
      }
      const pending = [...current.ids];
      for (const splice of splices.reverse()) pending.splice(splice.start, splice.removedCount, ...splice.inserted);
      return pending;
    }
    function withoutInserted(claimed, inserted) {
      let next;
      for (const { id } of inserted) {
        if (!claimed.has(id)) continue;
        next ??= new Set(claimed);
        next.delete(id);
      }
      return next ?? claimed;
    }
    function applySplice(previous, splice, seq) {
      const priorPending = previous?.state.pending ?? EMPTY_PENDING;
      const inserted = splice.inserted;
      const removedCount = splice.removedCount ?? 0;
      if (removedCount > 0 && splice.outcome !== "canceled") {
        const pending = materializePending(priorPending);
        const removed = pending.splice(splice.start, removedCount, ...inserted);
        return {
          pending: {
            kind: "snapshot",
            ids: pending
          },
          currentClaimed: new Set(removed.map((message) => message.id)),
          claimSeq: seq,
          claimedHuman: removed.some((message) => message.source.kind === "user")
        };
      }
      const currentClaimed = withoutInserted(previous?.state.currentClaimed ?? EMPTY_CURRENT_CLAIMED, inserted);
      return {
        pending: {
          kind: "splice",
          previous: priorPending,
          start: splice.start,
          removedCount,
          inserted
        },
        currentClaimed,
        claimSeq: previous?.state.claimSeq ?? -1,
        claimedHuman: previous?.state.claimedHuman ?? false
      };
    }
    function inboxDefinition(target) {
      const kind = `inbox-${target}`;
      return {
        kind,
        match: (event) => event.type === "agent/inbox/spliced" && event.data.target === target ? {
          id: String(event.seq),
          role: "start"
        } : null,
        start: (_context, match, reader) => {
          if (match.event.type !== "agent/inbox/spliced") throw new Error("inbox start requires agent/inbox/spliced");
          return applySplice(reader.previous(kind), match.event.data, match.event.seq);
        },
        update: (context) => context.state,
        publication: () => "none"
      };
    }
    const nextStepInboxDefinition = inboxDefinition("next-step");
    const nextTurnInboxDefinition = inboxDefinition("next-turn");
    function registerInboxConversationNodes(ctx) {
      ctx.uiConversation.events.register(nextStepInboxDefinition);
      ctx.uiConversation.events.register(nextTurnInboxDefinition);
    }
    function isCompactionCheckpoint(event) {
      if (event.type !== "user/message" || !isReplacementSurfaceEvent(event)) return false;
      return event.data.source.kind === "compact-checkpoint";
    }
    const messageDefinition = {
      kind: "input-message",
      target: "chat",
      match: (event) => {
        if (event.type === "user/message") return isAppendSurfaceEvent(event) && !isCompactionCheckpoint(event) ? {
          id: String(event.data.id),
          role: "start"
        } : null;
        if (event.type === "developer/message") throw new Error("Chat developer messages are not supported yet");
        return null;
      },
      start: (_context, match, reader) => {
        if (match.event.type !== "user/message") throw new Error("input-message start requires user/message");
        const event = match.event;
        if (event.data.source.kind !== "user") {
          const nextTurn = reader.previous("inbox-next-turn")?.state;
          const nextStep = reader.previous("inbox-next-step")?.state;
          const location = match.location;
          const turnStart = location.kind === "step" ? location.turn.start?.seq : void 0;
          const idleSteer = location.kind === "step" && location.step.step === 1 && turnStart !== void 0 && (nextStep?.claimSeq ?? -1) > turnStart && (nextTurn?.claimSeq ?? -1) < turnStart && nextStep?.claimedHuman === false && nextStep.currentClaimed.has(String(event.data.id));
          return {
            kind: "context",
            waking: nextTurn?.currentClaimed.has(String(event.data.id)) === true || idleSteer,
            seq: event.seq,
            time: event.time,
            content: event.data.content,
            source: event.data.source,
            producer: contextProducer(event.data.source),
            form: contextForm(event.data.source)
          };
        }
        return reader.previous("inbox-next-step")?.state.currentClaimed.has(String(event.data.id)) === true ? {
          kind: "steering",
          messageId: event.data.id,
          seq: event.seq,
          time: event.time,
          content: event.data.content,
          source: event.data.source
        } : {
          kind: "user",
          seq: event.seq,
          time: event.time,
          content: event.data.content,
          source: event.data.source
        };
      },
      update: (context) => context.state,
      buildViewNode: (context) => {
        if (context.state === void 0) return null;
        return chatNode(context, context.state.kind === "context" && context.start?.event.type === "user/message" && context.state.waking === true ? "turn-trigger" : context.state.kind, context.state.seq, context.state);
      }
    };
    function registerMessageConversationNode(ctx) {
      ctx.uiConversation.events.register(messageDefinition);
    }
    function requestPromptAnchor(match, previous, isInitial) {
      if (match.location.kind !== "step") return match.event.seq;
      if (previous === void 0 && !isInitial) return match.event.seq;
      if (previous?.turn === match.location.turn.turn && previous.step === match.location.step.step) return match.event.seq;
      return match.location.step.step === 1 ? match.location.turn.start?.seq ?? match.location.step.start?.seq ?? match.event.seq : match.location.step.start?.seq ?? match.event.seq;
    }
    function stableRequestPromptAnchor(context, match, previous, isInitial) {
      const current = context.current.get("chat");
      return current?.kind === "system-prompt" ? current.anchorSeq : requestPromptAnchor(match, previous, isInitial);
    }
    function systemMessageDefinition(inspect) {
      return {
        kind: "system-message",
        target: "chat",
        match: (event) => event.type === "system/message" || "surfaceOp" in event && event.surfaceOp !== "append" ? {
          id: String(event.seq),
          role: "start"
        } : null,
        start: (_context, match, reader) => {
          return inspect(reader.previous("system-message")?.state, match.event);
        },
        update: (context) => context.state,
        buildViewNode: (context) => {
          const state = context.state?.introduced;
          if (state === void 0 || state.text === "" || context.start?.event.type !== "system/message" || context.start.event.surfaceOp !== "append") return null;
          return chatNode(context, "system-prompt", state.update ? state.seq : requestPromptAnchor(context.start, void 0, true), {
            text: state.text,
            ...state.update ? { update: true } : {}
          });
        }
      };
    }
    function requestPromptDefinition(inspect) {
      return {
        kind: "request-prompt",
        target: "chat",
        match: (event) => event.type === "request/header" ? {
          id: String(event.seq),
          role: "start"
        } : null,
        start: (context, match, reader) => {
          if (match.event.type !== "request/header") throw new Error("request-prompt start requires request/header");
          const previous = reader.previous("request-prompt")?.state;
          const systemContext = reader.previous("system-message");
          const system = systemContext?.state.effective;
          const location = match.location.kind === "step" ? {
            turn: match.location.turn.turn,
            step: match.location.step.step
          } : {};
          const inspection = inspect(previous?.prompt, match.event, system);
          const change = inspection.change?.kind;
          const systemEvent = systemContext?.matches[0]?.event;
          const shownByUpdate = system !== void 0 && systemEvent?.type === "system/message" && systemEvent.surfaceOp === "append" && (system.update || previous === void 0) && system.turn === location.turn && system.step === location.step;
          return {
            anchorSeq: stableRequestPromptAnchor(context, match, previous, match.event.data.reason === "initial"),
            showsPrompt: !shownByUpdate && (previous === void 0 || match.event.data.reason !== "change" || match.event.data.startsSeries === true || change === "system" || change === "system-and-tools"),
            ...location,
            ...inspection
          };
        },
        update: (context) => context.state,
        buildViewNode: (context) => {
          const state = context.state;
          if (state === void 0) return null;
          const current = context.current.get("chat");
          const visible = state.showsPrompt && state.prompt.system !== "";
          if (!visible && current?.kind !== "system-prompt") return null;
          return chatNode(context, "system-prompt", state.anchorSeq, { text: state.prompt.system }, { visibility: visible ? "visible" : "hidden" });
        }
      };
    }
    function registerRequestPromptConversationNode(ctx) {
      ctx.uiConversation.events.register(systemMessageDefinition((previous, event) => ctx.uiConversation.inspectSystemPrompt(previous, event)));
      ctx.uiConversation.events.register(requestPromptDefinition((previous, event, system) => ctx.uiConversation.inspectRequestPrompt(previous, event, system)));
    }
    function scheduledNode(match) {
      if (match.event.type !== "llm/retry") return void 0;
      return {
        kind: "model-retry",
        seq: match.event.seq,
        time: match.event.time,
        retryState: "scheduled",
        ...match.event.data
      };
    }
    function isClosed(location) {
      return location.kind === "step" && location.step.status === "closed" || (location.kind === "step" || location.kind === "turn") && location.turn.status === "closed";
    }
    const retryDefinition = {
      kind: "model-retry",
      target: "chat",
      match: (event) => {
        if (event.type === "llm/retry") {
          const retryId = event.data.retryId;
          if (typeof retryId !== "string" || retryId === "") return null;
          return {
            id: retryId,
            role: event.data.retry === 1 ? "start" : "update"
          };
        }
        if (event.type === "llm/retry-started") {
          const retryId = event.data.retryId;
          return typeof retryId === "string" && retryId !== "" ? {
            id: retryId,
            role: "update"
          } : null;
        }
        return null;
      },
      start: (_context, match) => {
        const node = scheduledNode(match);
        if (node === void 0) throw new Error("model-retry start requires a valid llm/retry event");
        return {
          turn: node.turn,
          step: node.step,
          attempts: [node]
        };
      },
      update: (context, match) => {
        if (match.event.type === "llm/retry") {
          const node = scheduledNode(match);
          return node === void 0 ? context.state : {
            ...context.state,
            attempts: [...context.state.attempts, node]
          };
        }
        if (match.event.type !== "llm/retry-started") return context.state;
        const retry = match.event.data.retry;
        return {
          ...context.state,
          attempts: context.state.attempts.map((attempt) => attempt.retry === retry ? {
            ...attempt,
            retryState: "started"
          } : attempt)
        };
      },
      buildViewNode: (context) => {
        if (context.state === void 0 || context.state.attempts.length === 0) return null;
        const location = context.start?.location ?? context.matches[0]?.location ?? { kind: "unresolved" };
        const stateAttempts = context.state.attempts;
        const attempts = stateAttempts.map((attempt, index) => index === stateAttempts.length - 1 && attempt.retryState === "scheduled" && isClosed(location) ? {
          ...attempt,
          retryState: "cancelled"
        } : attempt);
        const current = attempts.at(-1);
        if (current === void 0) return null;
        const data = {
          attempts,
          current
        };
        return chatNode(context, "model-retry", attempts[0]?.seq ?? current.seq, data);
      }
    };
    function registerRetryConversationNode(ctx) {
      ctx.uiConversation.events.register(retryDefinition);
    }
    const MAX_DEPTH = 256;
    const projectedBlocks = /* @__PURE__ */ new WeakMap();
    function jsonArguments(value) {
      return JSON.stringify(value);
    }
    function rootCall(match) {
      if (match.event.type !== "tool/call") throw new Error("tool-call start requires tool/call");
      return {
        callId: String(match.event.data.callId),
        name: match.event.data.name,
        argsRaw: match.event.data.arguments,
        turn: match.event.data.turn,
        step: match.event.data.step,
        time: match.event.time,
        subCalls: []
      };
    }
    function rootResult(match, previous) {
      if (match.event.type !== "tool/result") return void 0;
      const message = match.event.data.message;
      return {
        kind: "tool-result",
        seq: match.event.seq,
        time: match.event.time,
        callId: String(message.source.callId),
        call: previous === void 0 ? null : {
          name: previous.name,
          argsRaw: previous.argsRaw
        },
        callTime: previous?.time ?? null,
        content: message.content,
        isError: message.isError === true,
        ...match.event.data.error === void 0 ? {} : { error: match.event.data.error },
        meta: match.event.data.meta,
        subCalls: []
      };
    }
    function childCall(match, data) {
      return {
        callId: data.subCallId,
        parentCallId: data.parentCallId,
        name: data.name,
        argsRaw: jsonArguments(data.arguments),
        turn: locationTurn(match),
        step: locationStep(match),
        time: match.event.time,
        subCalls: []
      };
    }
    function childResult(match, data, previous) {
      return {
        kind: "tool-result",
        seq: match.event.seq,
        time: match.event.time,
        callId: data.subCallId,
        parentCallId: data.parentCallId,
        call: {
          name: data.name,
          argsRaw: jsonArguments(data.arguments)
        },
        callTime: previous?.time ?? null,
        content: data.content ?? [],
        isError: data.isError === true,
        ...data.error === void 0 ? {} : { error: data.error },
        subCalls: []
      };
    }
    function locationTurn(match) {
      return match.location.kind === "step" || match.location.kind === "turn" ? match.location.turn.turn : 0;
    }
    function locationStep(match) {
      return match.location.kind === "step" ? match.location.step.step : 0;
    }
    function acceptsEdge(state, parent, child) {
      if (parent === child || state.parents.has(child)) return false;
      let cursor = parent;
      let parentDepth = 0;
      const ancestors = /* @__PURE__ */ new Set();
      while (cursor !== void 0) {
        if (cursor === child || ancestors.has(cursor)) return false;
        ancestors.add(cursor);
        parentDepth++;
        cursor = state.parents.get(cursor);
      }
      const pending = [{
        callId: child,
        depth: 1
      }];
      const descendants = /* @__PURE__ */ new Set();
      let subtreeDepth = 0;
      for (const candidate of pending) {
        if (descendants.has(candidate.callId)) return false;
        descendants.add(candidate.callId);
        subtreeDepth = Math.max(subtreeDepth, candidate.depth);
        for (const nested of state.children.get(candidate.callId) ?? []) pending.push({
          callId: nested.callId,
          depth: candidate.depth + 1
        });
      }
      return parentDepth + subtreeDepth <= MAX_DEPTH;
    }
    function updateDispatch(state, match) {
      const event = match.event;
      if (event.type !== "tool/ptc-dispatch-start" && event.type !== "tool/ptc-dispatch") return state;
      const data = event.data;
      const parentCallId = String(data.parentCallId);
      const subCallId = String(data.subCallId);
      const siblings = state.children.get(parentCallId) ?? [];
      const index = siblings.findIndex((candidate) => candidate.callId === subCallId);
      if (event.type === "tool/ptc-dispatch-start") {
        if (index >= 0 || !acceptsEdge(state, parentCallId, subCallId)) return state;
        const children2 = new Map(state.children);
        children2.set(parentCallId, [...siblings, childCall(match, data)]);
        const parents2 = new Map(state.parents);
        parents2.set(subCallId, parentCallId);
        return {
          ...state,
          children: children2,
          parents: parents2
        };
      }
      if (index < 0 && !acceptsEdge(state, parentCallId, subCallId)) return state;
      const settled = childResult(match, data, index < 0 ? void 0 : siblings[index]);
      const children = new Map(state.children);
      children.set(parentCallId, index < 0 ? [...siblings, settled] : siblings.map((child, at) => at === index ? settled : child));
      const parents = new Map(state.parents);
      if (index < 0) parents.set(subCallId, parentCallId);
      return {
        ...state,
        children,
        parents
      };
    }
    function projectBlock(block, state, interruptedAt, visited = /* @__PURE__ */ new Set(), depth = 1) {
      if (visited.has(block.callId) || depth > MAX_DEPTH) return {
        ...block,
        subCalls: []
      };
      const nextVisited = new Set(visited);
      nextVisited.add(block.callId);
      const children = (state.children.get(block.callId) ?? block.subCalls).map((child) => projectBlock(child, state, interruptedAt, nextVisited, depth + 1));
      const interruptionSeq = "kind" in block ? void 0 : interruptedAt?.seq;
      const interruptionTime = "kind" in block ? void 0 : interruptedAt?.time;
      const cached = projectedBlocks.get(block);
      if (cached !== void 0 && cached.interruptionSeq === interruptionSeq && cached.interruptionTime === interruptionTime && sameReferences(cached.children, children)) return cached.value;
      const projected = "kind" in block || interruptedAt === void 0 ? sameReferences(block.subCalls, children) ? block : {
        ...block,
        subCalls: children
      } : {
        kind: "tool-result",
        seq: interruptedAt.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.interruptedFollowup,
        time: interruptedAt.time,
        callId: block.callId,
        ...block.parentCallId === void 0 ? {} : { parentCallId: block.parentCallId },
        call: {
          name: block.name,
          argsRaw: block.argsRaw
        },
        callTime: block.time,
        content: [],
        isError: true,
        error: {
          name: "Interrupted",
          code: "interrupted"
        },
        subCalls: children
      };
      projectedBlocks.set(block, {
        children,
        interruptionSeq,
        interruptionTime,
        value: projected
      });
      return projected;
    }
    function sameReferences(left, right) {
      return left.length === right.length && left.every((value, index) => value === right[index]);
    }
    function interruption(context) {
      const location = context.start?.location;
      if (location?.kind === "step" && location.step.status === "closed") return location.step.end;
      if ((location?.kind === "step" || location?.kind === "turn") && location.turn.status === "closed") return location.turn.end;
    }
    function fallbackState$2(context) {
      const match = context.matches.find((candidate) => candidate.event.type === "tool/result");
      const root = match === void 0 ? void 0 : rootResult(match);
      if (root === void 0) return void 0;
      let state = {
        root,
        children: /* @__PURE__ */ new Map(),
        parents: /* @__PURE__ */ new Map()
      };
      for (const candidate of context.matches) state = updateDispatch(state, candidate);
      return state;
    }
    const toolDefinition = {
      kind: "tool-call",
      target: "chat",
      match: (event) => {
        if (event.type === "tool/call") return {
          id: String(event.data.callId),
          role: "start"
        };
        if (event.type === "tool/result" && isAppendSurfaceEvent(event)) return {
          id: String(event.data.message.source.callId),
          role: "update"
        };
        if (event.type === "tool/ptc-dispatch-start" || event.type === "tool/ptc-dispatch") {
          const rootCallId = event.data.rootCallId;
          return typeof rootCallId === "string" && rootCallId !== "" ? {
            id: rootCallId,
            role: "update"
          } : null;
        }
        return null;
      },
      start: (_context, match) => ({
        root: rootCall(match),
        children: /* @__PURE__ */ new Map(),
        parents: /* @__PURE__ */ new Map()
      }),
      update: (context, match) => {
        if (match.event.type === "tool/result") {
          const result = rootResult(match, "kind" in context.state.root ? void 0 : context.state.root);
          return result === void 0 ? context.state : {
            ...context.state,
            root: result
          };
        }
        return updateDispatch(context.state, match);
      },
      buildViewNode: (context) => {
        const state = context.state ?? fallbackState$2(context);
        if (state === void 0) return null;
        const projected = projectBlock(state.root, state, interruption(context));
        return chatNode(context, "tool-call", context.start?.event.seq ?? ("kind" in state.root ? state.root.seq : context.matches[0]?.event.seq ?? 0), { root: projected });
      }
    };
    function registerToolConversationNode(ctx) {
      ctx.uiConversation.events.register(toolDefinition);
    }
    function lastStep$1(context) {
      const location = context.start?.location ?? context.matches[0]?.location;
      if (location?.kind !== "turn" && location?.kind !== "step") return 0;
      return location.turn.steps.at(-1)?.step ?? 0;
    }
    function failureFrom(match) {
      if (match.event.type !== "turn/end" || match.event.data.reason.kind !== "error") return void 0;
      const failure = match.event.data.reason.error;
      const display = displayFailure(failure);
      return {
        seq: match.event.seq,
        time: match.event.time,
        message: display.message,
        ...display.code === void 0 ? {} : { code: display.code }
      };
    }
    function fallbackState$1(context) {
      const end = context.matches.find((match) => failureFrom(match) !== void 0);
      if (end?.event.type !== "turn/end") return void 0;
      const failure = failureFrom(end);
      if (failure === void 0) return void 0;
      return {
        turn: end.event.data.turn,
        failure
      };
    }
    const turnErrorDefinition = {
      kind: "turn-error",
      target: "chat",
      match: (event) => {
        if (event.type === "turn/start") return {
          id: String(event.data.turn),
          role: "start"
        };
        if (event.type === "turn/end" && event.data.reason.kind === "error") return {
          id: String(event.data.turn),
          role: "update"
        };
        return null;
      },
      start: (_context, match) => {
        if (match.event.type !== "turn/start") throw new Error("turn-error start requires turn/start");
        return { turn: match.event.data.turn };
      },
      update: (context, match) => {
        const failure = failureFrom(match);
        return failure === void 0 ? context.state : {
          ...context.state,
          failure
        };
      },
      buildViewNode: (context) => {
        const state = context.state ?? fallbackState$1(context);
        if (state?.failure === void 0) return null;
        const failure = state.failure;
        const node = {
          kind: "turn-error",
          seq: failure.seq,
          time: failure.time,
          turn: state.turn,
          step: lastStep$1(context),
          message: failure.message,
          ...failure.code === void 0 ? {} : { code: failure.code }
        };
        return chatNode(context, "turn-error", node.seq, node);
      }
    };
    function registerTurnErrorConversationNode(ctx) {
      ctx.uiConversation.events.register(turnErrorDefinition);
    }
    function lastStep(context) {
      const location = context.start?.location ?? context.matches[0]?.location;
      if (location?.kind !== "turn" && location?.kind !== "step") return 0;
      return location.turn.steps.at(-1)?.step ?? 0;
    }
    function noticeAnchor(context, seq) {
      const location = context.start?.location ?? context.matches[0]?.location;
      if (location?.kind !== "turn" && location?.kind !== "step") return seq;
      const closing = location.turn.data.get("turn-tail")?.closing;
      return closing === null || closing === void 0 ? seq : closing.finalNode.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.maxTokensNotice;
    }
    function stateFrom(match) {
      if (match.event.type !== "turn/end" || match.event.data.reason.kind !== "max-tokens") return void 0;
      return {
        turn: match.event.data.turn,
        seq: match.event.seq,
        time: match.event.time
      };
    }
    const turnMaxTokensDefinition = {
      kind: "turn-max-tokens",
      target: "chat",
      match: (event) => {
        if (event.type === "turn/end" && event.data.reason.kind === "max-tokens") return {
          id: String(event.data.turn),
          role: "start"
        };
        return null;
      },
      start: (_context, match) => {
        const state = stateFrom(match);
        if (state === void 0) throw new Error("turn-max-tokens start requires a max-tokens turn/end");
        return state;
      },
      update: (context) => context.state,
      buildViewNode: (context) => {
        const state = context.state;
        if (state === void 0) return null;
        const node = {
          kind: "turn-max-tokens",
          seq: state.seq,
          time: state.time,
          turn: state.turn,
          step: lastStep(context)
        };
        return chatNode(context, "turn-max-tokens", noticeAnchor(context, state.seq), node);
      }
    };
    function registerTurnMaxTokensConversationNode(ctx) {
      ctx.uiConversation.events.register(turnMaxTokensDefinition);
    }
    function eventTurn(event) {
      const data = event.data;
      return typeof data.turn === "number" ? data.turn : void 0;
    }
    function visibleChunk(chunk) {
      if (chunk.type === "text-delta" || chunk.type === "reasoning-delta") return chunk.text.trim() !== "";
      if (chunk.type === "block-start") return chunk.blockType !== "text" && chunk.blockType !== "reasoning" && chunk.blockType !== "tool-call";
      if (chunk.type !== "block-end") return false;
      const block = chunk.block;
      if (block.type === "tool-call") return false;
      if (block.type === "text" || block.type === "reasoning") return block.text.trim() !== "";
      return true;
    }
    function visibleAssistantEvent(event) {
      if (event.type === "assistant/live-chunk") return visibleChunk(event.data.chunk);
      if (event.type === "assistant/attempt") return false;
      return event.type === "assistant/message" && event.surfaceOp === "append" && toAssistantBlocks(event.data.message.content).some((block) => {
        if (block.kind === "tool-call") return false;
        if (block.kind === "text" || block.kind === "reasoning") return block.text.trim() !== "";
        return true;
      });
    }
    function processEvidence(event) {
      if (visibleAssistantEvent(event)) {
        if (event.type !== "assistant/live-chunk" && event.type !== "assistant/message" && event.type !== "assistant/attempt") return void 0;
        return {
          kind: "assistant",
          seq: event.seq,
          step: event.data.step
        };
      }
      if (event.type === "tool/call" || event.type === "tool/result" && event.surfaceOp === "append" || event.type === "llm/retry") return {
        kind: "other",
        seq: event.seq
      };
    }
    function turnLocation$1(context) {
      const location = context.start?.location ?? context.matches.at(-1)?.location;
      return location?.kind === "turn" || location?.kind === "step" ? location.turn : void 0;
    }
    function fallbackState(context) {
      const turn = context.matches.map((match) => eventTurn(match.event)).find((candidate) => candidate !== void 0);
      if (turn === void 0) return void 0;
      let state = {
        turn,
        assistantStartByStep: /* @__PURE__ */ new Map(),
        messageCountByStep: /* @__PURE__ */ new Map(),
        messageCount: 0,
        toolCallCount: 0,
        subagentCount: 0
      };
      for (const match of context.matches) state = updateProcessState(state, match.event);
      return state;
    }
    function isFinalAssistant(data) {
      return data?.finalNode !== void 0;
    }
    function latestAnswer(turn) {
      const data = turn.steps.at(-1)?.data.get("assistant-step");
      if (!isFinalAssistant(data) || !hasAssistantReplyContent(data.blocks)) return null;
      return data.blocks.some((block) => block.kind === "tool-call") ? null : data;
    }
    function processSpec(state, turn) {
      const controlAnchorSeq = state.controlAnchorSeq ?? turn.start?.seq;
      if (controlAnchorSeq === void 0) return null;
      const answer = latestAnswer(turn);
      const counts = {
        messageCount: answer === null ? state.messageCount : [...state.messageCountByStep].filter(([step]) => step < answer.step).reduce((total, [, count]) => total + count, 0),
        toolCallCount: state.toolCallCount,
        subagentCount: state.subagentCount
      };
      if (answer === null) return {
        turn: turn.turn,
        controlAnchorSeq,
        processStartSeq: controlAnchorSeq,
        answerAnchorSeq: null,
        answerStep: null,
        inlineReasoning: false,
        ...counts
      };
      const inlineReasoning = answer.blocks.some((block) => block.kind === "reasoning" && block.text.trim() !== "");
      const earlierAssistantSeq = Math.min(...[...state.assistantStartByStep].filter(([step]) => step < answer.step).map(([, seq]) => seq));
      const externalProcessSeq = Math.min(state.otherStartSeq ?? Number.POSITIVE_INFINITY, earlierAssistantSeq);
      return {
        turn: turn.turn,
        controlAnchorSeq,
        processStartSeq: turn.start?.seq ?? (Number.isFinite(externalProcessSeq) ? externalProcessSeq : answer.finalNode.seq),
        answerAnchorSeq: answer.finalNode.seq,
        answerStep: answer.step,
        inlineReasoning,
        ...counts
      };
    }
    function updateProcessState(state, event) {
      let current = state;
      if (event.type === "assistant/message" && event.surfaceOp === "append" && hasAssistantReplyContent(toAssistantBlocks(event.data.message.content))) {
        const messageCountByStep = new Map(current.messageCountByStep);
        messageCountByStep.set(event.data.step, (messageCountByStep.get(event.data.step) ?? 0) + 1);
        current = {
          ...current,
          messageCountByStep,
          messageCount: current.messageCount + 1
        };
      }
      if (event.type === "tool/call") {
        const subagent = isSubagentDelegationTool(event.data.name);
        current = {
          ...current,
          toolCallCount: current.toolCallCount + (subagent ? 0 : 1),
          subagentCount: current.subagentCount + (subagent ? 1 : 0)
        };
      }
      const evidence = processEvidence(event);
      if (evidence === void 0) return current;
      if (evidence.kind === "other") return current.otherStartSeq === void 0 ? {
        ...current,
        otherStartSeq: evidence.seq,
        controlAnchorSeq: Math.min(current.controlAnchorSeq ?? Number.POSITIVE_INFINITY, evidence.seq)
      } : current;
      if (current.assistantStartByStep.has(evidence.step)) return current;
      const assistantStartByStep = new Map(current.assistantStartByStep);
      assistantStartByStep.set(evidence.step, evidence.seq);
      return {
        ...current,
        assistantStartByStep,
        controlAnchorSeq: Math.min(current.controlAnchorSeq ?? Number.POSITIVE_INFINITY, evidence.seq)
      };
    }
    const turnProcessDefinition = {
      kind: "turn-process",
      target: "chat",
      match: (event) => {
        if (event.type === "turn/start") return {
          id: String(event.data.turn),
          role: "start"
        };
        const turn = eventTurn(event);
        if (turn === void 0) return null;
        if (event.type === "assistant/live-chunk" || event.type === "assistant/message" || event.type === "tool/call" || event.type === "tool/result" || event.type === "llm/retry" || event.type === "step/start" || event.type === "step/end" || event.type === "turn/end") return {
          id: String(turn),
          role: "update"
        };
        return null;
      },
      start: (_context, match) => {
        if (match.event.type !== "turn/start") throw new Error("turn-process start requires turn/start");
        return {
          turn: match.event.data.turn,
          assistantStartByStep: /* @__PURE__ */ new Map(),
          messageCountByStep: /* @__PURE__ */ new Map(),
          messageCount: 0,
          toolCallCount: 0,
          subagentCount: 0
        };
      },
      update: (context, match) => updateProcessState(context.state, match.event),
      publication: (match) => {
        if (match.event.type === "assistant/live-chunk") {
          const type = match.event.data.chunk.type;
          return type === "usage" || type === "finish" ? "none" : "animation-frame";
        }
        return "immediate";
      },
      buildLocationData: (context, scope, previous) => {
        if (scope !== "turn") return null;
        const state = context.state ?? fallbackState(context);
        if (state === void 0) return null;
        const turn = turnLocation$1(context);
        if (turn === void 0) return null;
        const current = context.current.get("chat");
        const latestStep = turn.steps.at(-1);
        if (previous?.kind === "turn" && previous.key === "turn-process" && current?.kind === "turn-process" && current.data.answerAnchorSeq === null && current.data.controlAnchorSeq === state.controlAnchorSeq && current.data.messageCount === state.messageCount && current.data.toolCallCount === state.toolCallCount && current.data.subagentCount === state.subagentCount && turn.status !== "closed" && latestStep?.status !== "closed") return previous;
        const spec = processSpec(state, turn);
        if (spec === null) return null;
        if (previous?.kind === "turn" && previous.turn === spec.turn && previous.key === "turn-process" && sameTurnProcessSpec(previous.value, spec)) return previous;
        return {
          kind: "turn",
          turn: turn.turn,
          key: "turn-process",
          value: spec
        };
      },
      buildViewNode: (context) => {
        const turn = turnLocation$1(context);
        const data = turn?.data.get("turn-process");
        if (turn === void 0 || data === void 0) return null;
        const current = context.current.get("chat");
        const state = context.state;
        if (current?.kind === "turn-process" && state !== void 0 && current.data.answerAnchorSeq === null && current.data.controlAnchorSeq === state.controlAnchorSeq && current.data.messageCount === state.messageCount && current.data.toolCallCount === state.toolCallCount && current.data.subagentCount === state.subagentCount && turn.status !== "closed" && turn.steps.at(-1)?.status !== "closed" && current.location === (context.start?.location ?? context.matches[0]?.location)) return current;
        return chatNode(context, "turn-process", data.controlAnchorSeq + CHAT_SYNTHETIC_SEQ_OFFSETS.processControl, data);
      }
    };
    function registerTurnProcess(ctx) {
      ctx.uiConversation.events.register(turnProcessDefinition);
    }
    function lastAssistantStreamChunk(stream, type) {
      for (let index = stream.length - 1; index >= 0; index -= 1) {
        const record2 = stream[index];
        if (record2.type === "chunk" && record2.chunk.type === type) return record2.chunk;
      }
    }
    function isCount(value) {
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    }
    function safeSum(values) {
      let total = 0;
      for (const value of values) {
        total += value;
        if (!Number.isSafeInteger(total)) return void 0;
      }
      return total;
    }
    function messageRoute(message) {
      const { provider, model } = message.source;
      return provider.length > 0 && model.length > 0 ? {
        provider,
        model
      } : void 0;
    }
    function streamUsage(stream) {
      return lastAssistantStreamChunk(stream, "usage")?.usage;
    }
    function normalizeUsage(usage, route) {
      const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens } = usage;
      if (!isCount(inputTokens) || !isCount(outputTokens)) return void 0;
      if (cacheReadTokens !== void 0 && !isCount(cacheReadTokens)) return void 0;
      if (cacheWriteTokens !== void 0 && !isCount(cacheWriteTokens)) return void 0;
      if (reasoningTokens !== void 0 && (!isCount(reasoningTokens) || reasoningTokens > outputTokens)) return;
      const knownPrompt = safeSum([
        inputTokens,
        ...cacheReadTokens === void 0 ? [] : [cacheReadTokens],
        ...cacheWriteTokens === void 0 ? [] : [cacheWriteTokens]
      ]);
      if (knownPrompt === void 0) return void 0;
      let exactTotal;
      if (totalTokens !== void 0) {
        if (!isCount(totalTokens)) return void 0;
        const exactPrompt = totalTokens - outputTokens;
        if (!isCount(exactPrompt) || exactPrompt < knownPrompt) return void 0;
        if (cacheReadTokens !== void 0 && cacheWriteTokens !== void 0 && exactPrompt !== knownPrompt) return;
        exactTotal = totalTokens;
      } else {
        if (cacheReadTokens === void 0 || cacheWriteTokens === void 0) return void 0;
        const derivedTotal = safeSum([knownPrompt, outputTokens]);
        if (derivedTotal === void 0) return void 0;
        exactTotal = derivedTotal;
      }
      return {
        inputTokens,
        outputTokens,
        totalTokens: exactTotal,
        ...cacheReadTokens === void 0 ? {} : { cacheReadTokens },
        ...cacheWriteTokens === void 0 ? {} : { cacheWriteTokens },
        ...reasoningTokens === void 0 ? {} : { reasoningTokens },
        ...route === void 0 ? {} : { route }
      };
    }
    function aggregateAttempts(attempts) {
      if (attempts.length === 0) return void 0;
      const inputTokens = safeSum(attempts.map((attempt) => attempt.inputTokens));
      const outputTokens = safeSum(attempts.map((attempt) => attempt.outputTokens));
      const totalTokens = safeSum(attempts.map((attempt) => attempt.totalTokens));
      if (inputTokens === void 0 || outputTokens === void 0 || totalTokens === void 0) return void 0;
      const cacheRead = attempts.map((attempt) => attempt.cacheReadTokens);
      const cacheWrite = attempts.map((attempt) => attempt.cacheWriteTokens);
      const reasoning2 = attempts.map((attempt) => attempt.reasoningTokens);
      const cacheReadTokens = cacheRead.every(isCount) ? safeSum(cacheRead) : void 0;
      const cacheWriteTokens = cacheWrite.every(isCount) ? safeSum(cacheWrite) : void 0;
      const reasoningTokens = reasoning2.every(isCount) ? safeSum(reasoning2) : void 0;
      let routes;
      const attributed = attempts.map((attempt) => attempt.route);
      if (attributed.every((route) => route !== void 0)) {
        const unique = /* @__PURE__ */ new Map();
        for (const route of attributed) unique.set(`${route.provider}\0${route.model}`, route);
        routes = [...unique.values()];
      }
      return {
        uncachedInputTokens: inputTokens,
        outputTokens,
        totalTokens,
        ...cacheReadTokens === void 0 ? {} : { cacheReadTokens },
        ...cacheWriteTokens === void 0 ? {} : { cacheWriteTokens },
        ...reasoningTokens === void 0 ? {} : { reasoningTokens },
        ...routes === void 0 ? {} : { routes }
      };
    }
    function sameAttempt(state, turn, step) {
      return state.turn === turn && state.step === step;
    }
    function deriveTurnTokenUsage(events) {
      let state = { kind: "idle" };
      const attempts = [];
      let turn;
      let sawEnd = false;
      let invalid = false;
      const closeOpen = (route) => {
        if (state.kind !== "open" || state.sample === void 0) return false;
        const normalized = normalizeUsage(state.sample, route);
        if (normalized === void 0) return false;
        attempts.push(normalized);
        return true;
      };
      for (const event of events) {
        if (invalid) break;
        if (event.type === "turn/start") {
          if (turn !== void 0 || state.kind !== "idle") invalid = true;
          else turn = event.data.turn;
          continue;
        }
        if (turn === void 0) {
          invalid = true;
          break;
        }
        if (event.type === "turn/end") {
          if (event.data.turn !== turn || state.kind !== "idle" || sawEnd) invalid = true;
          else sawEnd = true;
          continue;
        }
        if (sawEnd) {
          invalid = true;
          break;
        }
        if (event.type === "step/start") {
          if (event.data.turn !== turn || state.kind !== "idle") invalid = true;
          else state = {
            kind: "open",
            turn,
            step: event.data.step
          };
          continue;
        }
        if (event.type === "llm/retry-started") {
          if (event.data.turn !== turn || state.kind !== "settled" || state.by !== "retry" || !sameAttempt(state, event.data.turn, event.data.step)) invalid = true;
          else state = {
            kind: "open",
            turn,
            step: event.data.step
          };
          continue;
        }
        if (event.type === "assistant/attempt") {
          if (event.data.turn !== turn || state.kind !== "open" || !sameAttempt(state, event.data.turn, event.data.step)) {
            invalid = true;
            continue;
          }
          const sample = streamUsage(event.data.stream) ?? state.sample;
          state = {
            kind: "open",
            turn,
            step: event.data.step,
            ...sample === void 0 ? {} : { sample }
          };
          if (!closeOpen()) invalid = true;
          else state = {
            kind: "finishClosed",
            turn,
            step: event.data.step
          };
          continue;
        }
        if (event.type === "assistant/message") {
          if (event.data.turn !== turn || state.kind !== "open" || !sameAttempt(state, event.data.turn, event.data.step)) {
            invalid = true;
            continue;
          }
          const sample = event.data.usage ?? streamUsage(event.data.stream);
          if (sample !== void 0) state = {
            ...state,
            sample
          };
          if (!closeOpen(messageRoute(event.data.message))) invalid = true;
          else state = {
            kind: "settled",
            turn,
            step: event.data.step,
            by: "message"
          };
          continue;
        }
        if (event.type === "llm/retry") {
          if (event.data.turn !== turn || state.kind === "idle" || !sameAttempt(state, event.data.turn, event.data.step)) {
            invalid = true;
            continue;
          }
          if (state.kind === "settled" || state.kind === "open" && !closeOpen()) invalid = true;
          if (!invalid) state = {
            kind: "settled",
            turn,
            step: event.data.step,
            by: "retry"
          };
          continue;
        }
        if (event.type === "step/end") {
          if (event.data.turn !== turn || state.kind === "idle" || !sameAttempt(state, event.data.turn, event.data.step)) {
            invalid = true;
            continue;
          }
          if (state.kind === "open" && !closeOpen()) invalid = true;
          if (!invalid) state = { kind: "idle" };
        }
      }
      return invalid || !sawEnd || state.kind !== "idle" ? void 0 : aggregateAttempts(attempts);
    }
    function isSessionEvent(event) {
      return event.type !== "assistant/live-chunk";
    }
    function turnCoordinates(event) {
      if (event.type === "assistant/message" || event.type === "assistant/attempt" || event.type === "assistant/live-chunk" || event.type === "step/start" || event.type === "step/end") return {
        turn: event.data.turn,
        step: event.data.step
      };
      if (event.type === "llm/retry" || event.type === "llm/retry-started") return {
        turn: event.data.turn,
        step: event.data.step
      };
    }
    function turnLocation(context) {
      const location = context.start?.location ?? context.matches[0]?.location;
      return location?.kind === "turn" || location?.kind === "step" ? location.turn : void 0;
    }
    function hasText(data) {
      return data.finalNode !== void 0 && data.blocks.some((block) => block.kind === "text" && block.text.trim() !== "");
    }
    function tailData(context) {
      const end = context.state === void 0 ? context.matches.find((match) => match.event.type === "turn/end") : context.state.end;
      if (end?.event.type !== "turn/end") return null;
      const turn = turnLocation(context);
      if (turn === void 0) return null;
      const finalized = turn.steps.map((step) => step.data.get("assistant-step")).filter((candidate) => candidate !== void 0).filter((candidate) => candidate.finalNode !== void 0).sort((left, right) => left.finalNode.seq - right.finalNode.seq);
      const closing = finalized.findLast(hasText) ?? null;
      let latestTranscriptSeq = finalized.at(-1)?.finalNode.seq;
      for (const match of context.matches) {
        const event = match.event;
        const candidate = event.type === "tool/call" || event.type === "tool/result" && event.surfaceOp === "append" || event.type === "turn/end" && event.data.reason.kind === "error" || event.type === "llm/retry" ? event.seq : void 0;
        if (candidate !== void 0 && (latestTranscriptSeq === void 0 || candidate > latestTranscriptSeq)) latestTranscriptSeq = candidate;
      }
      const tokenUsage = context.start?.event.type === "turn/start" ? deriveTurnTokenUsage(context.matches.map((match) => match.event).filter(isSessionEvent)) : void 0;
      return {
        turn: end.event.data.turn,
        seq: end.event.seq,
        time: end.event.time,
        closing,
        branchUnavailable: closing === null || latestTranscriptSeq !== closing.finalNode.seq,
        ...tokenUsage === void 0 ? {} : { tokenUsage }
      };
    }
    const turnTailDefinition = {
      kind: "turn-tail",
      target: "chat",
      match: (event) => {
        if (event.type === "turn/start") return {
          id: String(event.data.turn),
          role: "start"
        };
        if (event.type === "turn/end") return {
          id: String(event.data.turn),
          role: "update"
        };
        if (event.type === "tool/call" || event.type === "tool/result") return {
          id: String(event.data.turn),
          role: "update"
        };
        const coordinates = turnCoordinates(event);
        if (coordinates !== void 0) return {
          id: String(coordinates.turn),
          role: "update"
        };
        return null;
      },
      start: (_context, match) => {
        if (match.event.type !== "turn/start") throw new Error("turn-tail start requires turn/start");
        return { turn: match.event.data.turn };
      },
      update: (context, match) => match.event.type === "turn/end" ? {
        ...context.state,
        end: match
      } : context.state,
      publication: (match) => match.event.type === "turn/end" ? "immediate" : "none",
      buildLocationData: (context, scope) => {
        if (scope !== "turn") return null;
        const value = tailData(context);
        return value === null ? null : {
          kind: "turn",
          turn: value.turn,
          key: "turn-tail",
          value
        };
      },
      buildViewNode: (context) => {
        const data = turnLocation(context)?.data.get("turn-tail");
        return data === void 0 ? null : chatNode(context, "turn-tail", data.seq + CHAT_SYNTHETIC_SEQ_OFFSETS.finalizedFollowup, data);
      }
    };
    function registerTurnTailConversationNode(ctx) {
      ctx.uiConversation.events.register(turnTailDefinition);
    }
    function brandString(value) {
      return value;
    }
    function activity(name) {
      if (/^computer_use(?:_|$)/.test(name.split(/[./]/).at(-1) ?? "")) return "computer";
      if (name === "read_image") return "images";
      if ([
        "read",
        "list_mcp_resources",
        "list_mcp_resource_templates",
        "read_mcp_resource"
      ].includes(name)) return "read";
      if (name === "grep" || name === "glob" || name.endsWith("_inspect")) return "search";
      if ([
        "write",
        "edit",
        "apply_patch"
      ].includes(name)) return "edit";
      if ([
        "bash",
        "pwsh",
        "exec_command",
        "write_stdin"
      ].includes(name) || name.startsWith("terminal_")) return "commands";
      if (name === "run_code") return "code";
      if (name === "web_search") return "webSearch";
      if (name === "web_fetch") return "webFetch";
      if (name === "subagent" || name.startsWith("subagent_")) return "subagents";
      if ([
        "todo_write",
        "create_goal",
        "update_goal",
        "get_goal"
      ].includes(name)) return "plan";
      if (name === "ask_user_question" || name === "request_user_input") return "questions";
      return "tools";
    }
    const LIVE_TOOL_DETAIL_MAX_CHARS = 160;
    const LIVE_TOOL_DETAIL_SEGMENTER = new Intl.Segmenter(void 0, { granularity: "grapheme" });
    const LIVE_TOOL_DETAIL_KEYS = [
      "title",
      "description",
      "objective",
      "task",
      "task_name",
      "name",
      "question",
      "questions",
      "prompt",
      "message",
      "command",
      "cmd",
      "queries",
      "query",
      "pattern",
      "url",
      "uri",
      "file_path",
      "path",
      "target",
      "action",
      "status"
    ];
    function normalizeLiveToolDetail(value) {
      const normalized = (typeof value === "string" ? value : Array.isArray(value) && value.every((item) => typeof item === "string") ? value.join(", ") : "").replace(/\s+/g, " ").trim();
      const chars = Array.from(LIVE_TOOL_DETAIL_SEGMENTER.segment(normalized), (part) => part.segment);
      return chars.length <= LIVE_TOOL_DETAIL_MAX_CHARS ? normalized : `${chars.slice(0, LIVE_TOOL_DETAIL_MAX_CHARS - 1).join("").trimEnd()}\u2026`;
    }
    function questionDetail(value) {
      if (!Array.isArray(value)) return "";
      for (const item of value) {
        if (item === null || typeof item !== "object") continue;
        const detail = normalizeLiveToolDetail(Reflect.get(item, "question"));
        if (detail !== "") return detail;
      }
      return "";
    }
    function liveReasoningDetail(nodes) {
      for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex--) {
        const node = nodes[nodeIndex];
        if (node?.kind !== "assistant-step" || node.data.status !== "running") continue;
        for (let blockIndex = node.data.blocks.length - 1; blockIndex >= 0; blockIndex--) {
          const block = node.data.blocks[blockIndex];
          if (block?.kind !== "reasoning") continue;
          const paragraphs = block.text.split(/\r?\n[\t ]*\r?\n/);
          for (let paragraphIndex = paragraphs.length - 1; paragraphIndex >= 0; paragraphIndex--) {
            const detail = normalizeLiveToolDetail(paragraphs[paragraphIndex]?.replaceAll("**", ""));
            if (detail !== "") return detail;
          }
        }
      }
      return "";
    }
    function liveToolDetail(name, argsRaw) {
      let args;
      try {
        args = JSON.parse(argsRaw);
      } catch (_error) {
        return normalizeLiveToolDetail(name);
      }
      if (args === null || typeof args !== "object") return normalizeLiveToolDetail(name);
      for (const key of LIVE_TOOL_DETAIL_KEYS) if (key in args) {
        const value = Reflect.get(args, key);
        const detail = key === "questions" ? questionDetail(value) : normalizeLiveToolDetail(value);
        if (detail !== "") return detail;
      }
      return normalizeLiveToolDetail(name);
    }
    function processActivity(nodes) {
      const counts = /* @__PURE__ */ new Map();
      const seen = /* @__PURE__ */ new Set();
      let running;
      let runningDetail = "";
      let runningTime = -Infinity;
      let failures = 0, stopped = 0;
      const visit = (tool) => {
        if (seen.has(tool.callId)) return;
        seen.add(tool.callId);
        if (!isRunningTool(tool)) {
          if (activity(tool.call?.name ?? "") === "computer" && tool.isError && /tool call aborted|Computer Use (?:was |is )?stopped/i.test(tool.content.filter((block) => block.type === "text").map((block) => block.text).join("\n")) || [
            "ABORTED",
            "ABORTED_BEFORE_DISPATCH",
            "interrupted",
            "COMPUTER_USE_STOPPED"
          ].includes(tool.error?.code ?? "")) stopped++;
          else if (tool.isError || tool.meta && Reflect.get(tool.meta, "computerUseError")) failures++;
        }
        const call = isRunningTool(tool) ? tool : tool.call;
        if (call !== null) {
          const kind = activity(call.name);
          if (isRunningTool(tool) && tool.time >= runningTime) {
            running = kind;
            runningDetail = liveToolDetail(tool.name, tool.argsRaw);
            runningTime = tool.time;
          }
          counts.set(kind, (counts.get(kind) ?? 0) + 1);
        }
        for (const child of tool.subCalls) visit(child);
      };
      for (const node of nodes) if (node.kind === "tool-call") visit(node.data.root);
      if (running === void 0) runningDetail = liveReasoningDetail(nodes);
      return {
        ...failures > 0 ? { failures } : {},
        ...stopped > 0 ? { stopped } : {},
        counts: [...counts].map(([kind, count]) => ({
          kind,
          count
        })).sort((a, b) => b.count - a.count),
        running,
        runningDetail
      };
    }
    const INDEPENDENT = /* @__PURE__ */ new Set([
      "user",
      "steering",
      "turn-trigger",
      "model-retry",
      "turn-error",
      "turn-max-tokens",
      "turn-tail"
    ]);
    function turnOf(node) {
      const location = node.location;
      return location.kind === "turn" || location.kind === "step" ? location.turn.turn : void 0;
    }
    function reasoning(node) {
      return node.kind === "assistant-step" && node.data.blocks.some((block) => block.kind === "reasoning" && block.text.trim() !== "");
    }
    function reply(node) {
      return node.kind === "assistant-step" && hasAssistantReplyContent(node.data.blocks);
    }
    function sameSummary(left, right) {
      return left.running === right.running && left.runningDetail === right.runningDetail && left.failures === right.failures && left.stopped === right.stopped && left.counts.length === right.counts.length && left.counts.every((value, index) => value.kind === right.counts[index]?.kind && value.count === right.counts[index].count);
    }
    function sameMembers(left, right) {
      return left.length === right.length && left.every((value, index) => value.key === right[index]?.key && value.groupPart === right[index].groupPart);
    }
    function structureChanged(previous, current) {
      if (!isVisibleChatNode(current) && (previous === void 0 || !isVisibleChatNode(previous))) return false;
      return previous === void 0 || previous.kind !== current.kind || turnOf(previous) !== turnOf(current) || isVisibleChatNode(previous) !== isVisibleChatNode(current) || reasoning(previous) !== reasoning(current) || reply(previous) !== reply(current);
    }
    function readNode(input, key) {
      const node = input.readNode(key);
      if (node === void 0) throw new Error(`Chat grouping input is missing Node ${key}`);
      return node;
    }
    var ProcessGroup = class {
      key;
      turn;
      members;
      nodes = [];
      snapshot;
      constructor(key, turn, members) {
        this.key = key;
        this.turn = turn;
        this.members = members;
        this.snapshot = {
          key,
          members,
          data: {
            turn,
            closed: false,
            summary: {
              counts: [],
              running: void 0,
              runningDetail: ""
            }
          }
        };
      }
      refresh(input, closed) {
        const nodes = this.members.map((member) => readNode(input, member.key));
        const unchanged = nodes.length === this.nodes.length && nodes.every((node, index) => node === this.nodes[index]);
        const previous = this.snapshot.data;
        const activity2 = unchanged && previous.closed === closed ? previous.summary : processActivity(nodes);
        const summary = closed ? {
          ...activity2,
          running: void 0,
          runningDetail: ""
        } : activity2;
        this.nodes = nodes;
        if (previous.closed !== closed || !sameSummary(previous.summary, summary)) this.snapshot = {
          key: this.key,
          members: this.members,
          data: {
            turn: this.turn,
            closed,
            summary
          }
        };
      }
    };
    var TurnGroups = class {
      turn;
      groups = /* @__PURE__ */ new Map();
      membership = /* @__PURE__ */ new Map();
      roots = /* @__PURE__ */ new Map();
      constructor(turn) {
        this.turn = turn;
      }
      references(key) {
        return this.roots.get(key) ?? [];
      }
      snapshots() {
        return [...this.groups.values()].map((group) => group.snapshot);
      }
      refresh(input, changed) {
        const dirty = /* @__PURE__ */ new Set();
        for (const node of changed) {
          const group = this.membership.get(node);
          if (group !== void 0) dirty.add(group);
        }
        const ended = input.timeline.turns.get(this.turn)?.status === "closed";
        if (ended) {
          for (const group of this.groups.values()) if (!group.snapshot.data.closed) dirty.add(group.key);
        }
        const upserts = [];
        for (const key of dirty) {
          const group = this.groups.get(key);
          const previous = group.snapshot;
          group.refresh(input, previous.data.closed || ended);
          if (group.snapshot !== previous) upserts.push(group.snapshot);
        }
        return upserts;
      }
      rebuild(input, added) {
        const roots = /* @__PURE__ */ new Map();
        const groups = /* @__PURE__ */ new Map();
        const membership = /* @__PURE__ */ new Map();
        let pending = [];
        const upserts = [];
        const emit = (key, entry) => {
          roots.set(key, [...roots.get(key) ?? [], entry]);
        };
        const flush = (closed) => {
          const first = pending[0];
          if (first === void 0) return;
          const key = this.extendedGroup(pending, added)?.key ?? brandString(JSON.stringify([
            "process",
            first.key,
            first.groupPart ?? null
          ]));
          const previous2 = this.groups.get(key);
          const before = previous2?.snapshot;
          const group = previous2 !== void 0 && sameMembers(previous2.members, pending) ? previous2 : new ProcessGroup(key, this.turn, pending);
          group.refresh(input, closed || input.timeline.turns.get(this.turn)?.status === "closed");
          groups.set(group.key, group);
          emit(first.key, {
            kind: "group",
            key: group.key
          });
          for (const member of pending) membership.set(member.key, group.key);
          if (group.snapshot !== before) upserts.push(group.snapshot);
          pending = [];
        };
        let previous;
        let followed = false;
        for (const key of input.readTurn(this.turn)) {
          const position = readPosition(input, key);
          if (previous !== void 0 && position.previous !== previous) flush(true);
          previous = key;
          followed = position.next !== void 0;
          const node = readNode(input, key);
          if (INDEPENDENT.has(node.kind)) {
            flush(true);
            emit(key, {
              kind: "node",
              key
            });
          } else if (node.kind === "turn-process") emit(key, {
            kind: "node",
            key
          });
          else if (node.kind === "assistant-step") {
            if (reasoning(node)) pending.push({
              kind: "node",
              key,
              groupPart: "reasoning"
            });
            if (reply(node)) {
              flush(true);
              emit(key, {
                kind: "node",
                key,
                groupPart: "response"
              });
            }
          } else pending.push({
            kind: "node",
            key
          });
        }
        flush(followed);
        const removes = [...this.groups.keys()].filter((key) => !groups.has(key));
        this.groups = groups;
        this.membership = membership;
        this.roots = roots;
        return {
          upserts,
          removes
        };
      }
      extendedGroup(members, added) {
        const offset = members.findIndex((member) => !added.has(member.key));
        const first = members[offset];
        if (first === void 0) return void 0;
        const key = this.membership.get(first.key);
        const previous = key === void 0 ? void 0 : this.groups.get(key);
        if (previous === void 0 || offset + previous.members.length > members.length) return void 0;
        for (let index = 0; index < previous.members.length; index++) {
          const before = previous.members[index];
          const after = members[offset + index];
          if (before.key !== after.key || before.groupPart !== after.groupPart) return void 0;
        }
        for (let index = offset + previous.members.length; index < members.length; index++) if (!added.has(members[index].key)) return void 0;
        return previous;
      }
    };
    function readPosition(input, key) {
      const position = input.readPosition(key);
      if (position === void 0) throw new Error(`Chat grouping order is missing position for Node ${key}`);
      return position;
    }
    var ProcessState = class {
      turns = /* @__PURE__ */ new Map();
      order = [];
      pending = null;
      /**
      * Consume one synchronous Builder input without retaining its readers.
      * @param input - projected Node changes, indexed positions, and Turn lifecycle.
      */
      accept(input) {
        if (input.kind === "replace") {
          const previousKeys = new Set(this.order);
          const added2 = new Set(input.order.filter((key) => !previousKeys.has(key)));
          const turns = /* @__PURE__ */ new Map();
          for (const key of input.order) {
            const turn = readPosition(input, key).turn;
            if (turn === void 0 || turns.has(turn)) continue;
            const groups = this.turns.get(turn) ?? new TurnGroups(turn);
            groups.rebuild(input, added2);
            turns.set(turn, groups);
          }
          this.turns = turns;
          this.order = input.order;
          this.pending = {
            entries: this.rootEntries(input),
            groups: {
              kind: "replace",
              snapshots: [...turns.values()].flatMap((turn) => turn.snapshots())
            }
          };
          return;
        }
        const regroup = new Set(input.changedTurnOrders);
        const added = /* @__PURE__ */ new Set();
        const changed = /* @__PURE__ */ new Map();
        const touch = (turn) => {
          let keys = changed.get(turn);
          if (keys === void 0) {
            keys = /* @__PURE__ */ new Set();
            changed.set(turn, keys);
          }
          return keys;
        };
        for (const change of input.changes) {
          const before = change.previous;
          const after = change.current;
          const turn = turnOf(after);
          if (before === void 0 || !isVisibleChatNode(before)) added.add(after.key);
          if (structureChanged(before, after)) {
            const previousTurn = before === void 0 ? void 0 : turnOf(before);
            if (previousTurn !== void 0) regroup.add(previousTurn);
            if (turn !== void 0) regroup.add(turn);
          }
          if (turn !== void 0) touch(turn).add(after.key);
        }
        for (const turn of input.changedTurns) touch(turn);
        const upserts = [];
        const removes = [];
        for (const turn of regroup) {
          const groups = this.turns.get(turn) ?? new TurnGroups(turn);
          const update = groups.rebuild(input, added);
          upserts.push(...update.upserts);
          removes.push(...update.removes);
          if (input.readTurn(turn).length === 0) this.turns.delete(turn);
          else this.turns.set(turn, groups);
        }
        for (const [turn, keys] of changed) if (!regroup.has(turn)) upserts.push(...this.turns.get(turn)?.refresh(input, keys) ?? []);
        const reordered = input.order !== this.order || regroup.size > 0;
        this.order = input.order;
        const installed = new Set(upserts.map((group) => group.key));
        this.pending = reordered || upserts.length > 0 || removes.length > 0 ? {
          ...reordered ? { entries: this.rootEntries(input) } : {},
          groups: {
            kind: "apply",
            upserts,
            removes: removes.filter((key) => !installed.has(key))
          }
        } : null;
      }
      rootEntries(input) {
        return input.order.flatMap((key) => {
          const turn = readPosition(input, key).turn;
          if (turn === void 0) return [{
            kind: "node",
            key
          }];
          const groups = this.turns.get(turn);
          if (groups === void 0) throw new Error(`Chat grouping order is missing Turn ${turn}`);
          return groups.references(key);
        });
      }
      /**
      * Read pending output without advancing State.
      * @returns the repeatable update for the last input batch.
      */
      output() {
        return this.pending;
      }
    };
    const processGroupDefinition = {
      kind: "process-groups",
      target: "chat",
      create: () => new ProcessState(),
      update: (context, input) => {
        context.state.accept(input);
        return context.state;
      },
      buildGroups: (context) => context.state.output()
    };
    function registerConversationNodes(ctx) {
      registerInboxConversationNodes(ctx);
      registerMessageConversationNode(ctx);
      registerRequestPromptConversationNode(ctx);
      registerAssistantConversationNode(ctx);
      registerTurnProcess(ctx);
      registerToolConversationNode(ctx);
      registerCommandConversationNode(ctx);
      registerCompactionConversationNode(ctx);
      registerRetryConversationNode(ctx);
      registerTurnErrorConversationNode(ctx);
      registerTurnMaxTokensConversationNode(ctx);
      registerTurnTailConversationNode(ctx);
      registerUnknownConversationFallback(ctx);
      registerChatConversationView(ctx);
      ctx.uiConversation.groups.register(processGroupDefinition);
    }
    function isNullable(value) {
      return value === null || value === void 0;
    }
    function isPlainObject(data) {
      return data && typeof data === "object" && !Array.isArray(data);
    }
    function filterKeys(object, filter) {
      return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
    }
    function mapValues(object, transform) {
      return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
    }
    function pick(source, keys, forced) {
      if (!keys) return { ...source };
      const result = {};
      for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
      return result;
    }
    const write = Symbol.for("cosmokit.volatile.write");
    function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
      if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
      if (value === null || typeof value !== "object") return value;
      if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
      ancestors.add(value);
      try {
        if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
        return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
      } finally {
        ancestors.delete(value);
      }
    }
    function createVolatile(value) {
      let current = snapshot(value);
      return Object.freeze({
        get: () => current,
        [write]: (value2) => {
          current = value2;
        }
      });
    }
    function isVolatile(value) {
      return typeof value === "object" && value !== null && write in value;
    }
    function is(type, value) {
      if (arguments.length === 1) return (value2) => is(type, value2);
      return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
    }
    function isArrayBufferLike(value) {
      return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
    }
    function isArrayBufferSource(value) {
      return isArrayBufferLike(value) || ArrayBuffer.isView(value);
    }
    var Binary;
    (function(Binary2) {
      Binary2.is = isArrayBufferLike;
      Binary2.isSource = isArrayBufferSource;
      function fromSource(source) {
        if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
        else return source;
      }
      Binary2.fromSource = fromSource;
      function toBase64(source) {
        source = fromSource(source);
        if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
        let binary = "";
        const bytes2 = new Uint8Array(source);
        for (let i = 0; i < bytes2.byteLength; i++) binary += String.fromCharCode(bytes2[i]);
        return btoa(binary);
      }
      Binary2.toBase64 = toBase64;
      function fromBase64(source) {
        if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
        return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
      }
      Binary2.fromBase64 = fromBase64;
      function toHex(source) {
        source = fromSource(source);
        if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
        return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      Binary2.toHex = toHex;
      function fromHex(source) {
        if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
        const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
        const buffer = [];
        for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
        return Uint8Array.from(buffer).buffer;
      }
      Binary2.fromHex = fromHex;
    })(Binary || (Binary = {}));
    Binary.fromBase64;
    Binary.toBase64;
    Binary.fromHex;
    Binary.toHex;
    function clone(source, refs = /* @__PURE__ */ new Map()) {
      if (!source || typeof source !== "object") return source;
      if (is("Date", source)) return new Date(source.valueOf());
      if (is("RegExp", source)) return new RegExp(source.source, source.flags);
      if (isArrayBufferLike(source)) return source.slice(0);
      if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
      const cached = refs.get(source);
      if (cached) return cached;
      if (Array.isArray(source)) {
        const result2 = [];
        refs.set(source, result2);
        source.forEach((value, index) => {
          result2[index] = Reflect.apply(clone, null, [value, refs]);
        });
        return result2;
      }
      const result = Object.create(Object.getPrototypeOf(source));
      refs.set(source, result);
      for (const key of Reflect.ownKeys(source)) {
        const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
        if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
        Reflect.defineProperty(result, key, descriptor);
      }
      return result;
    }
    function deepEqual(a, b, strict) {
      const ancestors = /* @__PURE__ */ new Set();
      function compare(a2, b2) {
        if (a2 === b2) return true;
        if (isVolatile(a2) || isVolatile(b2)) return isVolatile(a2) && isVolatile(b2);
        if (!strict && isNullable(a2) && isNullable(b2)) return true;
        if (typeof a2 !== typeof b2 || typeof a2 !== "object" || !a2 || !b2) return false;
        if (ancestors.has(a2)) return false;
        function check(test, then) {
          return test(a2) ? test(b2) ? then(a2, b2) : false : test(b2) ? false : void 0;
        }
        ancestors.add(a2);
        try {
          return check(Array.isArray, (a3, b3) => {
            if (a3.length !== b3.length) return false;
            for (let index = 0; index < a3.length; index++) if (!compare(a3[index], b3[index])) return false;
            return true;
          }) ?? check(is("Date"), (a3, b3) => a3.valueOf() === b3.valueOf()) ?? check(is("URL"), (a3, b3) => a3.href === b3.href) ?? check(is("RegExp"), (a3, b3) => a3.source === b3.source && a3.flags === b3.flags) ?? check(isArrayBufferLike, (a3, b3) => {
            if (a3.byteLength !== b3.byteLength) return false;
            const viewA = new Uint8Array(a3);
            const viewB = new Uint8Array(b3);
            for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
            return true;
          }) ?? ((!strict || [a2, b2].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
            ...a2,
            ...b2
          }).every((key) => compare(a2[key], b2[key])));
        } finally {
          ancestors.delete(a2);
        }
      }
      return compare(a, b);
    }
    var Time;
    (function(Time2) {
      Time2.millisecond = 1;
      Time2.second = 1e3;
      Time2.minute = Time2.second * 60;
      Time2.hour = Time2.minute * 60;
      Time2.day = Time2.hour * 24;
      Time2.week = Time2.day * 7;
      let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
      function setTimezoneOffset(offset) {
        timezoneOffset = offset;
      }
      Time2.setTimezoneOffset = setTimezoneOffset;
      function getTimezoneOffset() {
        return timezoneOffset;
      }
      Time2.getTimezoneOffset = getTimezoneOffset;
      function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
        if (typeof date === "number") date = new Date(date);
        if (offset === void 0) offset = timezoneOffset;
        return Math.floor((date.valueOf() / Time2.minute - offset) / 1440);
      }
      Time2.getDateNumber = getDateNumber;
      function fromDateNumber(value, offset) {
        const date = new Date(value * Time2.day);
        if (offset === void 0) offset = timezoneOffset;
        return new Date(+date + offset * Time2.minute);
      }
      Time2.fromDateNumber = fromDateNumber;
      const numeric = /\d+(?:\.\d+)?/.source;
      const timeRegExp = new RegExp(`^${[
        "w(?:eek(?:s)?)?",
        "d(?:ay(?:s)?)?",
        "h(?:our(?:s)?)?",
        "m(?:in(?:ute)?(?:s)?)?",
        "s(?:ec(?:ond)?(?:s)?)?"
      ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
      function parseTime(source) {
        const capture = timeRegExp.exec(source);
        if (!capture) return 0;
        return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
      }
      Time2.parseTime = parseTime;
      function parseDate(date) {
        const parsed = parseTime(date);
        if (parsed) date = Date.now() + parsed;
        else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
        else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
        return date ? new Date(date) : /* @__PURE__ */ new Date();
      }
      Time2.parseDate = parseDate;
      function format(ms) {
        const abs = Math.abs(ms);
        if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
        else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
        else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
        else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
        return ms + "ms";
      }
      Time2.format = format;
      function toDigits(source, length = 2) {
        return source.toString().padStart(length, "0");
      }
      Time2.toDigits = toDigits;
      function template(template2, time = /* @__PURE__ */ new Date()) {
        return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
      }
      Time2.template = template;
    })(Time || (Time = {}));
    const kSchema = Symbol.for("schemastery");
    const kValidationError = Symbol.for("ValidationError");
    globalThis.__schemastery_index__ ??= 0;
    globalThis.__schemastery_refs__ = void 0;
    var ValidationError = class extends TypeError {
      constructor(message, options) {
        let prefix = "$";
        for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
        else if (typeof segment === "number") prefix += "[" + segment + "]";
        else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
        if (prefix.startsWith(".")) prefix = prefix.slice(1);
        super((prefix === "$" ? "" : `${prefix} `) + message);
        this.options = options;
        this.name = "ValidationError";
      }
      static is(error) {
        return !!error?.[kValidationError];
      }
    };
    Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
    const Schema = function(options) {
      const schema = function(data, options2 = {}) {
        return Schema.resolve(data, schema, options2)[0];
      };
      if (options.refs) {
        const refs = mapValues(options.refs, (options2) => new Schema(options2));
        const getRef = (uid) => refs[uid];
        for (const key in refs) {
          const options2 = refs[key];
          options2.sKey = getRef(options2.sKey);
          options2.inner = getRef(options2.inner);
          options2.list = options2.list && options2.list.map(getRef);
          options2.dict = options2.dict && mapValues(options2.dict, getRef);
        }
        return refs[options.uid];
      }
      Object.assign(schema, options);
      if (typeof schema.callback === "string") try {
        schema.callback = new Function("return " + schema.callback)();
      } catch {
      }
      Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
      Object.setPrototypeOf(schema, Schema.prototype);
      schema.meta ||= {};
      schema.toString = schema.toString.bind(schema);
      return schema;
    };
    Schema.prototype = Object.create(Function.prototype);
    Schema.prototype[kSchema] = true;
    Object.defineProperty(Schema.prototype, "~standard", { get() {
      return {
        version: 1,
        vendor: "schemastery",
        validate: (value) => {
          try {
            return { value: Schema.resolve(value, this, {})[0] };
          } catch (error) {
            if (ValidationError.is(error)) return { issues: [{
              message: error.message,
              path: error.options.path
            }] };
            throw error;
          }
        }
      };
    } });
    Schema.ValidationError = ValidationError;
    Schema.prototype.toJSON = function toJSON() {
      if (globalThis.__schemastery_refs__) {
        globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
        return this.uid;
      }
      globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
      globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
      const result = {
        uid: this.uid,
        refs: globalThis.__schemastery_refs__
      };
      globalThis.__schemastery_refs__ = void 0;
      return result;
    };
    Schema.prototype.set = function set(key, value) {
      this.dict[key] = value;
      return this;
    };
    Schema.prototype.push = function push(value) {
      this.list.push(value);
      return this;
    };
    function mergeDesc(original, messages) {
      const result = typeof original === "string" ? { "": original } : { ...original };
      for (const locale in messages) {
        const value = messages[locale];
        if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
        else if (typeof value === "string") result[locale] = value;
      }
      return result;
    }
    function getInner(value) {
      return value?.$value ?? value?.$inner;
    }
    function extractKeys(data) {
      return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
    }
    Schema.prototype.i18n = function i18n(messages) {
      const schema = Schema(this);
      const desc = mergeDesc(schema.meta.description, messages);
      if (Object.keys(desc).length) schema.meta.description = desc;
      if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
        return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
      });
      if (schema.list) schema.list = schema.list.map((inner, index) => {
        return inner.i18n(mapValues(messages, (data = {}) => {
          if (Array.isArray(getInner(data))) return getInner(data)[index];
          if (Array.isArray(data)) return data[index];
          return extractKeys(data);
        }));
      });
      if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
        if (getInner(data)) return getInner(data);
        return extractKeys(data);
      }));
      if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
      return schema;
    };
    Schema.prototype.extra = function extra(key, value) {
      const schema = Schema(this);
      schema.meta = {
        ...schema.meta,
        [key]: value
      };
      return schema;
    };
    for (const key of [
      "required",
      "disabled",
      "collapse",
      "hidden",
      "loose"
    ]) Object.assign(Schema.prototype, { [key](value = true) {
      const schema = Schema(this);
      schema.meta = {
        ...schema.meta,
        [key]: value
      };
      return schema;
    } });
    Schema.prototype.deprecated = function deprecated() {
      const schema = Schema(this);
      schema.meta.badges ||= [];
      schema.meta.badges.push({
        text: "deprecated",
        type: "danger"
      });
      return schema;
    };
    Schema.prototype.experimental = function experimental() {
      const schema = Schema(this);
      schema.meta.badges ||= [];
      schema.meta.badges.push({
        text: "experimental",
        type: "warning"
      });
      return schema;
    };
    Schema.prototype.pattern = function pattern(regexp) {
      const schema = Schema(this);
      const pattern2 = pick(regexp, ["source", "flags"]);
      schema.meta = {
        ...schema.meta,
        pattern: pattern2
      };
      return schema;
    };
    Schema.prototype.simplify = function simplify(value) {
      if (isVolatile(value)) value = value.get();
      if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
      if (isNullable(value)) return value;
      if (this.type === "object" || this.type === "dict") {
        const result = {};
        for (const key in value) {
          const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
          if (this.type === "dict" || !isNullable(item)) result[key] = item;
        }
        if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
        return result;
      } else if (this.type === "array" || this.type === "tuple") {
        const result = [];
        value.forEach((value2, index) => {
          const schema = this.type === "array" ? this.inner : this.list[index];
          const item = schema ? schema.simplify(value2) : value2;
          result.push(item);
        });
        return result;
      } else if (this.type === "intersect") {
        const result = {};
        for (const item of this.list) Object.assign(result, item.simplify(value));
        return result;
      } else if (this.type === "union") for (const schema of this.list) try {
        Schema.resolve(value, schema, {});
        return schema.simplify(value);
      } catch {
      }
      return value;
    };
    Schema.prototype.toString = function toString(inline) {
      return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
    };
    Schema.prototype.role = function role(role, extra) {
      const schema = Schema(this);
      schema.meta = {
        ...schema.meta,
        role,
        extra
      };
      return schema;
    };
    for (const key of [
      "default",
      "link",
      "comment",
      "description",
      "max",
      "min",
      "step"
    ]) Object.assign(Schema.prototype, { [key](value) {
      const schema = Schema(this);
      schema.meta = {
        ...schema.meta,
        [key]: value
      };
      return schema;
    } });
    Schema.prototype.volatile = function volatile() {
      if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
      return this.extra("volatile", true);
    };
    const resolvers = {};
    const checkedVolatile = Symbol("checked-volatile-schema");
    function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
      const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
      if (states.has(blocked)) return;
      states.add(blocked);
      seen.set(schema, states);
      if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
      const nested = blocked || !!schema.meta?.volatile;
      if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
      if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
      if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
      if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
    }
    Schema.extend = function extend(type, resolve) {
      resolvers[type] = resolve;
    };
    Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
      if (!schema) return [data];
      if (!options[checkedVolatile]) {
        validateVolatileSchema(schema, options.path);
        options = {
          ...options,
          [checkedVolatile]: true
        };
      }
      if (schema.meta?.volatile) {
        const inner = Schema(schema);
        inner.meta = {
          ...schema.meta,
          volatile: false
        };
        const [value, adapted] = Schema.resolve(data, inner, options, strict);
        try {
          return [createVolatile(value), adapted];
        } catch (error) {
          throw new ValidationError(error instanceof Error ? error.message : String(error), options);
        }
      }
      if (options.ignore?.(data, schema)) return [data];
      if (isNullable(data) && schema.type !== "lazy") {
        if (schema.meta.required) throw new ValidationError(`missing required value`, options);
        let current = schema;
        let fallback = schema.meta.default;
        while (current?.type === "intersect" && isNullable(fallback)) {
          current = current.list[0];
          fallback = current?.meta.default;
        }
        if (isNullable(fallback)) return [data];
        data = clone(fallback);
      }
      const callback = resolvers[schema.type];
      if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
      try {
        return callback(data, schema, options, strict);
      } catch (error) {
        if (!schema.meta.loose) throw error;
        return [schema.meta.default];
      }
    };
    Schema.from = function from(source) {
      if (isNullable(source)) return Schema.any();
      else if ([
        "string",
        "number",
        "boolean"
      ].includes(typeof source)) return Schema.const(source).required();
      else if (source[kSchema]) return source;
      else if (typeof source === "function") switch (source) {
        case String:
          return Schema.string().required();
        case Number:
          return Schema.number().required();
        case Boolean:
          return Schema.boolean().required();
        case Function:
          return Schema.function().required();
        default:
          return Schema.is(source).required();
      }
      else throw new TypeError(`cannot infer schema from ${source}`);
    };
    Schema.lazy = function lazy(builder) {
      const toJSON = () => {
        if (!schema.inner[kSchema]) {
          schema.inner = schema.builder();
          schema.inner.meta = {
            ...schema.meta,
            ...schema.inner.meta
          };
        }
        return schema.inner.toJSON();
      };
      const schema = new Schema({
        type: "lazy",
        builder,
        inner: { toJSON }
      });
      return schema;
    };
    Schema.natural = function natural() {
      return Schema.number().step(1).min(0);
    };
    Schema.percent = function percent() {
      return Schema.number().step(0.01).min(0).max(1).role("slider");
    };
    Schema.date = function date() {
      return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
        const date2 = new Date(value);
        if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
        return date2;
      }, true)]);
    };
    Schema.regExp = function regExp(flag = "") {
      return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
        try {
          return new RegExp(value, flag);
        } catch (e) {
          throw new ValidationError(e.message, options);
        }
      }, true)]);
    };
    Schema.arrayBuffer = function arrayBuffer(encoding) {
      return Schema.union([
        Schema.is(ArrayBuffer),
        Schema.is(SharedArrayBuffer),
        Schema.transform(Schema.any(), (value, options) => {
          if (Binary.isSource(value)) return Binary.fromSource(value);
          throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
        }, true),
        ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
          try {
            return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
          } catch (e) {
            throw new ValidationError(e.message, options);
          }
        }, true)] : []
      ]);
    };
    Schema.extend("lazy", (data, schema, options, strict) => {
      if (!schema.inner[kSchema]) {
        schema.inner = schema.builder();
        schema.inner.meta = {
          ...schema.meta,
          ...schema.inner.meta
        };
        validateVolatileSchema(schema.inner, options.path, true);
      }
      return Schema.resolve(data, schema.inner, options, strict);
    });
    Schema.extend("any", (data) => {
      return [data];
    });
    Schema.extend("never", (data, _, options) => {
      throw new ValidationError(`expected nullable but got ${data}`, options);
    });
    Schema.extend("const", (data, { value }, options) => {
      if (deepEqual(data, value)) return [value];
      throw new ValidationError(`expected ${value} but got ${data}`, options);
    });
    function checkWithinRange(data, meta, description, options, skipMin = false) {
      const { max = Infinity, min = -Infinity } = meta;
      if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
      if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
    }
    Schema.extend("string", (data, { meta }, options) => {
      if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
      if (meta.pattern) {
        const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
        if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
      }
      checkWithinRange(data.length, meta, "string length", options);
      return [data];
    });
    function decimalShift(data, digits) {
      const str = data.toString();
      if (str.includes("e")) return data * Math.pow(10, digits);
      const index = str.indexOf(".");
      if (index === -1) return data * Math.pow(10, digits);
      const frac = str.slice(index + 1);
      const integer = str.slice(0, index);
      if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
      return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
    }
    function isMultipleOf(data, min, step) {
      step = Math.abs(step);
      if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
      const index = step.toString().indexOf(".");
      const digits = step.toString().slice(index + 1).length;
      return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
    }
    Schema.extend("number", (data, { meta }, options) => {
      if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
      checkWithinRange(data, meta, "number", options);
      const { step } = meta;
      if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
      return [data];
    });
    Schema.extend("boolean", (data, _, options) => {
      if (typeof data === "boolean") return [data];
      throw new ValidationError(`expected boolean but got ${data}`, options);
    });
    Schema.extend("bitset", (data, { bits, meta }, options) => {
      let value = 0, keys = [];
      if (typeof data === "number") {
        value = data;
        for (const key in bits) if (data & bits[key]) keys.push(key);
      } else if (Array.isArray(data)) {
        keys = data;
        for (const key of keys) {
          if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
          if (key in bits) value |= bits[key];
        }
      } else throw new ValidationError(`expected number or array but got ${data}`, options);
      if (value === meta.default) return [value];
      return [value, keys];
    });
    Schema.extend("function", (data, _, options) => {
      if (typeof data === "function") return [data];
      throw new ValidationError(`expected function but got ${data}`, options);
    });
    Schema.extend("is", (data, { constructor }, options) => {
      if (typeof constructor === "function") {
        if (data instanceof constructor) return [data];
        throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
      } else {
        if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
        let prototype = Object.getPrototypeOf(data);
        while (prototype) {
          if (prototype.constructor?.name === constructor) return [data];
          prototype = Object.getPrototypeOf(prototype);
        }
        throw new ValidationError(`expected ${constructor} but got ${data}`, options);
      }
    });
    function property(data, key, schema, options) {
      try {
        const [value, adapted] = Schema.resolve(data[key], schema, {
          ...options,
          path: [...options.path || [], key]
        });
        if (adapted !== void 0) data[key] = adapted;
        return value;
      } catch (e) {
        if (!options?.autofix) throw e;
        delete data[key];
        return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
      }
    }
    Schema.extend("array", (data, { inner, meta }, options) => {
      if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
      checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
      return [data.map((_, index) => property(data, index, inner, options))];
    });
    Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
      if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
      const result = {};
      for (const key in data) {
        let rKey;
        try {
          rKey = Schema.resolve(key, sKey, options)[0];
        } catch (error) {
          if (strict) continue;
          throw error;
        }
        result[rKey] = property(data, key, inner, options);
        data[rKey] = data[key];
        if (key !== rKey) delete data[key];
      }
      return [result];
    });
    Schema.extend("tuple", (data, { list }, options, strict) => {
      if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
      const result = list.map((inner, index) => property(data, index, inner, options));
      if (strict) return [result];
      result.push(...data.slice(list.length));
      return [result];
    });
    function merge(result, data) {
      for (const key in data) {
        if (key in result) continue;
        result[key] = data[key];
      }
    }
    Schema.extend("object", (data, { dict }, options, strict) => {
      if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
      const result = {};
      for (const key in dict) {
        const value = property(data, key, dict[key], options);
        if (!isNullable(value) || key in data) result[key] = value;
      }
      if (!strict) merge(result, data);
      return [result];
    });
    Schema.extend("union", (data, { list, toString }, options, strict) => {
      const messages = [];
      for (const inner of list) try {
        return Schema.resolve(data, inner, options, strict);
      } catch (error) {
        messages.push(error);
      }
      throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
    });
    Schema.extend("intersect", (data, { list, toString }, options, strict) => {
      if (!list.length) return [data];
      let result;
      for (const inner of list) {
        const value = Schema.resolve(data, inner, options, true)[0];
        if (isNullable(value)) continue;
        if (isNullable(result)) result = value;
        else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
        else if (typeof value === "object") merge(result ??= {}, value);
        else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
      }
      if (!strict && isPlainObject(data)) merge(result, data);
      return [result];
    });
    Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
      const [result, adapted = data] = Schema.resolve(data, inner, options, true);
      if (preserve) return [callback(result)];
      else return [callback(result), callback(adapted)];
    });
    const formatters = {};
    function defineMethod(name, keys, format) {
      formatters[name] = format;
      Object.assign(Schema, { [name](...args) {
        const schema = new Schema({ type: name });
        keys.forEach((key, index) => {
          switch (key) {
            case "sKey":
              schema.sKey = args[index] ?? Schema.string();
              break;
            case "inner":
              schema.inner = Schema.from(args[index]);
              break;
            case "list":
              schema.list = args[index].map(Schema.from);
              break;
            case "dict":
              schema.dict = mapValues(args[index], Schema.from);
              break;
            case "bits":
              schema.bits = {};
              for (const key2 in args[index]) {
                if (typeof args[index][key2] !== "number") continue;
                schema.bits[key2] = args[index][key2];
              }
              break;
            case "callback": {
              const callback = schema.callback = args[index];
              callback["toJSON"] ||= () => callback.toString();
              break;
            }
            case "constructor": {
              const constructor = schema.constructor = args[index];
              if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
              break;
            }
            default:
              schema[key] = args[index];
          }
        });
        if (name === "object" || name === "dict") schema.meta.default = {};
        else if (name === "array" || name === "tuple") schema.meta.default = [];
        else if (name === "bitset") schema.meta.default = 0;
        return schema;
      } });
    }
    defineMethod("is", ["constructor"], ({ constructor }) => {
      if (typeof constructor === "function") return constructor.name;
      else return constructor;
    });
    defineMethod("any", [], () => "any");
    defineMethod("never", [], () => "never");
    defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
    defineMethod("string", [], () => "string");
    defineMethod("number", [], () => "number");
    defineMethod("boolean", [], () => "boolean");
    defineMethod("bitset", ["bits"], () => "bitset");
    defineMethod("function", [], () => "function");
    defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
    defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
    defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
    defineMethod("object", ["dict"], ({ dict }) => {
      if (Object.keys(dict).length === 0) return "{}";
      return `{ ${Object.entries(dict).map(([key, inner]) => {
        return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
      }).join(", ")} }`;
    });
    defineMethod("union", ["list"], ({ list }, inline) => {
      const result = list.map(({ toString: format }) => format()).join(" | ");
      return inline ? `(${result})` : result;
    });
    defineMethod("intersect", ["list"], ({ list }) => {
      return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
    });
    defineMethod("transform", [
      "inner",
      "callback",
      "preserve"
    ], ({ inner }, isInner) => inner.toString(isInner));
    const TRANSCRIPT_VIEW_FIELD = "transcriptView";
    const TRANSCRIPT_VIEW_MODES = [
      "compact",
      "detailed",
      "expanded"
    ];
    const LEGACY_TRANSCRIPT_VIEW_MODE = "normal";
    const TRANSCRIPT_VIEW_SETTING_VALUES = [...TRANSCRIPT_VIEW_MODES, LEGACY_TRANSCRIPT_VIEW_MODE];
    const DEFAULT_TRANSCRIPT_VIEW_MODE = "compact";
    const PERFORMANCE_USAGE_MODES = ["compact", "detailed"];
    const DEFAULT_PERFORMANCE_USAGE = "detailed";
    const ChatSettingsFields = {
      linkOpening: Schema.union(["sidebar", "new-tab"]).default("sidebar"),
      performanceUsage: Schema.union([...PERFORMANCE_USAGE_MODES]).default(DEFAULT_PERFORMANCE_USAGE),
      [TRANSCRIPT_VIEW_FIELD]: Schema.union([...TRANSCRIPT_VIEW_SETTING_VALUES]).default(DEFAULT_TRANSCRIPT_VIEW_MODE)
    };
    Schema.object(ChatSettingsFields);
    const css = "._2XZxNq_row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}._2XZxNq_rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}._2XZxNq_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}._2XZxNq_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}._2XZxNq_selector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}._2XZxNq_selector:hover{background:var(--dsw-alias-interactive-bg-hover)}._2XZxNq_chevron{flex:none}";
    const tagId = "@deepseek-ai/dsh-client-ui-chat/PreferenceRow.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-chat";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    var PreferenceRow_module_css_default = {
      "chevron": "_2XZxNq_chevron",
      "desc": "_2XZxNq_desc",
      "row": "_2XZxNq_row",
      "rowText": "_2XZxNq_rowText",
      "selector": "_2XZxNq_selector",
      "title": "_2XZxNq_title"
    };
    function PreferenceRow({ title, description, value, selectedLabel, options, onSelect }) {
      const [open, setOpen] = (0, react.useState)(false);
      const selectorRef = (0, react.useRef)(null);
      const closeMenu = () => {
        setOpen(false);
      };
      const selectMode = (id) => {
        selectorRef.current?.focus({ preventScroll: true });
        closeMenu();
        onSelect(id);
      };
      const selector = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
        ref: selectorRef,
        type: "button",
        className: PreferenceRow_module_css_default.selector,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        onClick: () => {
          setOpen((value2) => !value2);
        },
        children: [selectedLabel, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: PreferenceRow_module_css_default.chevron })]
      });
      return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
        className: PreferenceRow_module_css_default.row,
        children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
          className: PreferenceRow_module_css_default.rowText,
          children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
            className: PreferenceRow_module_css_default.title,
            children: title
          }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
            className: PreferenceRow_module_css_default.desc,
            children: description
          })]
        }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
          open,
          onClose: closeMenu,
          items: options,
          selectedId: value,
          onSelect: selectMode,
          align: "end",
          portal: true,
          anchor: selector
        })]
      });
    }
    const LABELS = {
      compact: "settings.transcript.compact",
      detailed: "settings.transcript.detailed",
      expanded: "settings.transcript.expanded"
    };
    function TranscriptViewRow({ useTranscriptView, setTranscriptView, t }) {
      const mode = useTranscriptView((value) => value);
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreferenceRow, {
        title: t("settings.transcript.title"),
        description: t("settings.transcript.description"),
        value: mode,
        selectedLabel: t(LABELS[mode]),
        options: TRANSCRIPT_VIEW_MODES.map((id) => ({
          id,
          label: t(LABELS[id])
        })),
        onSelect: (value) => {
          setTranscriptView(value);
        }
      });
    }
    var TranscriptViewPolicy = class {
      host;
      unsubscribe;
      /** Reactive current mode; defaults to Compact before Host settings arrive. */
      mode = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(DEFAULT_TRANSCRIPT_VIEW_MODE);
      /**
      * @param host - durable Chat settings scope.
      */
      constructor(host) {
        this.host = host;
        this.unsubscribe = host.subscribe(() => {
          this.adopt();
        });
        this.adopt();
      }
      /** Release the accepted-value subscription. */
      dispose() {
        this.unsubscribe();
      }
      /**
      * Publish and persist one explicit user choice.
      * @param mode - Compact, Detailed, or Expanded work details.
      */
      setMode(mode) {
        if (this.mode.getSnapshot() === mode) return;
        this.mode.set(mode);
        this.host.set(TRANSCRIPT_VIEW_FIELD, mode);
      }
      /** Adopt the latest accepted Host section without writing it back. */
      adopt() {
        const section = this.host.getSnapshot().value;
        if (section === void 0) return;
        const mode = section.transcriptView === "normal" ? "detailed" : section.transcriptView;
        if (this.mode.getSnapshot() !== mode) this.mode.set(mode);
      }
    };
    const POLICIES = {
      compact: {
        mode: "compact",
        foldCompletedTurns: true,
        stepGrouping: "collapsed",
        liveProcessDetail: false,
        settledReasoningPreview: false
      },
      detailed: {
        mode: "detailed",
        foldCompletedTurns: true,
        stepGrouping: "collapsed",
        liveProcessDetail: true,
        settledReasoningPreview: true
      },
      expanded: {
        mode: "expanded",
        foldCompletedTurns: true,
        stepGrouping: "none",
        liveProcessDetail: true,
        settledReasoningPreview: true
      }
    };
    function derivePresentationPolicy(mode) {
      return {
        getSnapshot: () => POLICIES[mode.getSnapshot()],
        subscribe: (listener) => mode.subscribe(listener)
      };
    }
    function LinkOpeningRow({ useLinkOpening, useBrowserAvailable, setLinkOpening, t }) {
      const destination = useLinkOpening((value) => value);
      if (!useBrowserAvailable((value) => value)) return null;
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreferenceRow, {
        title: t("settings.links.title"),
        description: t("settings.links.description"),
        value: destination,
        selectedLabel: t(destination === "sidebar" ? "settings.links.sidebar" : "settings.links.newTab"),
        options: [{
          id: "sidebar",
          label: t("settings.links.sidebar")
        }, {
          id: "new-tab",
          label: t("settings.links.newTab")
        }],
        onSelect: (value) => {
          setLinkOpening(value);
        }
      });
    }
    const OPTIONS = [{
      id: "compact",
      label: "settings.performance.compact"
    }, {
      id: "detailed",
      label: "settings.performance.detailed"
    }];
    function PerformanceUsageRow({ usePerformanceUsage, setPerformanceUsage, t }) {
      const mode = usePerformanceUsage((value) => value);
      const selectedLabel = mode === "detailed" ? "settings.performance.detailed" : "settings.performance.compact";
      return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreferenceRow, {
        title: t("settings.performance.title"),
        description: t("settings.performance.description"),
        value: mode,
        selectedLabel: t(selectedLabel),
        options: OPTIONS.map((option) => ({
          id: option.id,
          label: t(option.label)
        })),
        onSelect: (value) => {
          setPerformanceUsage(value);
        }
      });
    }
    var PerformanceUsagePolicy = class {
      host;
      unsubscribe;
      /** Current choice, reconciled with accepted Host settings when available. */
      mode = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(DEFAULT_PERFORMANCE_USAGE);
      /** @param host - Chat settings scope, durable on loopback and memory-only elsewhere. */
      constructor(host) {
        this.host = host;
        const adopt = () => {
          const accepted = host.getSnapshot().value?.performanceUsage;
          if (accepted !== void 0) this.mode.set(accepted);
        };
        this.unsubscribe = host.subscribe(adopt);
        adopt();
      }
      /** Release the accepted-value subscription. */
      dispose() {
        this.unsubscribe();
      }
      /**
      * Publish a choice immediately and persist it when the scope supports writes.
      * @param mode - Statistics detail selected by the user.
      */
      setMode(mode) {
        if (mode === this.mode.getSnapshot()) return;
        this.mode.set(mode);
        this.host.set("performanceUsage", mode);
      }
    };
    const EMPTY_SOURCE = {
      getSnapshot: () => void 0,
      subscribe: () => () => {
      }
    };
    function useTurnDataValue(data, key) {
      const source = data?.source(key) ?? EMPTY_SOURCE;
      return (0, react.useSyncExternalStore)(source.subscribe, source.getSnapshot);
    }
    const CHAT_NODE_INJECT = { hooks: {
      turnData: (_standard, { turnData }) => function useTurnData(key) {
        return useTurnDataValue(turnData, key);
      },
      disclosure: (_standard, { disclosureReset }) => bindDisclosure(disclosureReset)
    } };
    const inject2 = [
      "slots",
      "sessions",
      "uiWorkspace",
      "uiSession",
      "uiConversation",
      "locale",
      "configForms",
      "remote",
      "remote.session",
      "sidebarRight"
    ];
    function apply2(ctx, options = {}) {
      const chatSources = /* @__PURE__ */ new WeakMap();
      const chatSource = (binding) => {
        let source = chatSources.get(binding);
        if (source === void 0) {
          const target = ctx.uiConversation.binding(binding).target("chat");
          source = {
            getSnapshot: () => target.getSnapshot() ?? EMPTY_CHAT_SNAPSHOT,
            subscribe: (listener) => target.subscribe(listener)
          };
          chatSources.set(binding, source);
        }
        return source;
      };
      registerConversationNodes(ctx);
      ctx.uiSession.provide({
        hooks: ["chat"],
        resolve: (binding) => ({ hooks: { chat: chatSource(binding) } })
      });
      ctx.effect(() => ctx.locale.register(NS, {
        zh,
        en
      }), "ui-chat: dictionaries");
      const t = ctx.locale.bind(NS);
      const chatStore = createChatStore();
      const chatScrollPositions = /* @__PURE__ */ new Map();
      const chatSettings = options.settings ?? ctx.configForms.get("ui-chat");
      const linkOpening = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(chatSettings.getSnapshot().value?.linkOpening ?? "sidebar");
      ctx.effect(() => chatSettings.subscribe(() => {
        const accepted = chatSettings.getSnapshot().value?.linkOpening;
        if (accepted !== void 0) linkOpening.set(accepted);
      }));
      ctx.inject(["sidebarRightTabs"], (scope) => {
        const tabs = scope.sidebarRightTabs;
        const browserAvailable = {
          getSnapshot: () => tabs.get("browser") !== void 0,
          subscribe: (listener) => tabs.subscribe(listener)
        };
        scope.slots.inject("settings.general.item", () => scope.slots.register({
          name: "settings.general.item",
          id: "link-opening",
          order: 14,
          locale: NS,
          inject: () => ({
            hooks: {
              linkOpening,
              browserAvailable
            },
            setLinkOpening: (destination) => {
              linkOpening.set(destination);
              chatSettings.set("linkOpening", destination).catch((_error) => {
              });
            }
          })
        }, LinkOpeningRow));
      });
      const transcriptView = new TranscriptViewPolicy(chatSettings);
      const presentation = derivePresentationPolicy(transcriptView.mode);
      const performancePolicy = new PerformanceUsagePolicy(chatSettings);
      ctx.effect(() => () => {
        transcriptView.dispose();
        performancePolicy.dispose();
      });
      const performanceUsage = performancePolicy.mode;
      registerChatNodeRenderers(ctx, performanceUsage, presentation);
      ctx.slots.inject("settings.general.item", () => ctx.slots.register({
        name: "settings.general.item",
        id: "performance-usage",
        order: 13,
        locale: NS,
        inject: () => ({
          hooks: { performanceUsage },
          setPerformanceUsage: (mode) => {
            performancePolicy.setMode(mode);
          }
        })
      }, PerformanceUsageRow));
      ctx.slots.inject("settings.general.item", () => ctx.slots.register({
        name: "settings.general.item",
        id: "transcript-view",
        order: 12,
        locale: NS,
        inject: () => ({
          hooks: { transcriptView: transcriptView.mode },
          setTranscriptView: (mode) => {
            transcriptView.setMode(mode);
          }
        })
      }, TranscriptViewRow));
      ctx.slots.inject("conversation.view", () => {
        return ctx.slots.register({
          name: "conversation.view",
          id: "chat",
          order: 0,
          label: () => t("view.chat"),
          locale: NS,
          children: {
            "conversation.chat.node": {
              kind: "keyed",
              scope: "session",
              inject: CHAT_NODE_INJECT
            },
            "conversation.message.images": {
              kind: "single",
              scope: "session"
            }
          },
          store: chatStore,
          inject: (sessionId) => {
            const binding = ctx.sessions.binding(sessionId);
            if (binding === void 0) throw new Error(`ui-chat: unknown session "${sessionId}"`);
            const session = binding.session;
            const chat = chatSource(binding);
            const conversation = ctx.uiConversation.binding(binding);
            return {
              hooks: { presentation },
              keyedHooks: {
                chatNode: (key) => chat.getSnapshot().nodes.source(key),
                chatNodeProcess: (key) => chat.getSnapshot().nodes.processSource(key),
                chatGroup: (key) => conversation.snapshot.getSnapshot().views.grouped("chat")?.groupSource(key)
              },
              fileMentions: (owner) => ctx.get("chatFileMentions")?.forClosing(owner, sessionId),
              openFile: async (path, options2) => {
                const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd;
                const url2 = fileAddressFor(sessionId, cwd, path);
                if (options2?.line === void 0) ctx.sidebarRight.openResource(url2);
                else ctx.sidebarRight.openResource(url2, { params: { line: options2.line } });
                await Promise.resolve();
              },
              openSkill: (name) => {
                const scope = ctx.sessions.scope(sessionId);
                if (scope === void 0) return;
                ctx.get("inputTriggers")?.sessionOf(scope).openReference("skill", { ref: `/${name}` });
              },
              openExternalLink: (url2) => {
                if (linkOpening.getSnapshot() === "sidebar" && ctx.get("sidebarRightTabs")?.get("browser") !== void 0) ctx.sidebarRight.openTab("browser", { params: { url: url2 } });
                else window.open(url2, "_blank", "noopener,noreferrer");
              },
              loadOlder: () => {
                session.loadOlder();
              },
              loadThrough: (seq) => session.loadThrough(seq),
              loadImage: Object.assign((attachment) => ctx.uiConversation.imageUrl(sessionId, attachment), { peek: (attachment) => ctx.uiConversation.peekImageUrl(sessionId, attachment) }),
              chatScroll: {
                save: (position) => {
                  if (position === null) chatScrollPositions.delete(sessionId);
                  else chatScrollPositions.set(sessionId, position);
                },
                read: () => chatScrollPositions.get(sessionId) ?? null
              },
              forkAt: (seq) => {
                ctx.sessions.fork({
                  sessionId,
                  atSeq: seq,
                  increaseTitle: true
                }).then((childId) => {
                  ctx.uiWorkspace.openSession(childId);
                }).catch(() => {
                });
              }
            };
          }
        }, ChatView);
      });
      ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
        name: "conversation.composer.dock",
        id: "stats",
        order: 0,
        locale: NS,
        inject: () => ({ hooks: { performanceUsage } })
      }, StatsPills));
      ctx.slots.inject("conversation.approval.detail", () => ctx.slots.register({ name: "conversation.approval.detail" }, ApprovalCommand));
    }
    exports.EMPTY_CHAT_SNAPSHOT = EMPTY_CHAT_SNAPSHOT;
    exports.apply = apply2;
    exports.inject = inject2;
    exports.isRunningTool = isRunningTool;
    exports.isSettledTool = isSettledTool;
    return module2.exports;
  }
};
var createChat = (require2) => registration.factory(require2);

// src/client/polling.mjs
function createPoller({
  read,
  onData,
  onError = () => {
  },
  interval = 2500,
  visibility = globalThis.document,
  timeout = 3e4
}) {
  let active = false, generation = 0, timer, controller;
  const visible = () => visibility?.visibilityState !== "hidden";
  const cancel = () => {
    generation++;
    clearTimeout(timer);
    timer = void 0;
    controller?.abort();
    controller = void 0;
  };
  async function refresh() {
    cancel();
    if (!active || !visible()) return;
    const ticket = generation, own = controller = new AbortController();
    const deadline = setTimeout(() => own.abort(new Error("\u8BFB\u53D6\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5")), timeout);
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(own.signal.reason);
      own.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const data = await Promise.race([read(own.signal), aborted]);
      if (active && ticket === generation && !own.signal.aborted) onData(data);
    } catch (error) {
      if (active && ticket === generation) onError(own.signal.aborted ? own.signal.reason : error);
    } finally {
      clearTimeout(deadline);
      own.signal.removeEventListener("abort", onAbort);
      if (ticket === generation) {
        controller = void 0;
        if (active && visible()) timer = setTimeout(refresh, interval);
      }
    }
  }
  const onVisibility = () => {
    if (visible()) void refresh();
    else cancel();
  };
  return {
    start() {
      if (active) return;
      active = true;
      visibility?.addEventListener("visibilitychange", onVisibility);
      void refresh();
    },
    stop() {
      active = false;
      cancel();
      visibility?.removeEventListener("visibilitychange", onVisibility);
    },
    refresh
  };
}

// src/client/state-pool.mjs
var EMPTY = Object.freeze({ state: null, error: "", eventRevision: 0 });
function createComputerStatePool({ read, events = globalThis.window, visibility = null, interval = 800 }) {
  const entries = /* @__PURE__ */ new Map();
  const notify = (entry) => {
    for (const listener of entry.listeners) listener();
  };
  function publish(id, value, fromPoll = false) {
    const entry = entries.get(id);
    if (!entry) return;
    const previous = entry.snapshot.state, next = typeof value === "function" ? value(previous) : value;
    if (!next || previous && ((next.controlEpoch ?? 0) < (previous.controlEpoch ?? 0) || (next.navigationRevision ?? 0) < (previous.navigationRevision ?? 0) || (next.viewRevision ?? 0) < (previous.viewRevision ?? 0))) return;
    entry.revision++;
    entry.snapshot = { state: next, error: "", eventRevision: entry.snapshot.eventRevision + (fromPoll ? 0 : 1) };
    notify(entry);
  }
  const changed = (event) => publish(event.detail?.id, event.detail?.state);
  return {
    snapshot: (id) => entries.get(id)?.snapshot || EMPTY,
    publish,
    subscribe(id, listener) {
      if (!id) return () => {
      };
      let entry = entries.get(id);
      if (!entry) {
        entry = { snapshot: EMPTY, revision: 0, listeners: /* @__PURE__ */ new Set() };
        entries.set(id, entry);
        if (entries.size === 1) events?.addEventListener("trisoul-cu-state", changed);
        entry.poller = createPoller({
          visibility,
          interval,
          read: async (signal) => {
            const revision = entry.revision;
            return { revision, data: await read(id, signal) };
          },
          onData: ({ revision, data }) => {
            if (entry.revision === revision) publish(id, data, true);
          },
          onError: (error) => {
            entry.snapshot = { ...entry.snapshot, error: error.message };
            notify(entry);
          }
        });
      }
      entry.listeners.add(listener);
      entry.poller.start();
      return () => {
        entry.listeners.delete(listener);
        if (entry.listeners.size) return;
        entry.poller.stop();
        if (entries.get(id) === entry) entries.delete(id);
        if (!entries.size) events?.removeEventListener("trisoul-cu-state", changed);
      };
    }
  };
}

// src/client/host-browser.mjs
var HOST_BROWSER_ID = "@deepseek-ai/dsh-client-ui-sidebar-browser";
function hostPreviewUrl(target, navigation) {
  if (target?.kind !== "tab") return null;
  const value = navigation && navigation.tabId === target.id ? navigation.url : target.url;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
function openHostBrowserPreview(actions, url2) {
  if (!hostPreviewUrl({ kind: "tab", url: url2 }) || typeof actions?.openTab !== "function") return false;
  actions.openTab("browser", { params: { url: url2 } });
  return true;
}

// src/client/computer-use.jsx
var import_react17 = __toESM(require("react"), 1);

// src/client/computer-use.css
var computer_use_default = "/* DSH surfaces and blue accents, with compact controls and media-first previews. */\n.tx-cu-pane, .tx-cu-card, .tx-cu-chip, .tx-cu-group, .tx-cu-share,\n.tx-cu-share-dialog, .tx-cu-floating, .tx-cu-user-message, .tx-cu-image-dialog, .tx-cu-result-images, .tx-cu-group-toggle {\n  --cu-bg: var(--dsw-alias-bg-base, Canvas);\n  --cu-text: var(--dsw-alias-label-primary, CanvasText);\n  --cu-muted: var(--dsw-alias-label-tertiary, GrayText);\n  --cu-line: color-mix(in srgb, var(--cu-text) 12%, var(--cu-bg));\n  --cu-soft: color-mix(in srgb, var(--cu-text) 3%, var(--cu-bg));\n  --cu-hover: color-mix(in srgb, var(--cu-text) 6%, var(--cu-bg));\n  --cu-blue: #3877e8;\n  --cu-tint: color-mix(in srgb, var(--cu-blue) 9%, var(--cu-bg));\n  --cu-danger: var(--dsw-alias-state-error-primary, #c45252);\n  --cu-shadow: 0 8px 32px -8px #0003, 0 2px 6px #0000000a;\n  color: var(--cu-text);\n  font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n  font-variant-numeric: tabular-nums;\n  -webkit-font-smoothing: antialiased;\n}\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) *,\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) *::before,\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) *::after { box-sizing: border-box; }\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 30px;\n  border: 1px solid var(--cu-line);\n  border-radius: 8px;\n  padding: 5px 10px;\n  background: var(--cu-bg);\n  color: var(--cu-text);\n  font: inherit;\n  font-size: 12px;\n  line-height: 18px;\n  cursor: pointer;\n  transition: background .15s, border-color .15s, color .15s;\n}\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) button:hover:not(:disabled) { background: var(--cu-hover); }\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) button:disabled { opacity: .4; cursor: default; }\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) :is(button, input, select, textarea, summary):focus-visible {\n  outline: 2px solid var(--cu-blue);\n  outline-offset: 2px;\n}\n:where(.tx-cu-pane, .tx-cu-chip, .tx-cu-share-dialog, .tx-cu-floating) svg { flex-shrink: 0; }\n:where(.tx-cu-pane, .tx-cu-share-dialog) :is(input:not([type=checkbox]), select, textarea) {\n  min-width: 0;\n  border: 1px solid var(--cu-line);\n  border-radius: 8px;\n  padding: 7px 10px;\n  background: var(--cu-bg);\n  color: var(--cu-text);\n  font: inherit;\n  font-size: 12px;\n}\n:where(.tx-cu-pane, .tx-cu-share-dialog) :is(input, textarea)::placeholder { color: var(--cu-muted); opacity: .8; }\n:where(.tx-cu-pane, .tx-cu-share-dialog, .tx-cu-floating) .tx-cu-primary {\n  background: var(--cu-blue);\n  color: #fff;\n  border-color: transparent;\n}\n:where(.tx-cu-pane, .tx-cu-share-dialog, .tx-cu-floating) .tx-cu-primary:hover:not(:disabled) { background: #2868d8; }\n.tx-cu-error { color: var(--cu-danger, #c45252) !important; overflow-wrap: anywhere; }\n.tx-cu-result-images { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 8px; }\n.tx-cu-image-button { display: block; width: 80px; height: 80px; padding: 0; overflow: hidden; border: 1px solid var(--cu-line); border-radius: 8px; background: var(--cu-bg); cursor: zoom-in; }\n.tx-cu-image-button .tx-cu-card-image { width: 100%; height: 100%; margin: 0; border: 0; border-radius: 0; object-fit: cover; }\n.tx-cu-image-retry { padding: 8px; color: var(--cu-danger); }\n.tx-cu-image-dialog { position: fixed; inset: 0; width: calc(100vw - 40px); height: calc(100dvh - 40px); max-width: none; max-height: none; margin: auto; padding: 0; border: 1px solid var(--cu-line); border-radius: 12px; background: var(--cu-bg); box-shadow: var(--cu-shadow); }\n.tx-cu-image-dialog::backdrop { background: #0009; }\n.tx-cu-image-dialog * { box-sizing: border-box; }\n.tx-cu-image-dialog header { min-height: 48px; padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-image-dialog header > span, .tx-cu-image-dialog header > div { display: flex; align-items: center; gap: 5px; }\n.tx-cu-image-dialog header > span { gap: 12px; font-size: 13px; }\n.tx-cu-image-dialog output { min-width: 40px; text-align: center; font-variant-numeric: tabular-nums; font-size: 11px; color: var(--cu-muted); }\n.tx-cu-image-dialog small { color: var(--cu-muted); font-size: 11px; }\n.tx-cu-image-dialog button, .tx-cu-image-dialog a { display: inline-flex; align-items: center; padding: 5px 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; text-decoration: none; }\n.tx-cu-image-dialog button:hover, .tx-cu-image-dialog a:hover { background: var(--cu-hover); }\n.tx-cu-image-dialog[open] { display: flex; flex-direction: column; }\n.tx-cu-image-canvas { flex: 1; min-height: 0; padding: 16px; overflow: auto; background: var(--cu-soft); touch-action: none; }\n.tx-cu-image-stage { min-width: 100%; min-height: 100%; width: max-content; display: flex; align-items: center; justify-content: center; }\n.tx-cu-image-canvas img { display: block; flex-shrink: 0; max-width: none; max-height: none; object-fit: contain; cursor: zoom-in; }\n.tx-cu-image-canvas.is-original img { cursor: grab; }\n.tx-cu-image-canvas.is-panning, .tx-cu-image-canvas.is-panning img { cursor: grabbing; }\n.tx-cu-image-dialog footer { padding: 6px 12px; text-align: center; color: var(--cu-muted); font-size: 10px; border-top: 1px solid var(--cu-line); }\n.tx-cu-image-dialog button:disabled { opacity: .4; cursor: default; }\n.tx-cu-image-loading { display: grid; place-items: center; width: 80px; height: 80px; border-radius: 8px; background: var(--cu-soft); color: var(--cu-muted); font-size: 10px; }\n.tx-cu-image-failure { display: flex; align-items: center; justify-content: center; min-height: 100%; gap: 12px; color: var(--cu-muted); font-size: 12px; }\n/* read_image keeps its original result in the host's inspect action. */\n.trisoul-shell .o3BgMG_imageBody :is(.o3BgMG_imageLabel, .o3BgMG_imageMeta) { display: none; }\n.tx-cu-muted { color: var(--cu-muted); }\n.tx-cu-pane > .tx-cu-error { padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--cu-danger) 7%, var(--cu-bg)); font-size: 12px; }\n\n/* The panel keeps the host layout and concentrates actions in its header. */\n.tx-cu-pane { height: 100%; padding: 18px 16px; overflow: auto; box-sizing: border-box; background: var(--cu-bg); container-type: inline-size; scrollbar-width: thin; }\n.tx-cu-pane > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }\n.tx-cu-pane-heading { display: flex; align-items: center; gap: 9px; min-width: 0; }\n.tx-cu-pane-heading > svg { color: var(--cu-muted); }\n.tx-cu-pane-heading > div { display: flex; flex-direction: column; gap: 1px; }\n.tx-cu-pane-heading strong { font-size: 13px; font-weight: 600; letter-spacing: -.15px; }\n.tx-cu-status { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--cu-muted); }\n.tx-cu-status::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .55; }\n.tx-cu-status.is-running { color: var(--cu-blue); }\n.tx-cu-status.is-running::before { opacity: 1; }\n.tx-cu-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-left: auto; }\n.tx-cu-toolbar button { min-height: 28px; padding: 4px 8px; font-size: 11px; }\n.tx-cu-toolbar .tx-cu-stop { background: var(--cu-soft); border-color: transparent; }\n.tx-cu-toolbar .tx-cu-stop:hover:not(:disabled) { background: var(--cu-hover); }\n.tx-cu-target { display: flex; align-items: center; gap: 7px; margin: 16px 0 9px; font-size: 12px; font-weight: 500; }\n.tx-cu-target svg { color: var(--cu-muted); }\n.tx-cu-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; margin: 12px 0 0; padding: 28px 18px 20px; text-align: center; }\n.tx-cu-empty > svg { width: 34px; height: 34px; margin-bottom: 16px; color: var(--cu-muted); stroke-width: 1.25; }\n.tx-cu-empty h3 { margin: 0 0 8px; font-size: 15px; font-weight: 550; letter-spacing: -.2px; }\n.tx-cu-empty p { max-width: 260px; margin: 0; color: var(--cu-muted); font-size: 12px; line-height: 1.75; }\n.tx-cu-information { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin: 24px 0; font-size: 12px; }\n.tx-cu-information span { color: var(--cu-muted); }\n.tx-cu-information strong { font-weight: 500; }\n\n/* Browser tabs preserve exact target identity; the strip remains keyboard accessible. */\n.tx-cu-browser-controls { position: relative; padding: 0 10px 6px; margin: 0 -16px; border-bottom: 1px solid var(--cu-line); background: var(--cu-bg); }\n.tx-cu-tabs { display: flex; align-items: center; gap: 4px; min-width: 0; margin-bottom: 7px; }\n.tx-cu-tablist { display: flex; align-items: center; gap: 3px; min-width: 0; max-width: calc(100% - 32px); overflow-x: auto; scrollbar-width: thin; }\n.tx-cu-browser-tab { display: flex; align-items: center; flex: 0 1 180px; min-width: 100px; max-width: 200px; border-radius: 8px; }\n.tx-cu-browser-tab.is-active { background: var(--cu-hover); }\n.tx-cu-tabs .tx-cu-browser-tab [role=tab] { width: auto; min-width: 0; flex: 1; justify-content: flex-start; padding: 5px 8px; color: var(--cu-text); }\n.tx-cu-browser-tab [role=tab] > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-browser-tab .tx-cu-tab-close { width: 22px; min-height: 22px; padding: 3px; margin-right: 3px; opacity: 0; }\n.tx-cu-browser-tab:is(:hover,:focus-within,.is-active) .tx-cu-tab-close { opacity: 1; }\n.tx-cu-tabs .tx-cu-tab-close:disabled { opacity: .35; }\n.tx-cu-tabs button, .tx-cu-address button { width: 28px; min-height: 28px; padding: 5px; flex-shrink: 0; border-color: transparent; background: transparent; color: var(--cu-muted); }\n.tx-cu-address { display: flex; align-items: center; gap: 2px; margin: 0; }\n.tx-cu-browser-navigation { display: grid; grid-template-columns: minmax(0,1fr) auto 28px 28px; gap: 2px; align-items: center; }\n.tx-cu-browser-actions { display: flex; align-items: center; gap: 2px; }\n.tx-cu-browser-actions > button { width: 28px; min-height: 28px; padding: 5px; border: 0; background: transparent; color: var(--cu-muted); }\n.tx-cu-browser-actions > .is-resume { color: var(--cu-blue); }\n.tx-cu-downloads { position: relative; }\n.tx-cu-downloads > button { border: 0; background: transparent; width: 28px; min-height: 28px; padding: 5px; color: var(--cu-muted); }\n.tx-cu-download-panel { position: absolute; z-index: 31; top: calc(100% + 5px); right: -30px; width: 320px; max-width: calc(100vw - 32px); max-height: min(480px,65vh); overflow: auto; padding: 12px; border: 1px solid var(--cu-line); border-radius: 12px; background: var(--cu-bg); box-shadow: var(--cu-shadow); font-size: 12px; }\n.tx-cu-download-panel header { display: flex; align-items: center; justify-content: space-between; }\n.tx-cu-download-panel header button { border: 0; background: transparent; min-height: 26px; padding: 5px; }\n.tx-cu-download-panel ul { list-style: none; padding: 0; margin: 8px 0; }\n.tx-cu-download-panel li { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-download-panel li > svg { flex-shrink: 0; margin-top: 2px; color: var(--cu-muted); }\n.tx-cu-download-panel li > div { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }\n.tx-cu-download-panel li strong { overflow-wrap: anywhere; font-weight: 500; }\n.tx-cu-download-panel :is(small,footer) { color: var(--cu-muted); overflow-wrap: anywhere; font-size: 11px; }\n.tx-cu-download-panel progress { width: 100%; height: 4px; accent-color: var(--cu-blue); }\n.tx-cu-download-filters { display: flex; gap: 6px; margin-top: 10px; }\n.tx-cu-download-filters input { min-width: 0; width: 0; flex: 1; }\n.tx-cu-download-filters select { width: 82px; }\n.tx-cu-download-filters :is(input,select) { min-height: 28px; padding: 4px 6px; font-size: 11px; }\n.tx-cu-download-panel footer, .tx-cu-browser-popover footer { display: flex; flex-direction: column; gap: 8px; }\n.tx-cu-download-panel footer > div, .tx-cu-browser-popover footer > div { display: flex; justify-content: space-between; gap: 8px; }\n.tx-cu-download-panel footer button, .tx-cu-browser-popover footer button { min-height: 26px; padding: 3px 5px; border: 0; background: transparent; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-browser-popover { position: absolute; z-index: 32; top: 76px; right: 10px; width: min(420px,calc(100% - 20px)); max-height: min(520px,70vh); overflow: auto; padding: 12px; border: 1px solid var(--cu-line); border-radius: 12px; background: var(--cu-bg); box-shadow: var(--cu-shadow); font-size: 12px; }\n.tx-cu-browser-popover header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }\n.tx-cu-browser-popover header button { border: 0; background: transparent; min-height: 26px; padding: 5px; }\n.tx-cu-browser-popover > input { width: 100%; min-height: 30px; font-size: 12px; }\n.tx-cu-history-entries h4 { margin: 14px 0 6px; font-size: 11px; font-weight: 500; color: var(--cu-muted); }\n.tx-cu-history-link { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 4px; text-align: left; border: 0; background: transparent; }\n.tx-cu-history-link > svg { flex-shrink: 0; color: var(--cu-muted); }\n.tx-cu-history-link > span { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }\n.tx-cu-history-link strong, .tx-cu-history-link small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }\n.tx-cu-history-link small, .tx-cu-history-link time { color: var(--cu-muted); font-size: 10px; }\n.tx-cu-history-more { margin-block: 8px; width: 100%; border: 0; background: transparent; font-size: 11px; }\n.tx-cu-browser-popover footer { border-top: 1px solid var(--cu-line); padding-top: 10px; margin-top: 12px; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-browser-tools { position: relative; }\n.tx-cu-browser-tools .tx-cu-browser-options { border: 0; background: transparent; width: 28px; padding: 0; min-height: 28px; font-size: 18px; color: var(--cu-muted); }\n.tx-cu-browser-menu { position: absolute; top: calc(100% + 5px); right: 0; z-index: 30; width: 240px; max-width: calc(100vw - 32px); padding: 5px; border: 1px solid var(--cu-line); border-radius: 16px; background: var(--cu-bg); box-shadow: var(--cu-shadow); }\n.tx-cu-browser-menu button { width: 100%; justify-content: flex-start; border: 0; background: transparent; padding: 6px 8px; }\n.tx-cu-browser-menu button > span { flex: 1; text-align: left; }\n.tx-cu-browser-menu kbd { margin-left: auto; font: inherit; font-size: 10px; color: var(--cu-muted); }\n.tx-cu-browser-menu hr { border: 0; border-top: 1px solid var(--cu-line); margin: 4px 6px; }\n.tx-cu-find .is-missing { color: var(--dsw-alias-state-error-primary,#c6333d); }\n.tx-cu-device-toolbar { grid-column: 1/-1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 5px -10px -6px; padding: 6px 10px; border-block: 1px solid var(--cu-line); background: var(--cu-soft); color: var(--cu-muted); font-size: 11px; }\n.tx-cu-device-toolbar :is(input,select,button) { min-height: 26px; padding: 3px 5px; font-size: 11px; }\n.tx-cu-device-toolbar input { width: 72px; min-width: 0; appearance: textfield; text-align: center; font-weight: 550; border-color: transparent; border-radius: 10px; background: var(--cu-hover); }\n.tx-cu-device-toolbar input::-webkit-inner-spin-button { appearance: none; }\n.tx-cu-device-toolbar select { width: 80px; border-color: transparent; background: transparent; }\n.tx-cu-device-toolbar .tx-cu-device-preset { width: clamp(88px,25cqw,176px); }\n.tx-cu-device-dimensions { display: flex; align-items: center; gap: 4px; }\n.tx-cu-device-toolbar button { border-color: transparent; background: transparent; }\n.tx-cu-device-toolbar button[hidden] { display: none; }\n.tx-cu-device-toolbar .tx-cu-device-close { margin-left: auto; }\n.tx-cu-device-apply { width: 26px; }\n.tx-cu-browser-tool-progress { position: absolute; right: 12px; bottom: -20px; z-index: 5; padding: 2px 6px; border-radius: 4px; background: var(--cu-bg); font-size: 11px; color: var(--cu-muted); }\n.tx-cu-find { grid-column: 1/-1; display: flex; align-items: center; gap: 3px; padding: 5px; border: 1px solid var(--cu-line); border-radius: 8px; margin: 3px 0; }\n.tx-cu-find input { flex: 1; width: 80px; min-width: 0; border: 0; background: transparent; padding: 3px; }\n.tx-cu-find > span { font-size: 11px; white-space: nowrap; color: var(--cu-muted); }\n.tx-cu-find button { width: 25px; padding: 3px; min-height: 26px; border: 0; background: transparent; }\n.tx-cu-location { position: relative; flex: 1; min-width: 0; }\n.tx-cu-address .tx-cu-location input { width: 100%; min-height: 30px; padding: 5px 32px 5px 9px; border-color: transparent; background: transparent; }\n.tx-cu-location > span { position: absolute; inset: 5px 32px 5px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; pointer-events: none; font-size: 12px; }\n.tx-cu-location .tx-cu-open-external { position: absolute; right: 1px; top: 1px; width: 28px; }\n.tx-cu-location:focus-within > span { display: none; }\n.tx-cu-location:not(:focus-within) input:not(:placeholder-shown) { color: transparent; }\n.tx-cu-location:focus-within input { background: var(--cu-soft); }\n.tx-cu-address button[type=submit] { display: none; }\n.tx-cu-browser-open { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }\n.tx-cu-pane:has(.tx-cu-empty) .tx-cu-browser-open { justify-content: center; margin: 0 0 30px; }\n.tx-cu-pane:has(.tx-cu-empty) .tx-cu-browser-open > button { background: var(--cu-blue); border-color: transparent; color: #fff; padding-inline: 14px; }\n.tx-cu-browser-open select { flex: 1 1 100%; width: 100%; }\n.tx-cu-loading { position: absolute; inset: auto 0 -1px; height: 2px; overflow: hidden; pointer-events: none; background: color-mix(in srgb,var(--cu-blue) 12%,transparent); }\n.tx-cu-loading::before { content: ''; position: absolute; width: 35%; height: 100%; background: var(--cu-blue); animation: tx-cu-loading 1.2s ease-in-out infinite; }\n@keyframes tx-cu-loading { from { transform: translateX(-100%); } to { transform: translateX(390%); } }\n.tx-cu-tab-loading { animation: tx-cu-tab-loading 1s ease-in-out infinite alternate; }\n@keyframes tx-cu-tab-loading { to { opacity: .3; } }\n.tx-cu-pane-browser { display: flex; flex-direction: column; padding-top: 6px; padding-bottom: 0; overflow: hidden; }\n.tx-cu-pane-browser > * { flex-shrink: 0; }\n.tx-cu-pane-browser > .tx-cu-browser-controls { z-index: 3; }\n.tx-cu-pane-browser > header { margin-bottom: 8px; }\n.tx-cu-pane-browser .tx-cu-pane-heading > div { flex-direction: row; align-items: center; gap: 8px; }\n.tx-cu-pane-browser > .tx-cu-live { display: flex; flex: 1 1 0; min-height: 100px; flex-direction: column; margin-inline: -16px; border: 0; border-radius: 0; }\n.tx-cu-pane-browser > .tx-cu-live > .tx-cu-preview-stage { flex: 1 1 0; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; }\n.tx-cu-pane-browser > .tx-cu-live > :not(.tx-cu-preview-stage) { flex-shrink: 0; }\n.tx-cu-pane-browser > .tx-cu-live > .tx-cu-live-meta { order: 1; padding: 5px 12px; background: transparent; border-top: 1px solid var(--cu-line); }\n.tx-cu-pane-browser > .tx-cu-live > .tx-cu-dialog { order: 2; }\n.tx-cu-pane-browser > .tx-cu-live.is-device { align-items: center; background: var(--cu-soft); }\n.tx-cu-preview-stage { position: relative; width: 100%; min-width: 0; }\n.tx-cu-pane-browser > .tx-cu-live.is-device > .tx-cu-preview-stage { max-height: none; }\n.tx-cu-pane-browser .tx-cu-pane-support { flex: 0 1 auto; min-height: 0; max-height: 40%; overflow: auto; scrollbar-width: thin; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-setup { margin-top: 0; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-setup-toggle { padding-block: 8px; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-history { margin-block: 0; }\n.tx-cu-pane-browser .tx-cu-pane-support .tx-cu-history summary { padding-block: 8px; }\n.tx-cu-browser-blank { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: var(--cu-bg); color: var(--cu-muted); }\n.tx-cu-browser-blank h3 { color: var(--cu-text); font-size: 15px; font-weight: 550; margin: 16px 0 8px; }\n.tx-cu-browser-blank p { font-size: 13px; margin: 0; }\n.tx-cu-live.is-blank > .tx-cu-preview-stage { overflow: hidden; }\n.tx-cu-live.is-blank .tx-cu-live-surface { visibility: hidden; }\n.tx-cu-pane-browser > .tx-cu-live.is-blank > .tx-cu-live-meta { visibility: hidden; border-color: transparent; }\n@media (prefers-reduced-motion: reduce) { .tx-cu-loading::before, .tx-cu-tab-loading { animation: none; } }\n.tx-cu-live.is-device > .tx-cu-preview-stage { display: flex; align-items: flex-start; max-height: var(--cu-preview-height,none); overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; background: #3f3f3f; }\n.tx-cu-device-frame { position: relative; width: 100%; min-width: 0; }\n.tx-cu-device-frame.is-device { box-sizing: border-box; width: calc(var(--cu-device-width) + 40px); padding: 0 20px 20px; flex-shrink: 0; margin-inline: auto; }\n.tx-cu-device-frame.is-device > .tx-cu-live-surface { width: var(--cu-device-width); }\n.tx-cu-device-frame > .tx-cu-device-handle { position: absolute; z-index: 2; min-height: 0; padding: 0; border: 0; border-radius: 0; background: transparent; color: #b9b9b9; touch-action: none; }\n.tx-cu-device-frame > .tx-cu-device-handle:hover:not(:disabled) { background: #ffffff12; }\n.tx-cu-device-frame > .tx-cu-device-handle:focus-visible { outline-offset: -3px; }\n.tx-cu-device-handle::after { content: ''; display: block; }\n.tx-cu-device-handle:is(.is-left,.is-right) { top: 0; bottom: 20px; width: 20px; cursor: ew-resize; }\n.tx-cu-device-handle.is-left { left: 0; }\n.tx-cu-device-handle.is-right { right: 0; }\n.tx-cu-device-handle:is(.is-left,.is-right)::after { width: 4px; height: 30px; border-inline: 1px solid currentColor; }\n.tx-cu-device-handle.is-bottom { bottom: 0; left: 20px; right: 20px; height: 20px; cursor: ns-resize; }\n.tx-cu-device-handle.is-bottom::after { height: 4px; width: 30px; border-block: 1px solid currentColor; }\n.tx-cu-device-handle:is(.is-bottom-left,.is-bottom-right) { bottom: 0; width: 20px; height: 20px; }\n.tx-cu-device-handle.is-bottom-left { left: 0; cursor: nesw-resize; }\n.tx-cu-device-handle.is-bottom-right { right: 0; cursor: nwse-resize; }\n.tx-cu-device-handle:is(.is-bottom-left,.is-bottom-right)::after { width: 11px; height: 4px; border-block: 1px solid currentColor; transform: rotate(45deg); }\n.tx-cu-device-handle.is-bottom-right::after { transform: rotate(-45deg); }\n.tx-cu-device-ghost-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3; }\n.tx-cu-device-ghost { position: absolute; top: 0; box-sizing: border-box; border: 2px solid var(--cu-blue); }\n.tx-cu-device-ghost-layer output { position: absolute; left: 50%; top: 6px; transform: translateX(-50%); padding: 3px 6px; border-radius: 4px; background: #252525; color: #fff; font-size: 11px; white-space: nowrap; }\n.tx-cu-live.is-device > :is(.tx-cu-live-meta,.tx-cu-dialog) { align-self: stretch; }\n@container (max-width: 320px) {\n  .tx-cu-address button[type=submit] { display: none; }\n}\n\n/* Live surfaces: image geometry is shared by the screenshot and assistant cursor. */\n.tx-cu-preview, .tx-cu-live { position: relative; overflow: hidden; border: 1px solid var(--cu-line); border-radius: 10px; }\n.tx-cu-preview img { display: block; width: 100%; height: auto; background: #fff; }\n.tx-cu-preview small { display: block; padding: 8px 10px; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-live-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; color: var(--cu-muted); font-size: 10px; background: var(--cu-soft); }\n.tx-cu-live-dot::before { content: ''; display: inline-block; width: 5px; height: 5px; margin-right: 6px; border-radius: 50%; background: #28966b; }\n.tx-cu-live-surface { position: relative; overflow: hidden; touch-action: none; overscroll-behavior: contain; line-height: 0; outline-offset: -2px; }\n.tx-cu-live-surface:focus-within { outline: 2px solid var(--cu-blue); }\n.tx-cu-live-surface > img, .tx-cu-observed-image > img { display: block; width: 100%; height: auto; user-select: none; -webkit-user-drag: none; background: #fff; }\n.tx-cu-observed-image { position: relative; line-height: 0; }\n.tx-cu-live-placeholder { display: grid; place-items: center; min-height: 220px; padding: 16px; color: var(--cu-muted); font-size: 12px; line-height: 1.5; background: var(--cu-soft); }\n.tx-cu-live-overlay { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: #171717a6; color: #fff; font-size: 12px; line-height: 1.5; pointer-events: none; }\n.tx-cu-keyboard { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; padding: 0; border: 0; pointer-events: none; resize: none; }\n.tx-cu-dialog { padding: 14px; border-top: 1px solid var(--cu-line); background: var(--cu-bg); }\n.tx-cu-dialog p { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0 0 12px; font-size: 12px; }\n.tx-cu-dialog input { width: 100%; }\n.tx-cu-dialog > div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }\n.tx-cu-reconnect { margin: 8px; }\n.tx-cu-assistant-cursor { position: absolute; z-index: 2; pointer-events: none; transform: translate(-2px,-2px); filter: drop-shadow(0 2px 3px #0005); transition: left 35ms linear,top 35ms linear; line-height: 0; }\n.tx-cu-assistant-cursor.is-pressed { transition: none; }\n.tx-cu-assistant-cursor svg { display: block; transform-origin: 2px 2px; }\n.tx-cu-assistant-cursor.is-pressed svg { transform: scale(.9); }\n.tx-cu-cursor-pulse { position: absolute; z-index: 2; pointer-events: none; left: 2px; top: 2px; width: 22px; height: 22px; margin: -11px; border: 2px solid #fff; box-shadow: 0 0 0 1px #377cdb99; border-radius: 50%; animation: tx-cu-cursor-click .25s ease-out both; }\n@keyframes tx-cu-cursor-click { from { opacity: .9; transform: scale(.4); } to { opacity: 0; transform: scale(1.3); } }\n\n/* One quiet strip below the composer, plus collapsible conversation records. */\n.tx-cu-chip { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; padding: 2px 0; font-size: 11px; }\n.tx-cu-chip button { min-height: 26px; padding: 3px 7px; border-color: transparent; background: transparent; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-chip .tx-cu-entry { color: var(--cu-text); }\n.tx-cu-chip .tx-cu-entry svg { color: var(--cu-muted); }\n.tx-cu-chip-status { display: inline-flex; align-items: center; gap: 5px; margin-inline: 5px; color: var(--cu-muted); font-size: 10px; }\n.tx-cu-chip .tx-cu-chip-resume { color: var(--cu-blue); }\n.tx-cu-share { font-size: 11px; }\n.tx-cu-share-entry { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 7px; background: transparent; color: var(--cu-muted); padding: 3px 7px; font: inherit; cursor: pointer; }\n.tx-cu-share-entry:hover { background: var(--cu-hover); }\n.tx-cu-card { margin: 0; max-width: 100%; min-width: 0; }\n.tx-cu-card-heading { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; min-height: 26px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--cu-muted); text-align: left; font: var(--dsh-content-font-size-secondary, 13px)/26px -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; }\n.tx-cu-card-heading:hover { color: var(--dsw-alias-label-secondary, var(--cu-text)); }\n.tx-cu-card-heading:focus-visible, .tx-cu-group-toggle:focus-visible { outline: 2px solid var(--cu-blue); outline-offset: 2px; }\n.tx-cu-card-heading svg { flex-shrink: 0; }\n.tx-cu-card-leading { position: relative; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex-shrink: 0; }\n.tx-cu-card-chevron { position: absolute; opacity: 0; }\n.tx-cu-card-heading:is(:hover, :focus-visible, [aria-expanded=true]) .tx-cu-card-leading > svg:first-child { opacity: 0; }\n.tx-cu-card-heading:is(:hover, :focus-visible, [aria-expanded=true]) .tx-cu-card-chevron { opacity: 1; }\n.tx-cu-card-chevron, .tx-cu-disclosure { transition: transform .15s; }\n[aria-expanded=true] .tx-cu-card-chevron, [aria-expanded=true] > .tx-cu-disclosure { transform: rotate(90deg); }\n.tx-cu-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }\n.tx-cu-card-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-card-count { font-size: 10px; flex-shrink: 0; }\n.tx-cu-card-heading small { margin-left: auto; font-size: 10px; font-weight: 400; flex-shrink: 0; color: var(--cu-muted); }\n.tx-cu-card[data-state=running] .tx-cu-card-heading small { color: var(--cu-blue); }\n.tx-cu-card-body { margin: 4px 0 8px 22px; padding: 4px 10px; border-left: 1px solid var(--cu-line); overflow: hidden; }\n.tx-cu-card-body > p { font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }\n.tx-cu-card-body > details { color: var(--cu-muted); font-size: 11px; }\n.tx-cu-card-body summary { cursor: pointer; padding: 6px 0; }\n.tx-cu-card-image { display: block; max-width: 100%; max-height: 340px; border: 1px solid var(--cu-line); border-radius: 9px; margin: 10px 0; }\n.tx-cu-card pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.6 ui-monospace, monospace; max-height: 300px; overflow: auto; }\n.tx-cu-group-toggle { min-height: 26px; font-size: var(--dsh-content-font-size-secondary, 13px); }\n.tx-cu-export-files { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }\n.tx-cu-export-files button { display: flex; align-items: center; gap: 12px; max-width: 100%; padding: 7px 10px; border: 1px solid var(--cu-line); border-radius: 8px; background: var(--cu-soft); color: inherit; cursor: pointer; overflow-wrap: anywhere; }\n.tx-cu-export-files small { color: var(--cu-muted); font-size: 10px; white-space: nowrap; }\n.tx-cu-vision-warning { color: color-mix(in srgb, #a97520 85%, var(--cu-text)); font-size: 11px; line-height: 1.7; }\n.tx-cu-pane > .tx-cu-vision-warning { padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, #a97520 7%, var(--cu-bg)); }\n\n/* Setup is a compact disclosure; paths and implementation details stay inside it. */\n.tx-cu-setup { margin: 18px 0 0; border-top: 1px solid var(--cu-line); }\n.tx-cu-pane .tx-cu-setup-toggle { justify-content: space-between; width: 100%; padding: 13px 0; border: 0; border-radius: 0; background: transparent; text-align: left; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-setup-toggle > span { display: inline-flex; align-items: center; gap: 7px; }\n.tx-cu-setup-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 0; }\n.tx-cu-setup-row strong { font-size: 12px; font-weight: 500; }\n.tx-cu-setup p { margin: 4px 0 0; color: var(--cu-muted); font-size: 11px; line-height: 1.7; }\n.tx-cu-setup-row > span { font-size: 10px; flex-shrink: 0; }\n.tx-cu-setup .is-ready { color: var(--cu-muted); }\n.tx-cu-setup .is-ready::before { content: ''; display: inline-block; width: 5px; height: 5px; border-radius: 50%; margin-right: 5px; background: #28966b; }\n.tx-cu-setup .is-needed { color: var(--cu-muted); }\n.tx-cu-setup-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 12px 0; }\n.tx-cu-setup-actions > span { flex: 1; min-width: 160px; font-size: 10px; }\n.tx-cu-setup-advanced { font-size: 11px; margin-bottom: 10px; color: var(--cu-muted); }\n.tx-cu-setup-advanced summary { cursor: pointer; }\n.tx-cu-setup code { display: block; padding: 8px 10px; border-radius: 7px; background: var(--cu-soft); font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 8px; }\n.tx-cu-setup-install { padding: 10px 0; }\n.tx-cu-setup-install button { margin-top: 10px; }\n.tx-cu-history { margin-top: 0; border-top: 1px solid var(--cu-line); }\n.tx-cu-history summary { padding: 12px 0; color: var(--cu-muted); font-size: 11px; cursor: pointer; }\n.tx-cu-history > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; padding: 8px 0; border-top: 1px solid var(--cu-line); font-size: 11px; }\n.tx-cu-history > div > span:last-of-type { color: var(--cu-muted); font-size: 10px; }\n.tx-cu-history small { width: 100%; overflow-wrap: anywhere; }\n\n/* Sharing and annotation use the same dialog, buttons and spacing. */\n.tx-cu-share-dialog { box-sizing: border-box; width: min(540px, calc(100vw - 32px)); max-height: min(720px, 80vh); overflow: auto; padding: 20px; border: 1px solid var(--cu-line); border-radius: 16px; background: var(--cu-bg); box-shadow: var(--cu-shadow); }\n.tx-cu-share-dialog::backdrop { background: #0005; backdrop-filter: blur(3px); }\n.tx-cu-share-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.tx-cu-share-dialog header strong { font-size: 15px; font-weight: 600; letter-spacing: -.2px; }\n.tx-cu-share-dialog header button { width: 28px; min-height: 28px; padding: 5px; border-color: transparent; background: transparent; color: var(--cu-muted); }\n.tx-cu-share-dialog > p { margin: 8px 0 16px; color: var(--cu-muted); font-size: 12px; line-height: 1.65; }\n.tx-cu-share-list { display: grid; gap: 4px; }\n.tx-cu-share-list button { justify-content: flex-start; gap: 10px; padding: 11px 10px; border-color: transparent; border-radius: 10px; text-align: left; }\n.tx-cu-share-window-icon { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border: 1px solid var(--cu-line); border-radius: 8px; background: var(--cu-soft); color: var(--cu-muted); }\n.tx-cu-share-window-info { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }\n.tx-cu-share-window-info strong { font-size: 12px; font-weight: 500; }\n.tx-cu-share-window-info > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cu-muted); font-size: 11px; }\n.tx-cu-share-list small { white-space: nowrap; color: var(--cu-blue); font-size: 10px; }\n.tx-cu-window-picker { padding: 16px; }\n.tx-cu-window-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--cu-line); border-radius: 8px; padding: 0 8px; margin-bottom: 12px; color: var(--cu-muted); }\n.tx-cu-window-search input { min-width: 0; flex: 1; width: 0; border: 0!important; background: transparent!important; padding: 9px 0!important; }\n.tx-cu-window-search button { border: 0; background: transparent; padding: 5px; }\n.tx-cu-window-picker .tx-cu-share-list { max-height: 45vh; overflow: auto; }\n.tx-cu-share-list button.is-selected { background: var(--cu-tint); }\n.tx-cu-window-picker footer { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--cu-line); }\n.tx-cu-window-picker footer small { color: var(--cu-muted); font-size: 11px; }\n.tx-cu-annotation-modes { display: flex; align-items: center; gap: 4px; font-size: 11px; }\n.tx-cu-annotation-modes button { padding: 5px 10px; border-color: transparent; background: var(--cu-soft); }\n.tx-cu-annotation-modes button[aria-pressed=true] { color: var(--cu-blue); background: var(--cu-tint); }\n.tx-cu-annotation-element { font-size: 11px; padding: 8px 0; overflow-wrap: anywhere; }\n.tx-cu-annotation-element > span { margin-left: 8px; color: var(--cu-muted); }\n.tx-cu-annotation-element pre { max-height: 140px; overflow: auto; white-space: pre-wrap; }\n.tx-cu-annotation-element summary, .tx-cu-style-editor summary { color: var(--cu-muted); cursor: pointer; }\n.tx-cu-style-editor { font-size: 11px; margin: 8px 0; }\n.tx-cu-style-editor > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0; }\n.tx-cu-style-editor label { display: flex; flex-direction: column; gap: 5px; color: var(--cu-muted); }\n.tx-cu-style-editor input { box-sizing: border-box; width: 100%; padding: 6px 8px; }\n.tx-cu-style-editor button { margin-right: 6px; }\n.tx-cu-annotation-outline { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }\n.tx-cu-annotation-outline polygon { stroke: #3877e8; stroke-width: 2px; fill: #3877e81a; }\n.tx-cu-annotation-frame { overflow-wrap: anywhere; }\n.tx-cu-annotation-dialog { width: min(1120px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 0; overflow: hidden; }\n.tx-cu-annotation-dialog[open] { display: flex; flex-direction: column; }\n.tx-cu-annotation-dialog > header { padding: 14px 16px; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-annotation-dialog > header > div { display: flex; align-items: center; gap: 12px; }\n.tx-cu-annotation-dialog > header small { font-size: 11px; color: var(--cu-muted); }\n.tx-cu-annotation-dialog > .tx-cu-annotation-modes { padding: 8px 12px; flex-wrap: wrap; border-bottom: 1px solid var(--cu-line); }\n.tx-cu-annotation-workspace { display: grid; grid-template-columns: minmax(0,1fr) 280px; flex: 1; min-height: 0; overflow: hidden; }\n.tx-cu-annotation-viewport { min-width: 0; min-height: 0; overflow: auto; background: var(--cu-soft); padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; }\n.tx-cu-annotation-surface { position: relative; width: fit-content; max-width: 100%; flex-shrink: 0; margin: 0 auto; touch-action: none; cursor: crosshair; line-height: 0; border-radius: 6px; }\n.tx-cu-annotation-surface img { display: block; max-width: 100%; max-height: min(62vh,calc(100dvh - 230px)); user-select: none; border-radius: 6px; }\n.tx-cu-annotation-inspector { min-height: 0; overflow: auto; padding: 16px; border-left: 1px solid var(--cu-line); }\n.tx-cu-selection-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }\n.tx-cu-selection-heading small, .tx-cu-annotation-hint { color: var(--cu-muted); font-size: 10px; }\n.tx-cu-annotation-hint { padding-top: 12px; }\n.tx-cu-annotation-empty { color: var(--cu-muted); font-size: 12px; line-height: 1.7; }\n.tx-cu-annotation-comment { display: block; margin-top: 16px; font-size: 12px; color: var(--cu-muted); }\n.tx-cu-annotation-comment textarea { margin-top: 8px; }\n.tx-cu-annotation-outline.is-hover polygon { stroke-dasharray: 4 3; fill: transparent; }\n.tx-cu-annotation-region.is-hover { border-style: dashed; background: transparent; }\n.tx-cu-annotation-hover-label { position: absolute; left: 6px; top: 6px; max-width: calc(100% - 12px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--cu-blue); color: #fff; padding: 4px 6px; border-radius: 4px; font-size: 10px; line-height: 14px; pointer-events: none; }\n.tx-cu-annotation-region { position: absolute; box-sizing: border-box; border: 2px solid #3877e8; background: #3877e81a; pointer-events: none; }\n.tx-cu-annotation-dialog textarea { box-sizing: border-box; display: block; width: 100%; min-height: 70px; padding: 10px; resize: vertical; }\n.tx-cu-annotation-dialog footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--cu-line); }\n.tx-cu-annotation-dialog footer > div { display: flex; gap: 8px; }\n.tx-cu-annotation-dialog footer > small { font-size: 11px; color: var(--cu-muted); }\n@media (max-width: 680px) {\n  .tx-cu-share-dialog.tx-cu-annotation-dialog { padding: 0; }\n  .tx-cu-annotation-workspace { display: block; overflow: auto; }\n  .tx-cu-annotation-viewport { padding: 12px; }\n  .tx-cu-annotation-surface img { max-height: 34vh; }\n  .tx-cu-annotation-inspector { border-left: 0; border-top: 1px solid var(--cu-line); overflow: visible; padding: 12px; }\n  .tx-cu-annotation-dialog > header small { display: none; }\n  .tx-cu-image-dialog { width: calc(100vw - 16px); height: calc(100dvh - 16px); }\n  .tx-cu-image-dialog header { padding: 6px 8px; }\n  .tx-cu-image-dialog header > span { width: 100%; justify-content: space-between; }\n  .tx-cu-image-dialog header > div { width: 100%; justify-content: space-between; }\n}\n.tx-cu-user-message { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; min-width: 0; }\n.tx-cu-user-bubble { max-width: 82%; padding: 10px 14px; border-radius: 16px; background: var(--dsw-specific-bubble, var(--cu-tint)); color: var(--cu-text); font-size: 14px; line-height: 22px; white-space: pre-wrap; overflow-wrap: anywhere; }\n.tx-cu-reference { display: inline-flex; align-items: center; gap: 4px; max-width: min(100%, 320px); padding: 1px 5px; border-radius: 5px; background: color-mix(in srgb, var(--cu-blue) 8%, transparent); color: var(--cu-blue); font-size: 12px; line-height: 20px; vertical-align: middle; white-space: nowrap; }\n.tx-cu-reference > svg { flex-shrink: 0; }\n.tx-cu-reference > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }\n.tx-cu-user-actions { display: flex; justify-content: flex-end; gap: 8px; color: var(--dsw-alias-label-tertiary, GrayText); font-size: 12px; }\n.tx-cu-user-actions button { background: transparent; border: 0; padding: 2px 4px; font: inherit; color: inherit; cursor: pointer; }\n.tx-cu-user-attachments { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }\n.tx-cu-user-file { display: flex; align-items: center; gap: 6px; border: 1px solid var(--dsw-alias-border-l3, #dce3ed); padding: 10px; border-radius: 10px; }\n.tx-cu-user-file svg { width: 20px; height: 20px; }\n\n/* Compact multi-target preview. No control actor is attached to these cards. */\n.tx-cu-floating { position: fixed; inset: 0; height: 100dvh; display: flex; flex-direction: column; gap: 5px; padding: 6px; box-sizing: border-box; background: var(--cu-bg); color-scheme: light dark; }\n.tx-cu-floating header, .tx-cu-floating header > div { display: flex; align-items: center; gap: 7px; min-width: 0; }\n.tx-cu-floating header { justify-content: space-between; flex-shrink: 0; min-height: 24px; }\n.tx-cu-floating header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 500; }\n.tx-cu-floating header > div > svg { color: var(--cu-muted); }\n.tx-cu-floating header > div:first-child { flex: 1; overflow: hidden; }\n.tx-cu-floating header strong { min-width: 0; }\n.tx-cu-floating header > div:last-child { flex-shrink: 0; }\n.tx-cu-floating-count { color: var(--cu-muted); font-size: 10px; white-space: nowrap; }\n.tx-cu-floating header button { width: 24px; min-height: 24px; padding: 4px; border-color: transparent; background: transparent; color: var(--cu-muted); }\n.tx-cu-floating header > div:last-child { gap: 1px; }\n.tx-cu-floating .tx-cu-live { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--cu-soft); border-radius: 8px; overflow: hidden; }\n.tx-cu-floating .tx-cu-live-meta { display: none; }\n.tx-cu-floating .tx-cu-live-surface { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }\n.tx-cu-floating .tx-cu-observed-image { position: relative; line-height: 0; width: 100%; height: 100%; }\n.tx-cu-floating .tx-cu-observed-image img { display: block; width: 100%; height: 100%; object-fit: contain; }\n.tx-cu-floating .tx-cu-live-placeholder { min-height: 80px; font-size: 11px; }\n.tx-cu-floating footer { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-shrink: 0; min-height: 24px; font-size: 11px; color: var(--cu-muted); }\n.tx-cu-floating footer > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-floating footer button { min-height: 24px; padding: 3px 6px; font-size: 10px; border-color: transparent; background: transparent; }\n.tx-cu-floating footer .tx-cu-stop { width: 25px; height: 25px; padding: 4px; border-radius: 50%; background: var(--cu-text); color: var(--cu-bg); }\n.tx-cu-floating footer .tx-cu-stop:hover:not(:disabled) { background: color-mix(in srgb, var(--cu-text) 80%, var(--cu-bg)); }\n.tx-cu-floating footer .tx-cu-stop:disabled { color: var(--cu-muted); background: var(--cu-hover); opacity: .55; }\n.tx-cu-floating footer .tx-cu-resume { width: 25px; height: 25px; padding: 4px; border-radius: 50%; background: var(--cu-blue); color: #fff; }\n.tx-cu-floating footer .tx-cu-resume:hover:not(:disabled) { background: #2868d8; }\n.tx-cu-preview-search { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border: 1px solid var(--cu-line); border-radius: 7px; background: var(--cu-bg); color: var(--cu-muted); }\n.tx-cu-preview-search input { width: 0; min-width: 0; flex: 1; border: 0; background: transparent; padding: 4px 0; outline: 0; font: inherit; font-size: 11px; color: var(--cu-text); }\n.tx-cu-preview-search:focus-within { outline: 2px solid var(--cu-blue); outline-offset: -1px; }\n.tx-cu-preview-empty { margin: auto; padding: 16px; color: var(--cu-muted); font-size: 11px; text-align: center; }\n.tx-cu-preview-stack { position: relative; flex: 1; min-height: 0; }\n.tx-cu-preview-card { position: absolute; left: 50%; top: calc(min(var(--preview-depth), 4)*22px); width: min(var(--cu-card-max-width, 400px), calc(var(--cu-card-max-height, 400px)*var(--preview-ratio, 1.7778))); aspect-ratio: var(--preview-ratio, 1.7778); transform: translateX(calc(-50% + (min(var(--preview-count) - 1, 4)/2 - min(var(--preview-depth), 4))*28px)); overflow: hidden; border: 0; border-radius: 6px; background: var(--cu-bg); box-shadow: 0 3px 12px #00000026; }\n.tx-cu-floating .tx-cu-preview-card .tx-cu-live { height: 100%; border: 0; border-radius: 0; }\n.tx-cu-floating .tx-cu-preview-card .tx-cu-observed-image img { max-height: none; }\n.tx-cu-floating .tx-cu-preview-open { position: absolute; inset: 0; width: 100%; padding: 0; border: 0; border-radius: 0; display: flex; align-items: flex-end; justify-content: space-between; background: transparent; color: #fff; text-align: left; }\n.tx-cu-floating .tx-cu-preview-open::before { content: ''; position: absolute; inset: auto 0 0; height: 36px; pointer-events: none; background: linear-gradient(transparent, #111b); opacity: 0; transition: opacity .12s; }\n.tx-cu-floating .tx-cu-preview-open > span { position: relative; display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; font-size: 11px; line-height: 16px; opacity: 0; transition: opacity .12s; }\n.tx-cu-floating .tx-cu-preview-open:hover::before, .tx-cu-floating .tx-cu-preview-open:focus-visible::before,\n.tx-cu-floating .tx-cu-preview-open:hover > span, .tx-cu-floating .tx-cu-preview-open:focus-visible > span { opacity: 1; }\n.tx-cu-preview-open > span:first-child { flex: 1; min-width: 0; }\n.tx-cu-preview-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tx-cu-floating .tx-cu-preview-open:hover:not(:disabled) { background: #ffffff08; }\n.tx-cu-preview-open:focus-visible { outline: 2px solid var(--cu-blue); outline-offset: -2px; }\n.tx-cu-preview-stack:not(.is-expanded) .tx-cu-preview-card:nth-child(n+6) { visibility: hidden; }\n.tx-cu-preview-stack.is-expanded { overflow: auto; display: flex; flex-direction: column; gap: 8px; margin: 0; scrollbar-width: thin; }\n.tx-cu-preview-stack.is-focused { margin: 0; }\n.tx-cu-preview-stack.is-focused .tx-cu-preview-card { visibility: hidden; pointer-events: none; }\n.tx-cu-preview-stack.is-focused .tx-cu-preview-card[data-focused] { visibility: visible; pointer-events: auto; top: 0; left: 50%; transform: translateX(-50%); }\n.tx-cu-preview-stack.is-expanded .tx-cu-preview-card { position: relative; inset: auto; transform: none; flex: 0 0 auto; align-self: center; max-width: 100%; }\n.tx-cu-floating > .tx-cu-error { font-size: 11px; line-height: 1.4; margin: 0; max-height: 48px; overflow: auto; }\n.tx-cu-preview-card .tx-cu-reconnect { position: relative; z-index: 5; }\n.tx-cu-preview-card[data-connection=error], .tx-cu-preview-card[data-connection=closed] { box-shadow: 0 0 0 1px var(--cu-line),0 3px 12px #00000026; }\n.tx-cu-floating-inline { inset: auto; z-index: 30; width: min(400px, calc(100vw - 24px)); height: 289px; max-height: calc(100vh - 24px); padding: 0; background: transparent; border: 0; box-shadow: none; pointer-events: none; }\n.tx-cu-floating-inline > header, .tx-cu-floating-inline > footer { pointer-events: none; opacity: 0; transition: opacity .15s; background: var(--cu-bg); border-radius: 8px; padding: 0 5px; }\n.tx-cu-floating-inline:hover > header, .tx-cu-floating-inline:hover > footer,\n.tx-cu-floating-inline:focus-within > header, .tx-cu-floating-inline:focus-within > footer { opacity: 1; pointer-events: auto; }\n.tx-cu-floating-inline .tx-cu-preview-card, .tx-cu-floating-inline > .tx-cu-error { pointer-events: auto; }\n.tx-cu-floating-inline > .tx-cu-error { background: var(--cu-bg); padding: 5px; border-radius: 6px; }\n.tx-cu-floating-inline { pointer-events: auto; cursor: grab; user-select: none; }\n.tx-cu-floating-inline > header, .tx-cu-floating-inline .tx-cu-preview-open { pointer-events: auto; cursor: grab; touch-action: none; }\n.tx-cu-floating-inline.is-dragging, .tx-cu-floating-inline.is-dragging * { cursor: grabbing; }\n.tx-cu-floating-inline.is-list > header, .tx-cu-floating-inline.is-list > footer { opacity: 1; pointer-events: auto; }\n.tx-cu-floating-inline > .tx-cu-preview-search { pointer-events: auto; }\n/* Keep the observer connected while host @/command menus cover the composer. */\nbody:has([role=listbox]) .tx-cu-floating-inline { visibility: hidden; pointer-events: none; }\n@media (max-width: 700px) {\n  .tx-cu-style-editor > div { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  .tx-cu-share-dialog { padding: 16px; }\n}\n@media (prefers-reduced-motion: reduce) {\n  .tx-cu-assistant-cursor, .tx-cu-card-chevron, .tx-cu-disclosure { transition: none; }\n  .tx-cu-cursor-pulse { animation: none; opacity: .6; }\n}\n\n.tx-cu-turn-outcomes { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }\n.tx-cu-turn-outcomes > span { flex: none; white-space: nowrap; }\n";

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
  const displayedData = (0, import_react4.useRef)(null), receivedFrame = (0, import_react4.useRef)(null);
  const activeStream = (0, import_react4.useRef)(null);
  const stage = (0, import_react4.useRef)(null), meta = (0, import_react4.useRef)(null), [space, setSpace] = (0, import_react4.useState)({ width: 0, height: 0 });
  const [layoutSize, setLayoutSize] = (0, import_react4.useState)(null), layoutResizing = (0, import_react4.useRef)(false);
  const [layoutBusy, setLayoutBusy] = (0, import_react4.useState)(false);
  const setLayoutResizing = (value) => {
    layoutResizing.current = value;
    setLayoutBusy(value);
  };
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
      setLayoutResizing(true);
      try {
        const result = await api2("view-layout", sessionId, { actor: frame.actor, tabId, controlEpoch: state.controlEpoch, size: layoutSize }, controller.signal);
        if (active && result.layout !== "applied") setLayoutResizing(false);
        if (active && result.layout === "deferred") timer = setTimeout(resize, 500);
      } catch (error) {
        if (active) {
          setLayoutResizing(false);
          if (!controller.signal.aborted) callbacks.current.onError(error.message);
        }
      }
    };
    timer = setTimeout(resize, 200);
    return () => {
      active = false;
      setLayoutResizing(false);
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
    receivedFrame.current = null;
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
      receivedFrame.current = next;
      if (current.current?.loaderId && current.current.loaderId !== next.loaderId) current.current.id = void 0;
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
      const observedFrame = receivedFrame.current ?? current.current;
      if (observedFrame?.loaderId && observedFrame.loaderId !== value.loaderId && Number.isFinite(observedFrame.observedAt) && Number.isFinite(value.observedAt) && value.observedAt < observedFrame.observedAt) return;
      navigationObservedAt = value.observedAt ?? 0;
      setCursor(null);
      const loaderId = receivedFrame.current?.loaderId ?? current.current?.loaderId;
      if (loaderId && value.loaderId !== loaderId) {
        receivedFrame.current = null;
        if (current.current) current.current.id = void 0;
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
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tx-cu-live" + (isDevice ? " is-device" : "") + (blank ? " is-blank" : ""), "data-connection": connection, "data-layout-busy": layoutBusy ? "true" : "false", style: isDevice ? { "--cu-device-width": frameWidth * scale + "px", "--cu-preview-height": space.height ? space.height + "px" : void 0 } : void 0, "aria-label": "\u6D4F\u89C8\u5668\u5B9E\u65F6\u753B\u9762" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tx-cu-live-meta", ref: meta }, /* @__PURE__ */ import_react4.default.createElement("span", { className: connection === "live" ? "tx-cu-live-dot" : "" }, connection === "live" ? state?.resuming ? "\u6B63\u5728\u6062\u590D" : state?.status === "running" ? "\u52A9\u624B\u6B63\u5728\u64CD\u4F5C" : state?.status === "stopped" ? "\u4F60\u6B63\u5728\u63A7\u5236" : "\u5C31\u7EEA" : connection === "connecting" ? "\u6B63\u5728\u8FDE\u63A5\u753B\u9762\u2026" : "\u753B\u9762\u5DF2\u65AD\u5F00"), /* @__PURE__ */ import_react4.default.createElement("span", null, state?.status === "stopped" ? "\u53EF\u5728\u5DE5\u5177\u680F\u6062\u590D\u52A9\u624B" : "\u70B9\u51FB\u753B\u9762\u63A5\u7BA1")), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tx-cu-preview-stage", ref: stage }, /* @__PURE__ */ import_react4.default.createElement(DeviceFrame, { enabled: isDevice, interactive: visible && state?.enabled !== false && !state?.transitioning && !state?.resuming && connection === "live" && !dialog && !!onViewportResize, width: frameWidth, height: frameHeight, scale, onResize: onViewportResize, onError }, /* @__PURE__ */ import_react4.default.createElement(
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
      if (receivedFrame.current === frame && current.current?.actor === frame.actor) {
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
  } }, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", ref: trigger, disabled: !visible, "aria-label": "\u4E0B\u8F7D\u8BB0\u5F55", title: "\u4E0B\u8F7D\u8BB0\u5F55", "aria-haspopup": "dialog", "aria-expanded": open, onClick: () => setOpen(!open) }, /* @__PURE__ */ import_react8.default.createElement(ComputerIcon, { name: "download" })), open && visible && /* @__PURE__ */ import_react8.default.createElement("section", { className: "tx-cu-download-panel", role: "dialog", "aria-label": "\u5F53\u524D\u4F1A\u8BDD\u4E0B\u8F7D\u8BB0\u5F55" }, /* @__PURE__ */ import_react8.default.createElement("header", null, /* @__PURE__ */ import_react8.default.createElement("strong", null, "\u4E0B\u8F7D\u8BB0\u5F55"), /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", "aria-label": "\u5173\u95ED\u4E0B\u8F7D\u8BB0\u5F55", onClick: close }, /* @__PURE__ */ import_react8.default.createElement(ComputerIcon, { name: "close", size: 14 }))), /* @__PURE__ */ import_react8.default.createElement("div", { className: "tx-cu-download-filters" }, /* @__PURE__ */ import_react8.default.createElement("input", { type: "search", "aria-label": "\u641C\u7D22\u4E0B\u8F7D\u6587\u4EF6", placeholder: "\u641C\u7D22\u6587\u4EF6\u540D", value: query, onChange: (event) => setQuery(event.target.value) }), /* @__PURE__ */ import_react8.default.createElement("select", { "aria-label": "\u7B5B\u9009\u4E0B\u8F7D\u8BB0\u5F55", value: filter, onChange: (event) => setFilter(event.target.value) }, /* @__PURE__ */ import_react8.default.createElement("option", { value: "all" }, "\u5168\u90E8"), /* @__PURE__ */ import_react8.default.createElement("option", { value: "active" }, "\u8FDB\u884C\u4E2D"), /* @__PURE__ */ import_react8.default.createElement("option", { value: "completed" }, "\u5DF2\u5B8C\u6210"), /* @__PURE__ */ import_react8.default.createElement("option", { value: "canceled" }, "\u5DF2\u53D6\u6D88"))), (error || mutationError) && /* @__PURE__ */ import_react8.default.createElement("p", { role: "alert", className: "tx-cu-error" }, mutationError || error), !items && !error && /* @__PURE__ */ import_react8.default.createElement("p", { role: "status" }, "\u6B63\u5728\u8BFB\u53D6\u2026"), items?.length === 0 && /* @__PURE__ */ import_react8.default.createElement("p", null, "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u4E0B\u8F7D\u8BB0\u5F55"), !!items?.length && filtered.length === 0 && /* @__PURE__ */ import_react8.default.createElement("p", null, "\u6CA1\u6709\u5339\u914D\u7684\u4E0B\u8F7D\u8BB0\u5F55"), !!filtered.length && /* @__PURE__ */ import_react8.default.createElement("ul", null, filtered.map((item) => /* @__PURE__ */ import_react8.default.createElement("li", { key: item.id }, /* @__PURE__ */ import_react8.default.createElement(ComputerIcon, { name: "download" }), /* @__PURE__ */ import_react8.default.createElement("div", null, /* @__PURE__ */ import_react8.default.createElement("strong", { title: item.filename }, item.filename), /* @__PURE__ */ import_react8.default.createElement("small", null, item.state === "completed" ? "\u5DF2\u5B8C\u6210" : item.state === "canceled" ? "\u5DF2\u53D6\u6D88\u6216\u4E2D\u65AD" : item.state === "unobserved" ? "\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u72B6\u6001\u5F85\u786E\u8BA4" : "\u4E0B\u8F7D\u4E2D", " \xB7 ", bytes(item.receivedBytes), item.totalBytes > 0 && item.state === "inProgress" ? " / " + bytes(item.totalBytes) : ""), item.state === "inProgress" && /* @__PURE__ */ import_react8.default.createElement("progress", { "aria-label": item.filename + " \u4E0B\u8F7D\u8FDB\u5EA6", value: item.totalBytes > 0 ? item.receivedBytes : void 0, max: item.totalBytes || 1 }), item.source && /* @__PURE__ */ import_react8.default.createElement("small", null, item.source), item.canDownload ? /* @__PURE__ */ import_react8.default.createElement("a", { href: "trisoul-x/computer-use/download-file?session=" + encodeURIComponent(sessionId) + "&id=" + encodeURIComponent(item.id), download: item.filename }, "\u4FDD\u5B58\u6587\u4EF6") : item.state === "completed" && /* @__PURE__ */ import_react8.default.createElement("small", null, item.browserId === "browser" ? "\u6587\u4EF6\u6682\u4E0D\u53EF\u8BFB\u53D6" : "\u6587\u4EF6\u4FDD\u5B58\u5728\u539F\u6D4F\u89C8\u5668\u7684\u4E0B\u8F7D\u4F4D\u7F6E"))))), /* @__PURE__ */ import_react8.default.createElement("footer", null, /* @__PURE__ */ import_react8.default.createElement("span", null, "\u4EC5\u663E\u793A\u5F53\u524D\u4F1A\u8BDD\u63A5\u5165\u540E\u6355\u83B7\u7684\u4E0B\u8F7D"), /* @__PURE__ */ import_react8.default.createElement("div", null, /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", onClick: () => setReload((value) => value + 1) }, "\u5237\u65B0"), /* @__PURE__ */ import_react8.default.createElement("button", { type: "button", title: "\u79FB\u9664\u5DF2\u5B8C\u6210\u6216\u53D6\u6D88\u7684\u8BB0\u5F55\uFF0C\u4E0D\u5220\u9664\u6587\u4EF6", disabled: clearing || !items?.some((item) => ["completed", "canceled"].includes(item.state)), onClick: () => void clear() }, clearing ? "\u6B63\u5728\u6E05\u9664\u2026" : "\u6E05\u9664\u5DF2\u7ED3\u675F\u8BB0\u5F55")))));
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
  const addressObservation = (0, import_react10.useRef)(0), pendingFocus = (0, import_react10.useRef)(null);
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
  (0, import_react10.useLayoutEffect)(() => {
    addressObservation.current = 0;
    editing.current = false;
    setAddress(target?.url === "about:blank" ? "" : target?.url ?? "");
    const keyboard = target && keyboardTarget.current === target.id;
    pendingFocus.current = target && (keyboard || target.url === "about:blank") ? { id: target.id, keyboard } : null;
    if (keyboard) keyboardTarget.current = null;
  }, [sessionId, target?.id]);
  (0, import_react10.useLayoutEffect)(() => {
    const focus = pendingFocus.current;
    if (!focus || focus.id !== target?.id || !visible || busy || state?.transitioning || state?.resuming || state?.enabled === false) return;
    const element = focus.keyboard ? tabList.current?.querySelector('[aria-selected="true"]') : addressInput.current;
    if (element && !element.disabled) {
      element.focus();
      pendingFocus.current = null;
    }
  }, [target?.id, visible, busy, state?.transitioning, state?.resuming, state?.enabled, tabs.length]);
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

// src/client/slot-decoration.mjs
var decoration = Symbol.for("opencu.slot-decoration.v1");
function decorateSlot(slots, name, accepts, decorate) {
  const layer = Symbol(), installed = /* @__PURE__ */ new Map();
  let reconciling = false, dirty = false, stopped = false;
  function reconcile() {
    if (stopped || slots.ctx?.fiber?.uid === null) return;
    if (reconciling) {
      dirty = true;
      return;
    }
    reconciling = true;
    try {
      do {
        dirty = false;
        const entries = slots.entries(name), live = new Set(entries), originals = /* @__PURE__ */ new Map();
        for (const entry of entries) {
          const meta = entry.component[decoration], key = entry.options.key;
          if (!accepts(key) || meta && (meta.layers.includes(layer) || !live.has(meta.root))) continue;
          if (!originals.has(key)) originals.set(key, entry);
        }
        for (const [key, current] of installed) if (originals.get(key) !== current.original) {
          installed.delete(key);
          current.dispose();
        }
        for (const [key, original] of originals) if (!installed.has(key)) {
          const { options, component } = decorate(original);
          const meta = original.component[decoration];
          component[decoration] = { root: meta?.root || original, layers: [...meta?.layers || [], layer] };
          const dispose = slots.register(options, component);
          installed.set(key, { original, dispose });
        }
      } while (dirty && !stopped);
    } finally {
      reconciling = false;
    }
  }
  const unsubscribe = slots.subscribe(name, reconcile);
  reconcile();
  return () => {
    stopped = true;
    unsubscribe();
    for (const value of [...installed.values()].reverse()) value.dispose();
    installed.clear();
  };
}

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
  ctx.slots.inject("conversation.chat.node", () => decorateSlot(ctx.slots, "conversation.chat.node", (key) => ["user", "steering"].includes(key), (original) => {
    const Original = original.component;
    function WithComputerReferences(props) {
      const text = (props.node.data.content ?? []).filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
      const parts = segments(text);
      return parts.some((p) => p.reference) ? /* @__PURE__ */ import_react11.default.createElement(ReferenceMessage, { ...props, parts }) : /* @__PURE__ */ import_react11.default.createElement(Original, { ...props });
    }
    return { options: { name: "conversation.chat.node", key: original.options.key, locale: "chat", priority: (original.options.priority ?? 0) - 1 }, component: WithComputerReferences };
  }));
}

// src/client/computer-groups.jsx
var import_react12 = __toESM(require("react"), 1);

// src/client/computer-groups.mjs
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
function summarizeToolOutcomes(data) {
  const seen = /* @__PURE__ */ new Set();
  let failures = 0, stopped = 0;
  function visit(block) {
    if (!block || seen.has(block.callId)) return;
    seen.add(block.callId);
    const state = operationState(block);
    if (state === "error") failures++;
    if (state === "stopped") stopped++;
    for (const child of block.subCalls ?? []) visit(child);
  }
  for (const item of data) visit(item.root);
  return { failures, stopped };
}

// src/client/computer-groups.jsx
function computerGroupPresentation(ctx) {
  ctx.slots.inject("conversation.chat.node", () => decorateSlot(ctx.slots, "conversation.chat.node", (key) => key === "turn-process", (original) => {
    const Original = original.component;
    function ProcessOutcomes(props) {
      const nodes = props.useChat((state) => state.nodes);
      const source = nodes.turnDataSource(props.node.data.turn, "tool-call");
      const data = (0, import_react12.useSyncExternalStore)(source.subscribe, source.getSnapshot);
      const { failures, stopped } = summarizeToolOutcomes(data);
      return /* @__PURE__ */ import_react12.default.createElement("span", { className: "tx-cu-turn-outcomes" }, /* @__PURE__ */ import_react12.default.createElement(Original, { ...props }), failures > 0 && /* @__PURE__ */ import_react12.default.createElement("span", { className: "tx-cu-error" }, failures, " \u9879\u5931\u8D25"), stopped > 0 && /* @__PURE__ */ import_react12.default.createElement("span", null, stopped, " \u9879\u5DF2\u505C\u6B62"));
    }
    return { options: { ...original.options, name: "conversation.chat.node", locale: original.locale, inject: original.inject, store: original.store, children: original.children, priority: (original.options.priority ?? 0) - 1 }, component: ProcessOutcomes };
  }));
  ctx.slots.inject("tool.call.toolview", () => decorateSlot(ctx.slots, "tool.call.toolview", () => true, (original) => {
    const Original = original.component;
    function ToolPresentation(props) {
      const images = (name, owner) => {
        if (name !== "tool.call.images") throw new Error("Unsupported tool image slot: " + name);
        return /* @__PURE__ */ import_react12.default.createElement("div", { className: "tx-cu-result-images" }, owner.images.map((item, index) => item.attachment ? /* @__PURE__ */ import_react12.default.createElement(SavedImage, { key: index, attachment: item.attachment, loadImage: owner.loadImage }) : null));
      };
      return /* @__PURE__ */ import_react12.default.createElement(Original, { ...props, ...props.t ? { t: operationRowLocale(props.t, props.toolName, props.block) } : {}, ...original.children?.["tool.call.images"] ? { renderSlot: images } : {} });
    }
    const { children, ...options } = original.options;
    return { options: { ...options, name: "tool.call.toolview", locale: original.locale, inject: original.inject, store: original.store, children: void 0, priority: (options.priority ?? 0) - 1 }, component: ToolPresentation };
  }));
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
  return /* @__PURE__ */ import_react13.default.createElement("section", { className: "tx-cu-setup" }, /* @__PURE__ */ import_react13.default.createElement("button", { className: "tx-cu-setup-toggle", type: "button", "aria-expanded": open, "aria-controls": panelId, onClick: () => setOpen((value) => !value) }, /* @__PURE__ */ import_react13.default.createElement("span", null, /* @__PURE__ */ import_react13.default.createElement(ComputerIcon, { name: "settings", size: 14 }), "\u8FD0\u884C\u73AF\u5883\u4E0E\u6743\u9650"), /* @__PURE__ */ import_react13.default.createElement(ComputerIcon, { className: "tx-cu-disclosure", name: "chevron", size: 12 })), open && /* @__PURE__ */ import_react13.default.createElement("div", { id: panelId }, (error || loadError) && /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-error", role: "alert" }, error || loadError), !setup ? /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-muted", role: "status" }, "\u6B63\u5728\u68C0\u67E5\u8FD0\u884C\u73AF\u5883\u2026") : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "\u5185\u7F6E\u6D4F\u89C8\u5668"), /* @__PURE__ */ import_react13.default.createElement("p", null, setup.browser.name, " \xB7 \u72EC\u7ACB\u5DE5\u4F5C\u914D\u7F6E")), /* @__PURE__ */ import_react13.default.createElement("span", { className: setup.browser.installed ? "is-ready" : "is-needed" }, setup.browser.installed ? "\u5DF2\u5B89\u88C5" : "\u5F85\u5B89\u88C5")), !setup.browser.installed && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-install" }, /* @__PURE__ */ import_react13.default.createElement("p", null, "\u81EA\u52A8\u4E0B\u8F7D\u914D\u5957\u6D4F\u89C8\u5668\uFF0C\u65E0\u9700\u8FD0\u884C\u547D\u4EE4\u3002"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy, onClick: () => act("install-browser") }, busy === "install-browser" ? "\u6B63\u5728\u5B89\u88C5\u6D4F\u89C8\u5668\u2026" : "\u5B89\u88C5\u6D4F\u89C8\u5668")), /* @__PURE__ */ import_react13.default.createElement("details", { className: "tx-cu-setup-advanced" }, /* @__PURE__ */ import_react13.default.createElement("summary", null, "\u6D4F\u89C8\u5668\u8BE6\u60C5"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u7F51\u9875\u767B\u5F55\u4FDD\u5B58\u5728\u72EC\u7ACB\u914D\u7F6E\u4E2D\u3002", setup.extension?.installation?.platform === "darwin" && "\u9996\u6B21\u4F7F\u7528\u53EF\u80FD\u9700\u8981\u5728 macOS \u7CFB\u7EDF\u63D0\u793A\u4E2D\u5141\u8BB8\u6D4F\u89C8\u5668\u8BBF\u95EE\u94A5\u5319\u4E32\u3002"), /* @__PURE__ */ import_react13.default.createElement("code", null, setup.browser.path)), /* @__PURE__ */ import_react13.default.createElement(ChromeSetup, { extension: setup.extension, busy, act, onError: setError }), !native.supported ? /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-muted" }, "\u6B64\u7CFB\u7EDF\u7248\u672C\u5C1A\u4E0D\u652F\u6301\u539F\u751F\u5E94\u7528\u63A7\u5236\u3002\u6D4F\u89C8\u5668\u529F\u80FD\u53EF\u5355\u72EC\u4F7F\u7528\u3002") : !native.installed ? /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-install" }, /* @__PURE__ */ import_react13.default.createElement("strong", null, "\u5B89\u88C5\u684C\u9762\u63A7\u5236"), /* @__PURE__ */ import_react13.default.createElement("p", null, native.platform === "win32" ? "Windows \u5F00\u53D1\u7248\u91C7\u7528\u524D\u53F0\u64CD\u63A7\uFF0C\u5B89\u88C5\u65F6\u4F1A\u5728\u672C\u673A\u7F16\u8BD1\uFF0C\u9700\u8981 .NET 10 SDK\u3002\u8BF7\u4FDD\u6301\u684C\u9762\u89E3\u9501\uFF1B\u9F20\u6807\u6216\u952E\u76D8\u4ECB\u5165\u4F1A\u505C\u6B62\u52A9\u624B\u3002" : "\u5B89\u88C5 Oh My DSH Computer Use \u540E\uFF0C\u53EF\u9009\u62E9\u5E76\u64CD\u4F5C Mac \u5E94\u7528\u3002\u5F53\u524D\u5F00\u53D1\u7248\u4F1A\u5728\u672C\u673A\u7F16\u8BD1\uFF0C\u9700\u8981 Apple Command Line Tools\uFF1B\u53D1\u884C\u7248\u5B89\u88C5\u5305\u5C1A\u672A\u63D0\u4F9B\u3002"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || native.installing, onClick: () => act("install-native") }, busy === "install-native" || native.installing ? "\u6B63\u5728\u7F16\u8BD1\u5E76\u5B89\u88C5\u2026" : "\u5B89\u88C5\u684C\u9762\u63A7\u5236")) : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, (native.updateAvailable || native.restartRequired || native.repairRequired) && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-install" }, /* @__PURE__ */ import_react13.default.createElement("strong", null, native.repairRequired ? "\u684C\u9762\u63A7\u5236\u9700\u8981\u4FEE\u590D" : native.updateAvailable ? "\u684C\u9762\u63A7\u5236\u6709\u66F4\u65B0" : "\u684C\u9762\u63A7\u5236\u9700\u8981\u91CD\u542F"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u4F1A\u6682\u505C\u5F53\u524D\u684C\u9762\u64CD\u4F5C\uFF0C\u5B8C\u6210\u540E\u8BF7\u91CD\u65B0\u9009\u62E9\u5E94\u7528\u3002"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || native.installing, onClick: () => act("install-native") }, busy === "install-native" || native.installing ? "\u6B63\u5728\u66F4\u65B0\u684C\u9762\u63A7\u5236\u2026" : native.repairRequired ? "\u4FEE\u590D\u684C\u9762\u63A7\u5236" : native.updateAvailable ? "\u66F4\u65B0\u684C\u9762\u63A7\u5236" : "\u91CD\u542F\u684C\u9762\u63A7\u5236")), native.platform === "win32" ? /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "Windows \u684C\u9762"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u524D\u53F0\u64CD\u63A7\uFF1B\u4FDD\u6301\u684C\u9762\u89E3\u9501\uFF0C\u9F20\u6807\u6216\u952E\u76D8\u4ECB\u5165\u4F1A\u505C\u6B62\u52A9\u624B\u3002")), /* @__PURE__ */ import_react13.default.createElement("span", { className: native.interactive ? "is-ready" : "is-needed" }, native.interactive ? "\u53EF\u7528" : "\u5F53\u524D\u4E0D\u53EF\u7528")), /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-row" }, /* @__PURE__ */ import_react13.default.createElement("div", null, /* @__PURE__ */ import_react13.default.createElement("strong", null, "\u7A97\u53E3\u6355\u83B7"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u5411\u52A9\u624B\u63D0\u4F9B\u6240\u9009\u5E94\u7528\u7684\u753B\u9762")), /* @__PURE__ */ import_react13.default.createElement("span", { className: native.captureSupported ? "is-ready" : "is-needed" }, native.captureSupported ? "\u53EF\u7528" : "\u5F53\u524D\u4E0D\u53EF\u7528"))) : /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement(Permission, { title: "\u8F85\u52A9\u529F\u80FD", detail: "\u8BFB\u53D6\u5E94\u7528\u63A7\u4EF6\u5E76\u64CD\u4F5C\u6240\u9009\u7A97\u53E3", value: native.accessibility }), /* @__PURE__ */ import_react13.default.createElement(Permission, { title: "\u5C4F\u5E55\u5F55\u5236", detail: "\u5411\u52A9\u624B\u63D0\u4F9B\u6240\u9009\u5E94\u7528\u7684\u753B\u9762", value: native.screenRecording })), native.error && /* @__PURE__ */ import_react13.default.createElement("p", { className: "tx-cu-error", role: "alert" }, native.error), native.platform !== "win32" && /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-actions" }, /* @__PURE__ */ import_react13.default.createElement("span", { className: "tx-cu-muted" }, "\u7CFB\u7EDF\u8BBE\u7F6E\u4E2D\u7684\u5E94\u7528\u540D\u79F0\uFF1A", native.displayName ?? "Oh My DSH Computer Use"), /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy, onClick: () => act("permissions") }, busy === "permissions" ? "\u6B63\u5728\u6253\u5F00\u2026" : "\u6253\u5F00\u6743\u9650\u8BBE\u7F6E")), /* @__PURE__ */ import_react13.default.createElement("details", { className: "tx-cu-setup-advanced" }, /* @__PURE__ */ import_react13.default.createElement("summary", null, "\u684C\u9762\u63A7\u5236\u7248\u672C"), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u5DF2\u5B89\u88C5 ", native.version ?? "\u672A\u77E5", native.runningVersion && native.runningVersion !== native.version ? ` \xB7 \u6B63\u5728\u8FD0\u884C ${native.runningVersion}` : ""), native.removable && /* @__PURE__ */ import_react13.default.createElement(import_react13.default.Fragment, null, /* @__PURE__ */ import_react13.default.createElement("div", { className: "tx-cu-setup-actions" }, /* @__PURE__ */ import_react13.default.createElement("button", { type: "button", disabled: !!busy || native.installing || native.removing, onClick: () => act("remove-native") }, busy === "remove-native" || native.removing ? "\u6B63\u5728\u79FB\u9664\u684C\u9762\u63A7\u5236\u2026" : "\u79FB\u9664\u684C\u9762\u63A7\u5236")), /* @__PURE__ */ import_react13.default.createElement("p", null, "\u79FB\u9664\u4F1A\u505C\u6B62\u684C\u9762\u64CD\u63A7\u4E0E\u9884\u89C8\uFF0C\u5E94\u7528\u7A97\u53E3\u548C\u7528\u6237\u6587\u4EF6\u4FDD\u7559\u3002\u9700\u8981\u65F6\u53EF\u91CD\u65B0\u5B89\u88C5\u3002")))))));
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
    const r = await fetch("trisoul-x/computer-use/" + op + "?session=" + encodeURIComponent(sessionId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value), signal });
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
  const owned = (0, import_react15.useRef)(null), generation = (0, import_react15.useRef)(0), floating = (0, import_react15.useRef)(null), manual = (0, import_react15.useRef)(null), drag = (0, import_react15.useRef)(null), suppressClick = (0, import_react15.useRef)(false), layout = (0, import_react15.useRef)(null);
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
    suppressClick.current = false;
    const control = event.target.closest('button,a,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="button"]');
    if (popup || event.button !== 0 || event.isPrimary === false || control && !control.matches(".tx-cu-preview-open:not(:disabled)")) return;
    const box = floating.current?.getBoundingClientRect();
    if (!box) return;
    const element = control ?? event.target.closest("header") ?? event.currentTarget;
    if (!control) event.preventDefault();
    element.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, element, x: event.clientX, y: event.clientY, left: box.left, top: box.top };
  };
  const moveDrag = (event) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) < 3 && !suppressClick.current) return;
    suppressClick.current = true;
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
  return /* @__PURE__ */ import_react15.default.createElement(import_react15.default.Fragment, null, !!targets.length && /* @__PURE__ */ import_react15.default.createElement("button", { type: "button", disabled: state?.enabled === false, onClick: () => setShown(true), "aria-label": "\u60AC\u6D6E\u9884\u89C8", "aria-expanded": shown, title: "\u5728\u5BF9\u8BDD\u4E2D\u663E\u793A\u64CD\u63A7\u753B\u9762" }, /* @__PURE__ */ import_react15.default.createElement(ComputerIcon, { name: "preview", size: 14 })), shown && state?.enabled !== false && targets.length > 0 && (0, import_react_dom2.createPortal)(/* @__PURE__ */ import_react15.default.createElement("div", { ref: popup ? null : floating, className: "tx-cu-floating" + (popup ? "" : " tx-cu-floating-inline") + (zoomed ? " is-zoomed" : "") + (dragging ? " is-dragging" : "") + (expanded && !zoomed ? " is-list" : ""), style: popup ? { "--cu-card-max-width": position["--cu-card-max-width"], "--cu-card-max-height": position["--cu-card-max-height"] } : position, "aria-label": "\u60AC\u6D6E\u64CD\u63A7\u9884\u89C8", onKeyDown: previewKey, onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: finishDrag, onPointerCancel: finishDrag, onLostPointerCapture: finishDrag, onClickCapture: (event) => {
    if (suppressClick.current && event.detail !== 0) {
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  } }, /* @__PURE__ */ import_react15.default.createElement("header", { onDoubleClick: (event) => {
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
var base = "trisoul-x/computer-use/";
var url = (op, id) => base + op + "?session=" + encodeURIComponent(id);
async function api(op, id, value, signal) {
  const r = await fetch(url(op, id), value === void 0 ? { signal } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value), signal });
  const body = await r.json();
  if (!r.ok) throw Object.assign(new Error(body.error ?? "Computer Use \u8BF7\u6C42\u5931\u8D25"), { code: body.code });
  if (value !== void 0 && body.status) window.dispatchEvent(new CustomEvent("trisoul-cu-state", { detail: { id, state: body } }));
  return body;
}
var statePoolKey = Symbol.for("opencu.state-pool.v1");
var statePool = globalThis[statePoolKey] ||= createComputerStatePool({ read: (id, signal) => api("state", id, void 0, signal) });
function useStateView(id, visible = true) {
  const subscribe = (0, import_react17.useCallback)((listener) => id && visible ? statePool.subscribe(id, listener) : () => {
  }, [id, visible]);
  const snapshot = (0, import_react17.useCallback)(() => statePool.snapshot(visible ? id : null), [id, visible]);
  const { state, error: connectionError, eventRevision } = (0, import_react17.useSyncExternalStore)(subscribe, snapshot);
  const [error, setError] = (0, import_react17.useState)("");
  const setState = (0, import_react17.useCallback)((value) => {
    statePool.publish(id, value);
    setError("");
  }, [id]);
  (0, import_react17.useEffect)(() => {
    setError("");
  }, [id, visible, eventRevision]);
  return { state, error: error || connectionError, setState, setError };
}
var ScreenIcon = () => /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "screen", size: 17 });
var names = { running: "\u6B63\u5728\u64CD\u4F5C", idle: "\u5C31\u7EEA", stopped: "\u5DF2\u505C\u6B62", stopping: "\u6B63\u5728\u505C\u6B62", error: "\u9700\u8981\u5904\u7406" };
function ComputerChip({ sessionId, onOpen, onPresentation, inputActions, conversation }) {
  const { state, setState, setError, error } = useStateView(sessionId);
  const previewAnchor = (0, import_react17.useRef)(null);
  const presentationHandler = (0, import_react17.useRef)(onPresentation);
  presentationHandler.current = onPresentation;
  (0, import_react17.useEffect)(() => {
    const request = state?.presentationRequest;
    if (!request || request.sessionId !== sessionId) return;
    let live = true;
    void Promise.resolve().then(() => {
      if (live) return presentationHandler.current(request);
    }).then((applied) => live && applied !== false && api("presentation-ack", sessionId, { id: request.id, visible: request.visible }), (error2) => live && api("presentation-ack", sessionId, { id: request.id, visible: request.visible, error: error2.message })).catch((error2) => {
      if (live) setError(error2.message);
    });
    return () => {
      live = false;
    };
  }, [sessionId, state?.presentationRequest?.id]);
  if (!sessionId || state?.enabled === false) return null;
  const active = !!state?.target && (state.status === "running" || state.status === "stopping" || state.status === "error" || state.transitioning);
  return /* @__PURE__ */ import_react17.default.createElement("div", { ref: previewAnchor, "data-cu-session": sessionId, className: "tx-cu-chip", title: error || void 0 }, /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", className: "tx-cu-entry", "aria-label": "\u6253\u5F00 Computer Use", title: "\u67E5\u770B\u548C\u64CD\u4F5C\u5E94\u7528\u3001\u7F51\u9875", onClick: onOpen }, /* @__PURE__ */ import_react17.default.createElement(ScreenIcon, null), /* @__PURE__ */ import_react17.default.createElement("span", null, "\u7535\u8111")), /* @__PURE__ */ import_react17.default.createElement(FloatingPreview, { sessionId, state, url, api, onState: setState, onError: setError, anchor: previewAnchor, onOpen }), /* @__PURE__ */ import_react17.default.createElement(WindowShare, { sessionId, inputActions, conversation }), state?.vision?.input === "text" && /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-vision-warning", title: "\u5F53\u524D\u6A21\u578B\u4EC5\u63A5\u6536\u6587\u5B57\uFF0C\u622A\u56FE\u4E0D\u4F1A\u9001\u5165\u6A21\u578B\u3002" }, "\u4EC5\u6587\u672C\u6A21\u578B"), state?.target && /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-chip-status" }, state.resuming ? "\u6B63\u5728\u6062\u590D" : state.transitioning ? "\u6B63\u5728\u8F7D\u5165" : names[state.status]), active && /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", title: "\u505C\u6B62\u64CD\u4F5C", "aria-label": "\u505C\u6B62\u64CD\u4F5C", disabled: state.status === "stopping", onClick: () => api("stop", sessionId, {}).then(setState).catch((e) => setError(e.message)) }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "stop", size: 13 })), state?.status === "stopped" && !state.transitioning && /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", className: "tx-cu-chip-resume", onClick: () => api("resume", sessionId, {}).then(setState).catch((e) => setError(e.message)) }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "play", size: 12 }), "\u6062\u590D\u63A7\u5236"));
}
function ComputerPane({ sessionId, useTabInfo, inputActions, conversation, hostBrowserAvailable = false }) {
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
  const previewUrl = hostPreviewUrl(target, navigation);
  const browserActions = target?.kind === "tab" ? /* @__PURE__ */ import_react17.default.createElement(import_react17.default.Fragment, null, hostBrowserAvailable && previewUrl && /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", "aria-label": "\u5728\u5B98\u65B9\u6D4F\u89C8\u5668\u4E2D\u9884\u89C8", title: "\u7528\u5B98\u65B9\u6D4F\u89C8\u5668\u6253\u5F00\u72EC\u7ACB\u9884\u89C8\uFF1B\u4E0D\u4F1A\u6539\u53D8\u52A9\u624B\u63A7\u5236\u7684\u7F51\u9875", onClick: () => {
    try {
      openHostBrowserPreview(tab.actions, previewUrl);
    } catch (error2) {
      setError(error2.message);
    }
  } }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "browser", size: 15 })), /* @__PURE__ */ import_react17.default.createElement(PageAnnotation, { compact: true, sessionId, frame: state.enabled ? frame : null, target, inputActions, conversation, api }), state?.target && target.id !== state.target.id && /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", "aria-label": "\u67E5\u770B\u52A9\u624B\u5F53\u524D\u753B\u9762", title: "\u67E5\u770B\u52A9\u624B\u5F53\u524D\u753B\u9762", onClick: () => act("view-tab", { current: true }) }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "return", size: 15 })), state?.status === "stopped" && !state?.transitioning ? /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", className: "is-resume", "aria-label": "\u6062\u590D\u52A9\u624B\u63A7\u5236", title: "\u6062\u590D\u52A9\u624B\u63A7\u5236", disabled: busy, onClick: () => act("resume") }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "play", size: 14 })) : /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", "aria-label": "\u505C\u6B62\u5E76\u63A5\u7BA1", title: "\u505C\u6B62\u5E76\u63A5\u7BA1", disabled: busy || state?.status === "stopping", onClick: () => act("stop") }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "stop", size: 14 }))) : null;
  return /* @__PURE__ */ import_react17.default.createElement("div", { "data-cu-session": sessionId, "data-cu-target": target?.id, className: "tx-cu-pane" + (target?.kind === "tab" ? " tx-cu-pane-browser" : "") }, target?.kind !== "tab" && /* @__PURE__ */ import_react17.default.createElement("header", null, /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-pane-heading" }, /* @__PURE__ */ import_react17.default.createElement(ScreenIcon, null), /* @__PURE__ */ import_react17.default.createElement("div", null, /* @__PURE__ */ import_react17.default.createElement("strong", null, "Computer Use"), /* @__PURE__ */ import_react17.default.createElement("span", { className: "tx-cu-status " + (state?.status === "running" ? "is-running" : "") }, state?.resuming ? "\u6B63\u5728\u6062\u590D" : state?.transitioning ? "\u6B63\u5728\u8F7D\u5165" : names[state?.status] ?? "\u8FDE\u63A5\u4E2D"))), state?.target && target?.id !== state.target.id && /* @__PURE__ */ import_react17.default.createElement("button", { type: "button", onClick: () => act("view-tab", { current: true }) }, "\u67E5\u770B\u52A9\u624B\u5F53\u524D\u753B\u9762"), /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-toolbar" }, target?.kind === "tab" && /* @__PURE__ */ import_react17.default.createElement(PageAnnotation, { sessionId, frame: state.enabled ? frame : null, target, inputActions, conversation, api }), " ", state?.status === "stopped" && !state?.transitioning ? /* @__PURE__ */ import_react17.default.createElement("button", { className: "tx-cu-primary", onClick: () => act("resume") }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "play", size: 12 }), "\u6062\u590D\u52A9\u624B\u63A7\u5236") : target && /* @__PURE__ */ import_react17.default.createElement("button", { className: "tx-cu-stop", disabled: busy, onClick: () => act("stop") }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, { name: "stop", size: 12 }), "\u505C\u6B62\u5E76\u63A5\u7BA1"))), state?.vision?.input === "text" && /* @__PURE__ */ import_react17.default.createElement("p", { className: "tx-cu-vision-warning", role: "status" }, state.vision.name, " \u5F53\u524D\u4EC5\u63A5\u6536\u6587\u5B57\uFF0C\u622A\u56FE\u4E0D\u4F1A\u9001\u5165\u6A21\u578B\u3002\u9700\u8981\u770B\u56FE\u65F6\uFF0C\u8BF7\u5728\u8F93\u5165\u533A\u5207\u6362\u652F\u6301\u56FE\u7247\u7684\u6A21\u578B\uFF1B\u5E94\u7528\u63A7\u4EF6\u6587\u5B57\u4ECD\u53EF\u8BFB\u53D6\u3002"), !target && /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-empty" }, /* @__PURE__ */ import_react17.default.createElement(ScreenIcon, null), /* @__PURE__ */ import_react17.default.createElement("h3", null, "\u8BA9\u52A9\u624B\u64CD\u4F5C\u5E94\u7528\u548C\u7F51\u9875"), /* @__PURE__ */ import_react17.default.createElement("p", null, "\u5728\u5BF9\u8BDD\u4E2D\u7528 @ \u9009\u62E9\u5E94\u7528\u6216\u7F51\u9875\uFF0C", /* @__PURE__ */ import_react17.default.createElement("br", null), "\u4E5F\u53EF\u4EE5\u6253\u5F00\u6D4F\u89C8\u5668\u5F00\u59CB\u5DE5\u4F5C\u3002")), /* @__PURE__ */ import_react17.default.createElement(BrowserControls, { ref: controls, sessionId, state, visible: tab.visible, navigation, frame, api, onState: setState, onError: setError, previewScale, onPreviewScale: setPreviewScale, onDeviceModeChange: setDeviceMode, actions: browserActions }), target && target.kind !== "tab" && /* @__PURE__ */ import_react17.default.createElement("p", { className: "tx-cu-target" }, /* @__PURE__ */ import_react17.default.createElement(ComputerIcon, null), target.name ?? "\u5F53\u524D\u5E94\u7528"), (error || state?.lastError) && /* @__PURE__ */ import_react17.default.createElement("p", { className: "tx-cu-error", role: "alert" }, error || state.lastError.message), target?.kind === "tab" ? /* @__PURE__ */ import_react17.default.createElement(BrowserPreview, { key: target.id, sessionId, tabId: target.id, pageUrl: navigation?.tabId === target.id ? navigation.url : target.url, visible: tab.visible, state, api, url, onState: setState, onError: setError, onNavigation: setNavigation, onFrame: setFrame, onBrowserShortcut: (action) => controls.current?.shortcut(action), onViewportResize: (size) => controls.current?.resizeViewport(size), deviceMode, previewScale }) : target?.kind === "app" ? /* @__PURE__ */ import_react17.default.createElement(NativePreview, { key: target.viewId, sessionId, targetId: target.viewId, visible: tab.visible, state, url, onError: setError }) : null, /* @__PURE__ */ import_react17.default.createElement("div", { className: "tx-cu-pane-support" }, /* @__PURE__ */ import_react17.default.createElement(ComputerSetup, { sessionId, visible: tab.visible, api }), !!state?.history?.length && /* @__PURE__ */ import_react17.default.createElement("details", { className: "tx-cu-history" }, /* @__PURE__ */ import_react17.default.createElement("summary", null, "\u6700\u8FD1\u64CD\u4F5C \xB7 ", state.history.length), state.history.slice().reverse().map((h, i) => /* @__PURE__ */ import_react17.default.createElement("div", { key: i }, /* @__PURE__ */ import_react17.default.createElement("span", { className: h.ok || h.cancelled ? "" : "tx-cu-error" }, h.operation, h.cancelled ? " \xB7 \u5DF2\u53D6\u6D88" : ""), /* @__PURE__ */ import_react17.default.createElement("span", null, h.elapsedMs, " ms"), h.error && /* @__PURE__ */ import_react17.default.createElement("small", null, h.error))))));
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
    const open = () => openPanel ? openPanel("computer") : ctx.sidebarRight.openTab("trisoul-x-computer-use");
    const present = async (request) => {
      const latest = await api("state", props.sessionId);
      const active = () => document.visibilityState === "visible" && [...document.querySelectorAll(".tx-cu-chip")].some((node) => node.dataset.cuSession === props.sessionId && node.getClientRects().length > 0);
      if (latest.presentationRequest?.id !== request.id || Date.now() >= request.expiresAt || !active()) return false;
      const visible = () => [...document.querySelectorAll(".tx-cu-pane-browser")].some((node) => node.dataset.cuSession === props.sessionId && node.dataset.cuTarget === request.tabId && node.getClientRects().length > 0 && node.getBoundingClientRect().width > 0);
      if (request.visible) open();
      else if (visible() && ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded();
      const end = Date.now() + 1800;
      while (active() && visible() !== request.visible && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 30));
      if (!active()) return false;
      if (visible() !== request.visible) throw new Error("\u5F53\u524D DSH \u9875\u9762\u672A\u80FD\u5207\u6362\u6D4F\u89C8\u5668\u9884\u89C8\u663E\u793A\u72B6\u6001\u3002");
    };
    return /* @__PURE__ */ import_react17.default.createElement(ComputerChip, { ...props, conversation: ctx.get("conversation"), onOpen: open, onPresentation: present });
  }
  function StandaloneEntry(props) {
    const options = useOptions();
    return options.integrated ? null : /* @__PURE__ */ import_react17.default.createElement(ComputerEntry, { ...props });
  }
  ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({ name: "conversation.composer.dock", id: "trisoul-computer-use", order: 25 }, StandaloneEntry));
  const id = "trisoul_x/trisoul-x-computer-use";
  ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind: "trisoul-x-computer-use", title: () => "Computer Use", guide: [{ order: 6, title: () => "Computer Use", description: () => "\u67E5\u770B\u753B\u9762\u3001\u505C\u6B62\u64CD\u4F5C\u4E0E\u63A5\u7BA1\u63A7\u5236", icon: ScreenIcon }] }));
  const browserSubscribe = (listener) => ctx.sidebarRightTabs.subscribe(listener);
  const browserSnapshot = () => ctx.sidebarRightTabs.get("browser")?.id === HOST_BROWSER_ID;
  function HostComputerPane(props) {
    const available = (0, import_react17.useSyncExternalStore)(browserSubscribe, browserSnapshot);
    return /* @__PURE__ */ import_react17.default.createElement(ComputerPane, { ...props, conversation: ctx.get("conversation"), hostBrowserAvailable: available });
  }
  function Pane(props) {
    const { renderPane } = useOptions();
    return renderPane ? renderPane(props) : /* @__PURE__ */ import_react17.default.createElement(HostComputerPane, { ...props });
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
  return { ComputerEntry, ComputerPane: HostComputerPane };
}
var sharedKey = Symbol.for("opencu.client.v1");
var nativeChat = createChat(require);
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
    shared.fiber = root.plugin({ name: "opencu-ui", inject: ["slots", "sidebarRightTabs", "sidebarRight", ...nativeChat.inject], async apply(scope) {
      const currentForm = () => scope.configForms.get(shared.current().integrated ? "omd-ui-chat" : "opencu-ui-chat");
      const settings = {
        getSnapshot: () => currentForm().getSnapshot(),
        set: (...args) => currentForm().set(...args),
        subscribe(listener) {
          let form = currentForm(), unsubscribe = form.subscribe(listener);
          const stop = shared.subscribe(() => {
            const next = currentForm();
            if (next === form) return;
            unsubscribe();
            form = next;
            unsubscribe = form.subscribe(listener);
            listener();
          });
          return () => {
            stop();
            unsubscribe();
          };
        }
      };
      await scope.plugin(nativeChat, { settings });
      const installed = installComputerUseClient(scope, shared);
      shared.entry = installed.ComputerEntry;
      shared.pane = installed.ComputerPane;
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
  const fallbackSubscribe = (listener) => ctx.sidebarRightTabs.subscribe(listener);
  const fallbackSnapshot = () => ctx.sidebarRightTabs.get("browser")?.id === HOST_BROWSER_ID;
  function FallbackPane(props) {
    const available = (0, import_react17.useSyncExternalStore)(fallbackSubscribe, fallbackSnapshot);
    return /* @__PURE__ */ import_react17.default.createElement(ComputerPane, { ...props, conversation: ctx.get("conversation"), hostBrowserAvailable: available });
  }
  function PaneEntry(props) {
    (0, import_react17.useSyncExternalStore)(shared.subscribe, () => shared.pane);
    const Pane = shared.pane || FallbackPane;
    return /* @__PURE__ */ import_react17.default.createElement(Pane, { ...props });
  }
  return { ComputerEntry, ComputerPane: PaneEntry };
}

// src/client/index.jsx
var inject = ["slots", "sidebarRightTabs", "sidebarRight"];
function apply(ctx) {
  applyComputerUseClient(ctx);
}
return module.exports;}});
