import React, { useState } from 'react';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { useCodexCuAppearance } from './codex-cu-scope.jsx';
import { CodexTargetReferenceChip } from './codex-target-picker.jsx';
import { codexTargetReference } from './codex-target-adapter.mjs';

export { buildCodexTargetCandidates } from './codex-target-adapter.mjs';

/** Public candidate.icon marks only our artwork; pinned MenuView CSS can scope its row. */
export function createCodexTargetCandidateIcon(item) {
  function CodexTargetCandidateIcon({ size = 16, className, ...props }) {
    const appearance = useCodexCuAppearance();
    const [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
    const iconName = item.fallbackIconName ?? (item.kind === 'tab' ? 'shared:OD' : 'shared:kw');
    const source = item.iconUrl ?? item.faviconUrl;
    return <span className={['codex-target-candidate-artwork', className].filter(Boolean).join(' ')} aria-hidden="true"
      data-codex-cu-candidate={item.kind}
      data-codex-cu-candidate-label-shrink={item.allowLabelAndDetailToShrink ? '' : undefined}
      data-codex-cu-candidate-window-type={appearance.referenceWindowType}
      style={{ position: 'relative', display: 'inline-flex', width: `var(--codex-target-host-artwork-size, ${size}px)`, height: `var(--codex-target-host-artwork-size, ${size}px)`, flexShrink: 0 }}>
      {(!source || !loaded) && <CodexCuIcon {...props} size={size} name={iconName} style={{ ...props.style, width: '100%', height: '100%' }}/>}
      {source && !failed && <img alt="" src={source} decoding="async" draggable={false} referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)} onError={() => { setFailed(true); setLoaded(false); }}
        style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: 'var(--radius-2xs, 2px)', objectFit: 'contain', opacity: loaded ? 1 : 0 }}/>}
    </span>;
  }
  return CodexTargetCandidateIcon;
}

/** Message-body adapter; the parser, serialized reference and attachments stay owned by the existing renderer. */
export function CodexComputerReference({ reference }) {
  const appearance = useCodexCuAppearance();
  return <CodexTargetReferenceChip reference={codexTargetReference(reference)}
    theme={appearance.theme} windowType={appearance.referenceWindowType}/>;
}
