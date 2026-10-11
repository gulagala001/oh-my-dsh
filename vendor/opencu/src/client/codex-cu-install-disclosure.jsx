import React from 'react';
import { CodexCuToggle } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuSettingsRow } from './codex-cu-settings-primitives.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';

// Dedicated CU installation and post-mobile-connection regions only.
// Original symbols, gates, UTF offsets and hashes live in
// work/rea-reconstruction/install-disclosure/manifest.json.
// Root owns CSS injection, host requests and link opening.
export const CODEX_CU_LOCKED_USE_HELP_URL = 'https://developers.openai.com/codex/app/computer-use#locked-use';

function scopeProps(theme) {
  return { referenceWindowType: 'electron', theme };
}

function callbackLink(onOpenLink, url, event) {
  event.preventDefault();
  onOpenLink?.(url, event);
}

function InstallSection({ children, className = '' }) {
  return <div className={`codex-cu-install-section ${className}`.trim()}>{children}</div>;
}

export function CodexCuInstallDisclosureLoading() {
  return <div>{Array.from({ length: 3 }, (_, index) =>
    <div className="codex-cu-install-blurb codex-cu-install-skeleton" key={index}>
      <div className="codex-cu-install-skeleton-heading"/>
      <div className="codex-cu-install-skeleton-line"/>
      <div className="codex-cu-install-skeleton-short-line"/>
    </div>
  )}</div>;
}

// On/vn recognize the original single-line Markdown link form. Blurbs come
// from authenticated host data; there is no invented default CU disclosure.
function disclosureDescription(description, onOpenLink) {
  const parts = [], expression = /\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0, match;
  while ((match = expression.exec(description)) != null) {
    if (match.index > cursor) parts.push(description.slice(cursor, match.index));
    const [source, label, rawUrl] = match, url = rawUrl.trim();
    if (url.length === 0) parts.push(label);
    else parts.push(<a key={`${url}-${match.index}`} href={url} className="codex-cu-install-blurb-link"
      onClick={event => callbackLink(onOpenLink, url, event)}>{label}</a>);
    cursor = match.index + source.length;
  }
  if (cursor < description.length) parts.push(description.slice(cursor));
  return parts.length === 0 ? description : parts.length === 1 ? parts[0] : parts;
}

export function CodexCuInstallDisclosureBlurbs({ blurbs, onOpenLink }) {
  return <div className="codex-cu-install-blurbs">{blurbs.map((blurb, index) =>
    <div className="codex-cu-install-blurb" key={`${blurb.title}-${index}`}>
      <div className="codex-cu-install-blurb-title">{blurb.title}</div>
      <div>{disclosureDescription(blurb.description, onOpenLink)}</div>
    </div>
  )}</div>;
}

export function CodexLockedComputerUseInstallOption({ enabled, disabled = false, onChange, onOpenLink, messages }) {
  const text = {
    title: 'Locked Computer Use',
    description: "Let ChatGPT use your Mac when it's locked.",
    learnMore: 'Learn more',
    toggle: 'Install Locked Computer Use',
    ...messages,
  };
  return <InstallSection>
    <div className="codex-cu-install-locked-row">
      <div className="codex-cu-install-locked-labels">
        <div className="codex-cu-install-section-title">{text.title}</div>
        <div className="codex-cu-install-locked-description">{text.description}{' '}
          <a href={CODEX_CU_LOCKED_USE_HELP_URL} target="_blank" rel="noreferrer" className="codex-cu-install-info-link"
            onClick={event => callbackLink(onOpenLink, CODEX_CU_LOCKED_USE_HELP_URL, event)}>{text.learnMore}</a>
        </div>
      </div>
      <CodexCuToggle checked={enabled} disabled={disabled} ariaLabel={text.toggle} onChange={onChange}/>
    </div>
  </InstallSection>;
}

// tn's dedicated region. The surrounding plugin overview is a caller slot;
// the general install modal, connector OAuth and installer are outside scope.
export function CodexCuInstallDisclosure({
  disclosureData,
  hostId,
  plugin,
  pluginDetail,
  installLockedComputerUse,
  isLoadingDisclosureData = false,
  onInstallLockedComputerUseChange,
  shouldShowInstallDisclosure = false,
  showLockedComputerUseInstall = false,
  overviewContent,
  renderOverview,
  onOpenLink,
  theme,
  messages,
}) {
  const hasBlurbs = disclosureData != null && disclosureData.blurbs.length > 0;
  const showOverview = !shouldShowInstallDisclosure || !hasBlurbs;
  return <CodexCuScope {...scopeProps(theme)} className="codex-cu-install-disclosure">
    {showOverview && (renderOverview ? renderOverview({ hostId, plugin, pluginDetail }) : overviewContent)}
    {showOverview && pluginDetail != null && showLockedComputerUseInstall &&
      <CodexLockedComputerUseInstallOption enabled={installLockedComputerUse} onChange={onInstallLockedComputerUseChange}
        onOpenLink={onOpenLink} messages={messages}/>}
    {shouldShowInstallDisclosure && (isLoadingDisclosureData ?
      <InstallSection><CodexCuInstallDisclosureLoading/></InstallSection> : hasBlurbs ?
        <InstallSection><CodexCuInstallDisclosureBlurbs blurbs={disclosureData.blurbs} onOpenLink={onOpenLink}/></InstallSection> : null)}
  </CodexCuScope>;
}

// Pure inputs corresponding to mobile an. No query is run and no capability
// is assumed when the actual Locked use state has not been supplied.
export function getCodexMobileComputerUseAccessState({
  platform,
  computerUseAvailable,
  computerUsePlugin,
  canUseLockedComputerUse,
  lockedUseState,
  isPluginsOrAvailabilityLoading = false,
  isLockedUseLoading = false,
  isLockedUsePending = false,
  isHostPluginInstalling = false,
  pendingPluginId,
}) {
  const computerUseEnabled = computerUsePlugin?.installed === true && computerUsePlugin.enabled;
  return {
    computerUseEnabled,
    computerUseToggleDisabled: isPluginsOrAvailabilityLoading || computerUsePlugin == null || isHostPluginInstalling ||
      isLockedUsePending || pendingPluginId === computerUsePlugin.id,
    lockedComputerUseEnabled: lockedUseState?.enabled ?? false,
    lockedComputerUseToggleDisabled: !computerUseEnabled || isLockedUseLoading || isLockedUsePending,
    showComputerUseSetup: computerUseAvailable,
    showLockedComputerUse: platform === 'macOS' && computerUseEnabled && canUseLockedComputerUse && lockedUseState?.enabled != null,
  };
}

// Mobile fn/mn: only the local CU option after a remote connection completes.
// Pairing, MFA, QR code, host authorization and other remote settings are not
// rendered here. These are adjacent flow controls, not an app allowlist.
export function CodexCuMobileConnectedAccess({
  variant = 'dialog',
  platform = 'macOS',
  showComputerUseSetup,
  showLockedComputerUse,
  computerUseEnabled,
  computerUseToggleDisabled,
  lockedComputerUseEnabled,
  lockedComputerUseToggleDisabled,
  onComputerUseEnabledChange,
  onLockedComputerUseEnabledChange,
  onOpenLink,
  icon,
  theme,
  messages,
}) {
  if (!showComputerUseSetup) return null;
  const text = {
    lockedTitle: 'Use your Mac apps while locked',
    lockedDescription: 'Control Mac apps from your phone.',
    computerUseTitle: 'Enable computer use',
    macDescription: 'Let ChatGPT control apps on your Mac',
    pcDescription: 'Let ChatGPT control apps on your PC',
    learnMore: 'Learn more',
    ...messages,
  };
  const title = showLockedComputerUse ? text.lockedTitle : text.computerUseTitle;
  const description = showLockedComputerUse ? <>{text.lockedDescription}{' '}
    <a className="codex-cu-install-info-link" href={CODEX_CU_LOCKED_USE_HELP_URL} target="_blank" rel="noreferrer"
      onClick={event => callbackLink(onOpenLink, CODEX_CU_LOCKED_USE_HELP_URL, event)}>{text.learnMore}</a>
  </> : platform === 'macOS' ? text.macDescription : text.pcDescription;
  const sourceIcon = icon ?? <CodexCuIcon aria-hidden={false} name={showLockedComputerUse ? 'shared:Ys' : 'shared:Zs'}/>;
  const control = <CodexCuToggle checked={showLockedComputerUse ? lockedComputerUseEnabled : computerUseEnabled}
    disabled={showLockedComputerUse ? lockedComputerUseToggleDisabled : computerUseToggleDisabled}
    ariaLabel={title} onChange={showLockedComputerUse ? onLockedComputerUseEnabledChange : onComputerUseEnabledChange}/>;
  return <CodexCuScope {...scopeProps(theme)} className="codex-cu-mobile-cu-access">
    {variant === 'page' ? <CodexCuSettingsRow controlSizing="content" description={description} icon={sourceIcon} label={title} control={control}/> :
      <div className="codex-cu-mobile-cu-dialog-row">
        <div className="codex-cu-mobile-cu-dialog-label-group">
          <div className="codex-cu-mobile-cu-dialog-icon">{sourceIcon}</div>
          <div className="codex-cu-mobile-cu-dialog-labels">
            <div className="codex-cu-mobile-cu-dialog-title">{title}</div>
            <div className="codex-cu-mobile-cu-dialog-description">{description}</div>
          </div>
        </div>
        <div className="codex-cu-mobile-cu-dialog-control">{control}</div>
      </div>}
  </CodexCuScope>;
}
