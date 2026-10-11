import { CodexCuI18nProvider, useCodexCuPlainText } from './codex-cu-i18n.jsx';
const CODEX_PLAIN_DISPLAY_IDS = Object.freeze({
  "I can do that, but I’ll need access to your screen and accessibility settings. Mind allowing that?": "electron.onboarding.conversationalOnboarding.computerUse.permissionIntro",
  "Screen and accessibility": "electron.onboarding.conversationalOnboarding.computerUse.permissionTitle",
  "Access requested": "electron.onboarding.conversationalOnboarding.computerUse.accessRequested",
  "Allow access": "electron.onboarding.conversationalOnboarding.computerUse.allowAccess",
  "No problem — you can allow computer access later": "electron.onboarding.conversationalOnboarding.computerUse.accessDeclined",
  "I couldn’t enable computer access. Check your system privacy settings, then try again.": "electron.onboarding.conversationalOnboarding.computerUse.accessFailed",
  "Control apps to complete tasks": "electron.onboarding.capabilitiesSetup.computerUseDescription"
});
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CodexCuButton, CodexCuToggle, CodexCuSpinner } from './codex-cu-primitives.jsx';
import { CodexComputerUsePluginIconUrl, CodexCuIcon } from './codex-cu-icons.jsx';
import './codex-system-access.css';
import { CodexCuScope } from './codex-cu-scope.jsx';

// Codex 26.1007.21159 / build 20052. Exact symbols, offsets and source hashes:
// work/rea-reconstruction/system-access/manifest.json.
// These components consume display state and callbacks. They do not request OS access.
const accessMessages = {
  intro: 'I can do that, but I’ll need access to your screen and accessibility settings. Mind allowing that?',
  title: 'Screen and accessibility',
  subtitle: 'Access requested',
  notNow: 'Not now',
  allowAccess: 'Allow access',
  declined: 'No problem — you can allow computer access later',
  failed: 'I couldn’t enable computer access. Check your system privacy settings, then try again.',
};

const capabilityMessages = {
  title: 'Give ChatGPT access to your computer',
  introduction: 'Let ChatGPT use your apps, browser, files, and work history to understand what you’re working on and help you get things done with less explaining',
  windowsIntroduction: 'Let ChatGPT use your apps and browser to help you get things done',
  label: 'Computer use',
  description: 'Control apps to complete tasks',
  checking: 'Checking…',
  'setting-up': 'Setting up…',
  incomplete: 'Setup incomplete',
  retry: 'Retry',
};

function scopeProps(theme) {
  return { referenceWindowType: 'electron', theme };
}

// The fixed onboarding sentences are plain text. This follows Jnl/Ynl/Xnl,
// the original word fade delay (24ms, capped at 800ms), and Bi's 2500ms fallback.
// Markdown directives, code and links belong to the host's Markdown renderer.
function splitIntroText(text) {
  if (typeof text !== 'string') return [];
  const isAscii = Array.from(text).every(character => character.charCodeAt(0) <= 127);
  if (isAscii) {
    const segments = [];
    const isWord = index => index < text.length && /[0-9A-Za-z]/.test(text[index]);
    let index = 0;
    while (index < text.length) {
      if (isWord(index)) {
        const start = index;
        while (isWord(index)) index += 1;
        segments.push(text.slice(start, index));
      } else {
        const last = Math.max(segments.length - 1, 0);
        segments[last] ??= '';
        segments[last] += text[index++];
      }
    }
    return segments;
  }
  let segmenter;
  try { segmenter = new Intl.Segmenter(undefined, { granularity: 'word' }); } catch { segmenter = null; }
  if (segmenter == null) {
    const segments = Array.from(text.match(/\s*\S+(?:\s+|$)/g) ?? []);
    return segments.length > 0 || text.length === 0 ? segments : [text];
  }
  const segments = [];
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    if (/^\s*$/.test(segment) || !isWordLike) {
      const last = Math.max(segments.length - 1, 0);
      segments[last] ??= '';
      segments[last] += segment;
    } else segments.push(segment);
  }
  return segments;
}

export function CodexSystemAccessIntro({
  children,
  animate = true,
  onComplete,
  completionFallbackMs = 2500,
  fadeSegmentDelayMs = 24,
  className = '',
formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const timeout = useRef(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const hasCompletion = onComplete != null;
  const segments = useMemo(() => splitIntroText(children), [children]);

  useEffect(() => {
    if (!animate || !hasCompletion) return undefined;
    const pending = window.setTimeout(() => {
      if (timeout.current === pending) {
        timeout.current = null;
        complete.current?.();
      }
    }, completionFallbackMs);
    timeout.current = pending;
    return () => {
      window.clearTimeout(pending);
      if (timeout.current === pending) timeout.current = null;
    };
  }, [animate, children, completionFallbackMs, hasCompletion]);

  const onAnimationEnd = event => {
    if (!animate || !hasCompletion || timeout.current == null || !(event.target instanceof HTMLElement)) return;
    const value = event.target.style.getPropertyValue('--fade-delay');
    if (value === '') return;
    const delay = Number.parseFloat(value);
    const hasLater = Array.from(event.currentTarget.querySelectorAll('[style*="--fade-delay"]'))
      .some(element => Number.parseFloat(element.style.getPropertyValue('--fade-delay')) > delay);
    if (!hasLater) {
      window.clearTimeout(timeout.current);
      timeout.current = null;
      complete.current?.();
    }
  };

  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><div onAnimationEnd={onAnimationEnd}>
    <div className={`codex-cu-access-intro ${className}`.trim()} data-markdown-animated={animate || undefined}>
      <p>{cuText(animate && typeof children === 'string' ? segments.map((segment, index) =>
        <span key={`fade-${index}`} className="codex-cu-access-fade" style={{ '--fade-delay': `${Math.min(index * fadeSegmentDelayMs, 800)}ms` }}>{cuText(segment)}</span>
      ) : children)}</p>
    </div>
  </div></CodexCuI18nProvider>;
}

function ComputerUseLogo({ theme, logoUrl, logoDarkUrl, className , formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const url = (theme === 'dark' ? logoDarkUrl : null) ?? logoUrl;
  const [failedUrl, setFailedUrl] = useState(null);
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><img alt="" draggable={false} className={className}
    src={url != null && failedUrl !== url ? url : CodexComputerUsePluginIconUrl}
    onError={url != null && failedUrl !== url ? () => setFailedUrl(url) : undefined}/></CodexCuI18nProvider>;
}

export function CodexSystemAccessCard({
  isRequesting = false,
  prerequisitesPending = false,
  onAllowAccess,
  onNotNow,
  pluginLogoUrl,
  pluginLogoDarkUrl,
  theme,
  messages,
formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const text = Object.fromEntries(Object.entries({ ...accessMessages, ...messages }).map(([key, value]) => [key, cuText(value)]));
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><div className="codex-cu-system-request">
    <div className="codex-cu-system-request-icon" aria-hidden="true">
      <ComputerUseLogo className="codex-cu-system-request-logo" theme={theme} logoUrl={pluginLogoUrl} logoDarkUrl={pluginLogoDarkUrl}/>
    </div>
    <div className="codex-cu-system-request-labels">
      <div className="codex-cu-system-request-title">{cuText(text.title)}</div>
      {cuText(text.subtitle != null && <div className="codex-cu-system-request-subtitle">{cuText(text.subtitle)}</div>)}
    </div>
    <div className="codex-cu-system-request-actions">
      <CodexCuButton color="outline" size="medium" disabled={isRequesting} onClick={onNotNow}>{cuText(text.notNow)}</CodexCuButton>
      <CodexCuButton color="primary" size="medium" disabled={isRequesting || prerequisitesPending} loading={isRequesting} onClick={onAllowAccess}>{cuText(text.allowAccess)}</CodexCuButton>
    </div>
  </div></CodexCuI18nProvider>;
}

// Ea suppresses the card after allowed and shows only the declined sentence
// after denied. showRequest can be controlled by the host's onboarding state.
export function CodexSystemAccessRequest({
  permissionStatus = 'not-requested',
  showRequest,
  animateIntro = true,
  requestFailed = false,
  onIntroComplete,
  theme,
  messages,
  renderIntro,
  formatMessage, locale, ...cardProps
}) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const [introComplete, setIntroComplete] = useState(!animateIntro);
  const text = Object.fromEntries(Object.entries({ ...accessMessages, ...messages }).map(([key, value]) => [key, cuText(value)]));
  if (permissionStatus === 'allowed') return null;
  if (permissionStatus === 'denied') return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuScope {...scopeProps(theme)} className="codex-cu-system-access"><p className="codex-cu-access-declined">{cuText(text.declined)}</p></CodexCuScope></CodexCuI18nProvider>;
  const revealRequest = showRequest ?? introComplete;
  const finishIntro = () => { setIntroComplete(true); onIntroComplete?.(); };
  const introProps = { animate: animateIntro, onComplete: finishIntro, children: text.intro };
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuScope {...scopeProps(theme)} className="codex-cu-system-access" data-permission-status={permissionStatus}>
    {cuText(renderIntro ? renderIntro(introProps) : <CodexSystemAccessIntro {...introProps}/>)}
    {cuText(revealRequest && <div className="codex-cu-system-request-frame"><CodexSystemAccessCard {...cardProps} messages={text} theme={theme}/></div>)}
    {cuText(revealRequest && requestFailed && <p className="codex-cu-system-request-error">{cuText(text.failed)}</p>)}
  </CodexCuScope></CodexCuI18nProvider>;
}

// Exact qd order: pending work takes precedence over plugin presence and grant.
export function getCodexComputerUseCapabilityStatus({
  isRequesting = false,
  isAvailabilityLoading = false,
  isConfigDataPending = false,
  isPluginsLoading = false,
  requestFailed = false,
  plugin,
  accessGranted = false,
}) {
  if (isRequesting) return 'setting-up';
  if (isAvailabilityLoading || isConfigDataPending || isPluginsLoading) return 'checking';
  if (requestFailed || plugin == null) return 'incomplete';
  return accessGranted === true && plugin.installed && plugin.enabled ? 'enabled' : 'available';
}

// vd is intentionally one generic display row so the original capabilities
// panel can accept separately implemented history and local-files rows.
export function CodexComputerCapabilityRow({
  label,
  description,
  icon,
  status,
  statusDetail,
  onChange,
  messages,
formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const labelId = useId(), descriptionId = useId(), retryId = useId();
  const text = Object.fromEntries(Object.entries({ ...capabilityMessages, ...messages }).map(([key, value]) => [key, cuText(value)]));
  const pending = status === 'checking' || status === 'setting-up';
  const showStatus = status !== 'available' && status !== 'enabled';
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><div className="codex-cu-capability-row" data-capability-status={status}>
    <div aria-hidden="true" className="codex-cu-capability-icon">{cuText(icon)}</div>
    <div className="codex-cu-capability-labels">
      <div id={labelId} className="codex-cu-capability-label">{cuText(label)}</div>
      <div id={descriptionId} role="status" className="codex-cu-capability-description">
        {cuText(pending && <span aria-hidden="true"><CodexCuSpinner containerClassName="codex-cu-capability-spinner" className="codex-cu-capability-spinner-icon"/></span>)}
        {cuText(showStatus ? statusDetail ?? text[status] : description)}
      </div>
    </div>
    <div className="codex-cu-capability-actions">
      <CodexCuToggle aria-labelledby={labelId} aria-describedby={descriptionId}
        checked={status === 'enabled'} disabled={pending || status === 'enabled'} onChange={onChange}/>
      {cuText(status === 'incomplete' && <CodexCuButton id={retryId} aria-labelledby={`${retryId} ${labelId}`} aria-describedby={descriptionId}
        color="secondary" size="compact" onClick={() => onChange?.(true)}>{cuText(text.retry)}</CodexCuButton>)}
    </div>
  </div></CodexCuI18nProvider>;
}

export function CodexComputerUseCapability({
  status,
  onChange,
  description,
  advancedCapabilitiesToSetup,
  messages,
  formatMessage, locale, ...rowProps
}) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const text = Object.fromEntries(Object.entries({ ...capabilityMessages, ...messages }).map(([key, value]) => [key, cuText(value)]));
  if (advancedCapabilitiesToSetup !== undefined && !advancedCapabilitiesToSetup.includes('computer-use')) return null;
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexComputerCapabilityRow {...rowProps} label={cuText(text.label)} description={cuText(description ?? text.description)}
    icon={<img alt="" className="codex-cu-capability-logo" src={CodexComputerUsePluginIconUrl}/>}
    status={status} onChange={onChange} messages={text}/></CodexCuI18nProvider>;
}

export function CodexComputerCapabilitiesSetup({
  children,
  introduction,
  platform = 'macOS',
  animateIntroduction = true,
  showCapabilities,
  onIntroComplete,
  renderIntro,
  theme,
  messages,
formatMessage, locale, }) {
  const cuText = useCodexCuPlainText(CODEX_PLAIN_DISPLAY_IDS, { formatMessage, locale });

  const text = Object.fromEntries(Object.entries({ ...capabilityMessages, ...messages }).map(([key, value]) => [key, cuText(value)]));
  const [introComplete, setIntroComplete] = useState(!animateIntroduction);
  const revealCapabilities = showCapabilities ?? introComplete;
  const finishIntro = () => { setIntroComplete(true); onIntroComplete?.(); };
  const introProps = {
    animate: animateIntroduction,
    onComplete: finishIntro,
    children: introduction ?? (platform === 'windows' ? text.windowsIntroduction : text.introduction),
  };
  return <CodexCuI18nProvider locale={locale} formatMessage={formatMessage}><CodexCuScope {...scopeProps(theme)} className="codex-cu-capability-setup">
    <div>{cuText(renderIntro ? renderIntro(introProps) : <CodexSystemAccessIntro {...introProps}/>)}</div>
    {cuText(revealCapabilities && children && <div className="codex-cu-capability-panel">
      <div className="codex-cu-capability-panel-header"><CodexCuIcon name="shared:tnt"/>{cuText(text.title)}</div>
      <div className="codex-cu-capability-panel-rows">{cuText(children)}</div>
    </div>)}
  </CodexCuScope></CodexCuI18nProvider>;
}
