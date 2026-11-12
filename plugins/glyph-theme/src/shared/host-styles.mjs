// Skin sources use the scoped class names of their original modules. The
// signed desktop, Web build and OMD conversation factories scope those same
// modules differently. Resolve only classes from the declaring stylesheet.
const modules = {
  'BInVoG': ['attachment/DropOverlay', 'wrap'],
  'CY-8Ka': ['tool/bash_sample', 'root'],
  'EvIC1a': ['chat/ChatView', 'root'],
  'JVDQca': ['attachment/AttachmentRail', 'root'],
  'P3OORG': ['sidebar-right/SidebarRight', 'panel'],
  'Q51KRG': ['chat/TurnUsagePanel', 'root'],
  'R_Yw7q': ['attachment/MessageImage', 'frame'],
  'Sixlwa': ['chat/MessageItem', 'attachmentRow'],
  'T1PP_q': ['conversation/EnterBehaviorRow', 'row'],
  'TS9iAW': ['chat/TurnTailNodeView', 'root'],
  'VOzbGW': ['settings-general/SettingsRoot', 'panel'],
  'XrJvXW': ['chat/ContextInjectionRow', 'root'],
  'YDXeBa': ['workspace/Rows', 'projectRow'],
  '_2XZxNq': ['chat/PreferenceRow', 'row'],
  '_54WpYG': ['attachment/ComposerAttachments', 'failureGlyph'],
  '_7KE1Ra': ['model-selection/ModelSelect', 'root'],
  '_8HJdBW': ['theme/AppearanceRow', 'cubeRow'],
  '_WvWnq': ['settings-general/GeneralSection', 'section'],
  'bVCLcG': ['theme/FontSizeRow', 'row'],
  'bhn1Oq': ['workspace/WorkspaceBrowser', 'root'],
  'gSkjMW': ['attachment/FileCard', 'card'],
  'hHd-Xa': ['sidebar/SidebarRoot', 'root'],
  'hWmORq': ['chat/AssistantMarkdown', 'root'],
  'iWlSmW': ['permission-presets/PermissionSelect', 'trigger'],
  'jLrgrW': ['settings-models/OnboardingModal', 'body'],
  'l_V-RG': ['chat/TurnProcessNodeView', 'root'],
  'lcKema': ['chat/ReasoningRow', 'root'],
  'mna1RW': ['approval/ApprovalPanel', 'root'],
  'o3BgMG': ['tool/ToolRow', 'root'],
  'oY77xG': ['permission-presets/PermissionRow', 'row'],
  'pI_x6G': ['layout/AppFrame', 'frame'],
  'pXSMma': ['conversation/HeroShell', 'root'],
  'pbvGtq': ['settings-plugins/PluginsSettingsSection', 'panel'],
  'qSYn7G': ['settings-plugin-inventory/PluginInventorySettingsTab', 'card'],
  'rtSEdW': ['agent-preset/AgentPresetSection', 'card'],
  'uV2eYG': ['conversation/InputBar', 'root'],
  'wSkVaW': ['conversation/ConversationRoot', 'root'],
  'xzv4MW': ['chat/MessageIconActions', 'action'],
  'zGbnIq': ['settings-models/ModelsSection', 'accountStatus'],
};
const aliases = new RegExp('\\.(' + Object.keys(modules).join('|') + ')_([\\w-]+)', 'g');
const shared = Symbol.for('dsh.appearance.host-styles.v1');

function readPrefixes(doc) {
  const prefixes = new Map();
  for (const sheet of doc.head.querySelectorAll('style[data-plugin-css]')) {
    const path = sheet.getAttribute('data-plugin-css');
    for (const [alias, [module, anchor]] of Object.entries(modules)) {
      const native = '@deepseek-ai/dsh-client-ui-' + module + '.module.css';
      const bundled = 'oh-my-dsh/' + module + '.module.css';
      if (path !== native && path !== bundled) continue;
      const prefix = sheet.textContent.match(new RegExp('\\.([\\w-]+)_' + anchor + '(?![\\w-])'))?.[1];
      if (!prefix) continue;
      const names = prefixes.get(alias) ?? new Set();
      names.add(prefix); prefixes.set(alias, names);
    }
  }
  return prefixes;
}

function resolve(text, prefixes) {
  return text.replace(aliases, (original, alias, local) => {
    const names = prefixes.get(alias);
    if (!names) return original;
    const matches = [...names].map(prefix => '.' + prefix + '_' + local);
    return matches.length === 1 ? matches[0] : ':is(' + matches.join(',') + ')';
  });
}

// Attach only explicitly supplied product styles. Third-party styles and the
// host sheets themselves stay owned by their original plugin.
export function setHostStyle(sheet, text) {
  const doc = sheet.ownerDocument;
  if (!doc?.head?.querySelectorAll || !doc.defaultView?.MutationObserver || !text.match(aliases)) {
    sheet.textContent = text; return;
  }
  let state = doc[shared];
  if (!state) {
    state = { prefixes: readPrefixes(doc), templates: new Map() };
    const nativeSheet = node => node.nodeType === 1 && node.matches('style[data-plugin-css]');
    const observer = new doc.defaultView.MutationObserver(records => {
      const changed = records.some(record => [...record.addedNodes, ...record.removedNodes].some(nativeSheet));
      if (changed) state.prefixes = readPrefixes(doc);
      for (const [element, template] of state.templates) {
        if (!element.isConnected) { state.templates.delete(element); continue; }
        if (changed) {
          const css = resolve(template, state.prefixes);
          if (css !== element.textContent) element.textContent = css;
        }
      }
      if (!state.templates.size) { observer.disconnect(); delete doc[shared]; }
    });
    doc[shared] = state;
    observer.observe(doc.head, { childList: true });
  }
  state.templates.set(sheet, text);
  sheet.textContent = resolve(text, state.prefixes);
}
