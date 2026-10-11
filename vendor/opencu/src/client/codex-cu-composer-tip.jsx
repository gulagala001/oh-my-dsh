import { CodexCuI18nProvider, useCodexCuPlainText } from './codex-cu-i18n.jsx';
const CODEX_PLAIN_DISPLAY_IDS = Object.freeze({
  "Control apps on your computer using Computer Use.": "composerTips.computerUse.content",
  "Set up": "composerTips.computerUse.action"
});
import React from 'react';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';

const p = (...values) => values.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `cut-${value}`).join(' ');
const join = (...values) => values.filter(Boolean).join(' ');

// Only catalog's computer-use entry is projected. Its controller and eligibility
// remain the caller's responsibility; see composer-tip/manifest.json.
export const codexCuComposerTipDefinition = Object.freeze({
  id: 'computer-use',
  action: Object.freeze({ type: 'navigate', path: '/settings/computer-use' }),
  badge: 'TIP',
  content: 'Control apps on your computer using Computer Use.',
  actionLabel: 'Set up',
  dismissLabel: 'Dismiss tip',
});

export function CodexCuComposerTip({
  visible = true, badge = codexCuComposerTipDefinition.badge,
  content = codexCuComposerTipDefinition.content,
  actionLabel = codexCuComposerTipDefinition.actionLabel,
  dismissLabel = codexCuComposerTipDefinition.dismissLabel,
  onPrimaryAction, onDismiss, className, formatMessage, locale, ...props
}) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  if (!visible) return null;
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuScope as="aside" {...props} aria-live="polite" role="status"
    className={join('codex-cu-composer-tip', p('flex w-full justify-center'), className)}>
    <div className={p('group relative flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 px-7 py-1 select-none')}>
      <span className={p('inline-flex items-center shrink-0 min-h-5 rounded-full bg-tip-soft px-2 text-xs leading-none font-medium text-tip')}>{cuText(badge)}</span>
      <span className={p('flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-secondary')}>
        <span className={p('min-w-0 text-center')}>{cuText(content)}</span>
        <CodexCuButton color="ghostMuted" size="inline" onClick={onPrimaryAction}
          className={p('underline decoration-dotted underline-offset-4')}>{cuText(actionLabel)}</CodexCuButton>
      </span>
      <CodexCuButton aria-label={cuText(dismissLabel)} color="secondary" radius="large" size="iconCircleSm" onClick={onDismiss}
        className={p('pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100')}>
        <CodexCuIcon name="shared:Cot" />
      </CodexCuButton>
    </div>
  </CodexCuScope></CodexCuI18nProvider>;
}
