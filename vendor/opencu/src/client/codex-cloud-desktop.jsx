import { codexCloudComputerBackground } from './codex-cu-assets.mjs';
import React from 'react';
import { CodexCuButton, CodexCuSpinner } from './codex-cu-primitives.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';

// Renderer-only reconstruction of the two distinct shipped cloud computer panes.
// Exact AST, CSS, locale offsets and digests: work/rea-reconstruction/cloud-desktop/.
// Stream creation, identity/account gates, transport, WebAuthn and control state
// stay with the host. The entry point injects codex-cloud-desktop.css once.
const p = (...values) => values.flat(Infinity).filter(Boolean).join(' ').split(/\s+/).filter(Boolean).map(value => `ccd-${value}`).join(' ');
const join = (...values) => values.filter(Boolean).join(' ');

const copy = {
  "restricted.aeon.computer.connecting.dot": {
    "en": "Connecting to your dot’s computer…",
    "zh": "正在连接到您的 Dot 的电脑…"
  },
  "restricted.aeon.computer.connectingNamedComputer": {
    "en": "Connecting to {orbitName}’s computer…",
    "zh": "正在连接 {orbitName} 的电脑…"
  },
  "restricted.aeon.computer.handoffLinkUnavailable": {
    "en": "This computer link is unavailable",
    "zh": "这个电脑链接不可用"
  },
  "restricted.aeon.computer.handoffOpen": {
    "en": "Open computer",
    "zh": "打开计算机"
  },
  "restricted.aeon.computer.handoffReturnHome": {
    "en": "Return home",
    "zh": "返回首页"
  },
  "restricted.aeon.computer.humanControl": {
    "en": "You have control",
    "zh": "您拥有控制权"
  },
  "restricted.aeon.computer.orbitControl": {
    "en": "{orbitName} has control",
    "zh": "{orbitName} 当前拥有控制权"
  },
  "restricted.aeon.computer.retryStartup": {
    "en": "Retry",
    "zh": "重试"
  },
  "restricted.aeon.computer.returnControl": {
    "en": "Return control",
    "zh": "归还控制权"
  },
  "restricted.aeon.computer.startupError": {
    "en": "Couldn’t start computer",
    "zh": "未能启动电脑"
  },
  "restricted.aeon.computer.takeOver": {
    "en": "Take over",
    "zh": "获取控制权"
  },
  "restricted.aeon.computer.takingControl": {
    "en": "Taking control…",
    "zh": "正在获取控制权…"
  },
  "restricted.aeon.computer.unavailable": {
    "en": "Computer unavailable",
    "zh": "计算机不可用"
  },
  "restricted.aeon.computer.unnamedOrbitControl.brand.dot": {
    "en": "Your <b>dot</b> has control",
    "zh": "您的 <b>Dot</b> 拥有控制权"
  },
  "restricted.aeon.computer.video": {
    "en": "Live computer",
    "zh": "电脑实时视频"
  },
  "restricted.cloudDesktop.connecting": {
    "en": "Connecting to desktop…",
    "zh": "正在连接到桌面…"
  },
  "restricted.cloudDesktop.error.configuration": {
    "en": "Could not load the app’s connection settings",
    "zh": "无法加载应用的连接设置"
  },
  "restricted.cloudDesktop.error.credentials": {
    "en": "The desktop started but did not return valid connection details",
    "zh": "桌面已启动，但未返回有效的连接信息"
  },
  "restricted.cloudDesktop.error.disconnected": {
    "en": "The desktop connection was interrupted. Try connecting again",
    "zh": "桌面连接已中断。请尝试重新连接。"
  },
  "restricted.cloudDesktop.error.input": {
    "en": "Desktop video started, but the input channel failed to open",
    "zh": "桌面视频已启动，但输入通道未成功打开"
  },
  "restricted.cloudDesktop.error.runtimeMissing": {
    "en": "This environment image does not include the desktop runtime. Use an environment with desktop support",
    "zh": "此环境镜像不包含桌面运行时。请使用支持桌面功能的环境"
  },
  "restricted.cloudDesktop.error.runtimeUser": {
    "en": "The desktop runtime requires the agent user (UID 1000). This environment uses a different user",
    "zh": "桌面运行时必须以 agent 用户（UID 1000）身份运行。此环境使用的是其他用户"
  },
  "restricted.cloudDesktop.error.signaling": {
    "en": "Could not negotiate a connection with the desktop service",
    "zh": "无法与桌面服务协商建立连接"
  },
  "restricted.cloudDesktop.error.startup": {
    "en": "The remote desktop startup command failed. Check that the environment is online and try again",
    "zh": "远程桌面启动命令未成功执行。请确认环境在线后重试"
  },
  "restricted.cloudDesktop.error.startupTimeout": {
    "en": "The desktop did not become ready within 95 seconds",
    "zh": "桌面未能在 95 秒内准备就绪"
  },
  "restricted.cloudDesktop.error.transport": {
    "en": "Signaling completed, but the desktop video and input connection failed",
    "zh": "信令已完成，但桌面视频和输入连接未成功建立"
  },
  "restricted.cloudDesktop.error.video": {
    "en": "The input channel opened, but desktop video did not start",
    "zh": "输入通道已打开，但桌面视频未启动"
  },
  "restricted.cloudDesktop.httpStatus": {
    "en": "Desktop service returned HTTP {status}",
    "zh": "桌面服务返回了 HTTP {status}"
  },
  "restricted.cloudDesktop.retry": {
    "en": "Try again",
    "zh": "重试"
  },
  "restricted.cloudDesktop.selectEnvironment": {
    "en": "Select a Cloud environment to use its desktop",
    "zh": "选择一个云环境以使用其桌面"
  },
  "restricted.cloudDesktop.status.connected": {
    "en": "Connected",
    "zh": "已连接"
  },
  "restricted.cloudDesktop.status.input": {
    "en": "Waiting for input channel…",
    "zh": "正在等待输入通道…"
  },
  "restricted.cloudDesktop.status.signaling": {
    "en": "Negotiating desktop connection…",
    "zh": "正在协商桌面连接…"
  },
  "restricted.cloudDesktop.status.startup": {
    "en": "Starting desktop and waiting for connection details…",
    "zh": "正在启动桌面并等待连接信息…"
  },
  "restricted.cloudDesktop.status.transport": {
    "en": "Connecting video and input…",
    "zh": "正在建立视频和输入连接…"
  },
  "restricted.cloudDesktop.status.video": {
    "en": "Waiting for desktop video…",
    "zh": "正在等待桌面视频…"
  },
  "restricted.cloudDesktop.stopControl": {
    "en": "Stop control",
    "zh": "停止控制"
  },
  "restricted.cloudDesktop.takeControl": {
    "en": "Take control",
    "zh": "获取控制权"
  },
  "restricted.cloudDesktop.unavailable": {
    "en": "Desktop unavailable",
    "zh": "桌面不可用"
  },
  "restricted.cloudDesktop.video": {
    "en": "Live desktop",
    "zh": "实时桌面"
  }
};

function message(id, locale, formatMessage, values = {}) {
  const definition = copy[id];
  if (!definition) return null;
  if (formatMessage) return formatMessage({ id, defaultMessage: definition.en }, values);
  const text = locale?.startsWith('zh') ? definition.zh : definition.en;
  const parts = text.split(/(\{(?:orbitName|status)\}|<b>.*?<\/b>)/g).filter(Boolean);
  if (parts.length === 1) return text;
  return parts.map((part, index) => part.startsWith('{')
    ? <React.Fragment key={index}>{values[part.slice(1, -1)]}</React.Fragment>
    : part.startsWith('<b>') ? <strong key={index}>{part.slice(3, -4)}</strong> : part);
}

function Spinner({ className }) {
  return <CodexCuSpinner className={className} />;
}

// app-shared gWi/Fb: the original compact empty-state layout.
function EmptyState({ className, title, description, actions, icon, ...props }) {
  return <div {...props} className={join(p('flex w-full flex-col items-center justify-center px-4 py-8 text-center'), className)}>
    <div className={p('flex w-full min-w-0 flex-col items-center gap-3 max-w-72')}>
      <div className={p('flex items-center justify-center [&>svg]:size-8 [&>svg]:text-secondary')}>{icon}</div>
      <div className={p('flex w-full min-w-0 flex-col items-center gap-2')}>
        <div className={p('text-lg leading-6 font-medium text-default')}>{title}</div>
        {description != null && <div className={p('w-full min-w-0 text-sm text-secondary')}>{description}</div>}
      </div>
      {actions != null && <div className={p('flex flex-wrap items-center justify-center gap-2')}>{actions}</div>}
    </div>
  </div>;
}

const desktopStatuses = {
  startup: 'restricted.cloudDesktop.status.startup', signaling: 'restricted.cloudDesktop.status.signaling',
  transport: 'restricted.cloudDesktop.status.transport', video: 'restricted.cloudDesktop.status.video',
  input: 'restricted.cloudDesktop.status.input', connected: 'restricted.cloudDesktop.status.connected',
};
const desktopErrors = {
  runtimeMissing: 'restricted.cloudDesktop.error.runtimeMissing', runtimeUser: 'restricted.cloudDesktop.error.runtimeUser',
  startupTimeout: 'restricted.cloudDesktop.error.startupTimeout', startup: 'restricted.cloudDesktop.error.startup',
  credentials: 'restricted.cloudDesktop.error.credentials', configuration: 'restricted.cloudDesktop.error.configuration',
  signaling: 'restricted.cloudDesktop.error.signaling', transport: 'restricted.cloudDesktop.error.transport',
  video: 'restricted.cloudDesktop.error.video', input: 'restricted.cloudDesktop.error.input',
  connected: 'restricted.cloudDesktop.error.disconnected',
};

// panel-5f99d5d2b3ff: me/he/de. available maps tab registration's environment gate;
// selectionReady maps me's matching conversation + identity + selected environment.
export function CodexCloudDesktopPanel({
  available = false, selectionReady = false, phase = 'startup', ready = false,
  controlling = false, error, onRetry, onToggleControl, videoRef, videoProps = {},
  containerRef, onFocusOut, desktopIcon, locale = 'zh-CN', formatMessage,
  theme, windowType, reducedMotion, className,
}) {
  if (!available) return null;
  const m = (id, values) => message(id, locale, formatMessage, values);
  const icon = desktopIcon ?? <CodexCuIcon name="shared:Set" />;
  if (!selectionReady) return <CodexCuScope as={EmptyState} theme={theme} referenceWindowType={windowType}
    data-reduced-motion={reducedMotion == null ? undefined : String(reducedMotion)}
    className={join(p('h-full select-none'), className)} icon={icon} title={m('restricted.cloudDesktop.selectEnvironment')} />;
  if (error != null) return <CodexCuScope as={EmptyState} theme={theme} referenceWindowType={windowType}
    data-reduced-motion={reducedMotion == null ? undefined : String(reducedMotion)}
    className={join(p('h-full select-none'), className)} icon={icon} title={m('restricted.cloudDesktop.unavailable')}
      description={<div className={p('flex flex-col gap-2')}>
        {m(desktopErrors[error.stage ?? error.reason ?? 'startup'])}
        {error.httpStatus != null && m('restricted.cloudDesktop.httpStatus', { status: error.httpStatus })}
      </div>} actions={<CodexCuButton color="outline" onClick={onRetry}>{m('restricted.cloudDesktop.retry')}</CodexCuButton>} />;
  return <CodexCuScope ref={containerRef} theme={theme} referenceWindowType={windowType}
    data-reduced-motion={reducedMotion == null ? undefined : String(reducedMotion)}
    data-codex-cloud-computer={controlling ? 'controlling' : 'observing'} onBlur={onFocusOut}
    className={join(p('relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface'), className)}>
    <div className={p('flex items-center justify-between gap-2 p-2 text-sm text-secondary select-none')}>
      <span role="status">{m(desktopStatuses[phase])}</span>
      <CodexCuButton color="outline" disabled={!ready} onClick={onToggleControl}>
        {m(controlling ? 'restricted.cloudDesktop.stopControl' : 'restricted.cloudDesktop.takeControl')}
      </CodexCuButton>
    </div>
    <div className={p('relative flex min-h-0 flex-1')}>
      <video {...videoProps} ref={videoRef} className={join(p('min-h-0 w-full flex-1 object-contain outline-none'), videoProps.className)}
        aria-label={m('restricted.cloudDesktop.video')} autoPlay muted playsInline tabIndex={0}
        onPointerDown={videoProps.onPointerDown ?? (event => event.currentTarget.focus())} />
      {!ready && <div className={p('absolute inset-0 flex bg-surface')}>
        <EmptyState className={p('select-none')} icon={<Spinner />} title={m('restricted.cloudDesktop.connecting')} />
      </div>}
    </div>
  </CodexCuScope>;
}

// aeon-appearance-colors a/c: exact source alias map. The account supplies color.
const orbitAccent = { gray: 'slate', pink: 'pink', orchid: 'magenta', coral: 'orange', orange: 'orange',
  yellow: 'yellow', lime: 'lime', teal: 'green', cyan: 'cyan', blue: 'blue', violet: 'purple' };
export function codexCloudControlColors(orbitColor = 'cyan') {
  orbitColor = orbitColor ?? 'cyan';
  const accent = orbitAccent[orbitColor];
  if (accent == null) return undefined;
  return { background: `var(--color-chat-accent-${accent})`, foreground:
    orbitColor === 'yellow' || orbitColor === 'lime' ? 'var(--color-text-on-chat-accent-yellow)' : 'var(--color-text-on-chat-accent)' };
}

const controlClasses = { panel: '_panel_1qsav_2', floating: '_floating_1qsav_2', floatingBackground: '_floatingBackground_1qsav_2',
  visor: '_visor_1qsav_2', visorBackground: '_visorBackground_1qsav_2', visorWash: '_visorWash_1qsav_2', button: '_button_1qsav_2',
  loading: '_loading_1qsav_2', peek: '_peek_1qsav_2', avatar: '_avatar_1qsav_2', dots: '_dots_1qsav_2',
  requesting: '_requesting_1qsav_2', status: '_status_1qsav_2' };
const panelClasses = { layout: '_layout_v2pom_2', viewport: '_viewport_v2pom_2', loadingOverlay: '_loadingOverlay_v2pom_2',
  videoFrame: '_videoFrame_v2pom_2', videoSurface: '_videoSurface_v2pom_2', videoShadow: '_videoShadow_v2pom_2',
  takeoverBorder: '_takeoverBorder_v2pom_2', traceLeft: '_traceLeft_v2pom_2', traceRight: '_traceRight_v2pom_2',
  traceFill: '_traceFill_v2pom_2', controls: '_controls_v2pom_2' };

// app-initial uF/pfn: the shipped definition of an unnamed dot.
const isUnnamedOrbit = name => name == null || ['', 'O', 'o', 'Orbit', 'orbit', 'dot'].includes(name.trim());

// panel-824edb8c2110 St: avatar renderer is the existing host dot/Pet surface.
// Its slot receives the original class/identity/animated inputs; no substitute avatar.
export function CodexCloudAeonControl({ conversationId, control, isTakingOver = false, orbitAvatar, orbitName,
  renderOrbitAvatar, locale = 'zh-CN', formatMessage, className }) {
  const c = controlClasses, state = control?.state ?? 'observing', requesting = state === 'requesting';
  const m = (id, values) => message(id, locale, formatMessage, values);
  const unnamed = isUnnamedOrbit(orbitName);
  return <div className={join(c.panel, p('relative isolate flex max-w-full shrink-0 items-center gap-2 select-none'),
    isTakingOver ? c.visor : c.floating, requesting && c.requesting, className)} aria-busy={requesting}>
    <span aria-hidden="true" className={c.floatingBackground} />
    <span aria-hidden="true" className={c.visorBackground}><span className={c.visorWash} /></span>
    {requesting && <span className={p('sr-only')} role="status">{m('restricted.aeon.computer.takingControl')}</span>}
    <span className={join(c.status, p('min-w-0 truncate'))} aria-hidden={requesting} role="status">
      {state === 'controlling' ? m('restricted.aeon.computer.humanControl') : unnamed
        ? m('restricted.aeon.computer.unnamedOrbitControl.brand.dot', { b: chunks => <strong>{chunks}</strong> })
        : m('restricted.aeon.computer.orbitControl', { orbitName: <strong>{orbitName}</strong> })}
    </span>
    <button type="button" aria-pressed={isTakingOver} disabled={control == null || requesting}
      onPointerDown={event => { if (state !== 'observing') event.preventDefault(); }} onClick={control?.onToggle}
      className={join(c.button, p('no-drag relative isolate flex min-w-0 max-w-full shrink-0 cursor-interaction items-center rounded-full bg-media-background/15 text-primary-solid whitespace-nowrap select-none before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-primary-solid focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-default disabled:opacity-40 aria-pressed:text-(color:--computer-control-foreground) aria-pressed:backdrop-blur-md aria-pressed:before:opacity-0 not-disabled:hover:before:bg-text/80 aria-pressed:not-disabled:hover:bg-media-background/30 aria-pressed:focus:bg-media-background/30'))}>
      <span className={p('truncate')}>{m(state === 'controlling' ? 'restricted.aeon.computer.returnControl' : 'restricted.aeon.computer.takeOver')}</span>
    </button>
    <span aria-hidden="true" className={c.loading}>
      <span className={c.peek}>{renderOrbitAvatar?.({ className: c.avatar, avatar: orbitAvatar, identity: conversationId, animated: requesting })}</span>
      <span className={c.dots}><span /><span /><span /></span>
    </span>
  </div>;
}

// panel-824edb8c2110 Rt/Wt/qe: expanded and compact keep distinct composition.
// signedIn maps Vt's account/user gate. Host supplies startup/stream/control state.
export function CodexCloudAeonComputerPanel({
  signedIn = false, conversationId, connectionState = 'connecting', control, variant = 'expanded',
  lastFrame, placeholderSrc = codexCloudComputerBackground, videoAspectRatio, orbitAvatar, orbitName, orbitColor = 'cyan', controlColors,
  renderOrbitAvatar, startupError, isRetryingStartup = false, onStartupRetry,
  children, videoRef, videoProps = {}, renderVideo = false, webAuthnSlot,
  locale = 'zh-CN', formatMessage, theme, windowType, reducedMotion, className, style,
}) {
  if (!signedIn) return null;
  const c = panelClasses, compact = variant === 'compact', streaming = connectionState === 'streaming',
    error = connectionState === 'error', ratio = videoAspectRatio ?? lastFrame?.aspectRatio ?? 4 / 3;
  const canControl = !compact && streaming && control != null;
  const observing = canControl && control.state === 'observing', takingOver = canControl && control.state === 'controlling';
  const colors = controlColors ?? codexCloudControlColors(orbitColor);
  const m = (id, values) => message(id, locale, formatMessage, values);
  const imageSource = lastFrame?.dataUrl ?? placeholderSrc;
  const unavailable = error ? m('restricted.aeon.computer.unavailable') : undefined;
  const unnamed = isUnnamedOrbit(orbitName);
  const video = renderVideo && <video {...videoProps} ref={videoRef} aria-label={m('restricted.aeon.computer.video')}
    className={join(p('size-full focus-visible:outline-none', compact ? 'object-cover transition-none'
      : 'object-contain transition-opacity duration-relaxed ease-enter motion-reduce:transition-none'), videoProps.className)}
    autoPlay muted playsInline tabIndex={compact ? -1 : 0}
    onPointerDown={videoProps.onPointerDown ?? (event => { if (event.button === 3 || event.button === 4) event.stopPropagation(); else event.currentTarget.focus(); })} />;
  return <CodexCuScope theme={theme} referenceWindowType={windowType}
    data-reduced-motion={reducedMotion == null ? undefined : String(reducedMotion)} inert={compact ? '' : undefined}
    className={join(p('flex size-full min-h-0 flex-col select-none', !compact && 'border-t-hairline border-default bg-surface p-[var(--right-panel-composer-overlay-fit-reserve,0px)]'), className)}
    style={{ '--computer-control-background': colors?.background, '--computer-control-foreground': colors?.foreground, ...style }}>
    <div className={compact ? p('flex min-h-0 flex-1') : join(c.layout, p('grid min-h-0 flex-1 grid-cols-1 p-4'))}
      data-codex-cloud-computer={control?.state ?? 'observing'} aria-label={unavailable} role={error ? 'status' : undefined}>
      <div className={join(c.viewport, p(compact ? 'flex size-full items-center justify-start' : 'row-start-1 flex min-h-0 w-full items-center justify-center self-stretch'))}
        style={compact ? undefined : { aspectRatio: ratio }}>
        <div className={join(c.videoFrame, p('relative', compact && 'size-full'))}
          data-streaming={streaming || undefined} data-takeover={takingOver || undefined}
          style={compact ? undefined : { width: `min(100cqw, ${100 * ratio}cqh)`, height: `min(100cqh, ${100 / ratio}cqw)` }}>
          {!compact && <div aria-hidden="true" className={c.videoShadow} />}
          {!compact && <div aria-hidden="true" className={c.takeoverBorder}>
            <span className={c.traceLeft}><span className={c.traceFill} /></span>
            <span className={c.traceRight}><span className={c.traceFill} /></span>
          </div>}
          <div className={join(compact ? p('rounded-md') : c.videoSurface, p('absolute inset-0 overflow-hidden',
            compact ? 'bg-surface-secondary dark:bg-surface-tertiary' : !streaming && 'bg-media-background', observing && 'cursor-interaction'))}
            onPointerDown={observing ? control.onToggle : undefined}>
            {children}{video}{webAuthnSlot}
            {imageSource != null && <img aria-hidden={streaming} alt="" draggable={false} src={imageSource}
              className={join(!compact && c.loadingOverlay, p('pointer-events-none absolute inset-0 size-full', compact || lastFrame == null ? 'object-cover' : 'object-contain',
                !compact && 'duration-relaxed ease-enter motion-reduce:transition-none'))} />}
            {!compact && !error && <div aria-hidden={streaming} role="status" className={join(c.loadingOverlay,
              p('absolute inset-0 grid place-items-center text-sm duration-relaxed ease-enter motion-reduce:transition-none',
                lastFrame == null ? 'text-secondary' : 'bg-media-background/50 text-media-foreground/70'))}>
              <Spinner className={p('icon-sm')} />
              <span className={p(lastFrame == null ? 'sr-only' : 'absolute inset-x-4 top-1/2 mt-4 text-center')}>
                {unnamed ? m('restricted.aeon.computer.connecting.dot') : m('restricted.aeon.computer.connectingNamedComputer', { orbitName })}
              </span>
            </div>}
            {!compact && (error || startupError !== undefined) && <div className={p('absolute inset-4 flex items-start justify-center')}>
              <div className={p('rounded-2xl bg-surface-elevated-secondary electron:elevation-prominent extension:border extension:border-default extension:shadow-md flex max-h-full w-max max-w-full shrink-0 items-center-safe gap-3 overflow-auto p-3 text-base text-default')}
                role={startupError === undefined ? undefined : 'alert'}>
                <span className={p('min-w-0 wrap-break-word whitespace-pre-wrap select-text')}>
                  {startupError === undefined ? unavailable : startupError ?? m('restricted.aeon.computer.startupError')}
                </span>
                {startupError !== undefined && <CodexCuButton className={p('shrink-0')} color="primary" size="dialog"
                  aria-busy={isRetryingStartup} disabled={isRetryingStartup || onStartupRetry == null} loading={isRetryingStartup} onClick={onStartupRetry}>
                  {m('restricted.aeon.computer.retryStartup')}
                </CodexCuButton>}
              </div>
            </div>}
          </div>
          {!compact && <div className={join(c.controls, p('absolute inset-x-0 top-full flex items-start justify-center', !canControl && 'invisible'))} aria-hidden={!canControl}>
            <CodexCloudAeonControl conversationId={conversationId} control={control} isTakingOver={takingOver}
              orbitAvatar={orbitAvatar} orbitName={orbitName} renderOrbitAvatar={renderOrbitAvatar} locale={locale} formatMessage={formatMessage} />
          </div>}
        </div>
      </div>
      {!compact && <div aria-hidden="true" className={p('row-start-2 min-h-20')} />}
    </div>
  </CodexCuScope>;
}

// handoff-a7bf2d3e62ea y: host resolves the original route/account gate and
// performs the existing handoff action. This button does not activate control.
export function CodexCloudComputerHandoffButton({ available = false, onOpen, leadingIcon,
  locale = 'zh-CN', formatMessage, className }) {
  if (!available) return null;
  return <CodexCuButton className={join(p('w-fit max-w-full gap-2'), className)} color="secondary" radius="full" size="large" onClick={onOpen}>
    {leadingIcon ?? <CodexCuIcon name="shared:bet" />}
    <span className={p('flex-1 text-start wrap-anywhere whitespace-normal')}>
      {message('restricted.aeon.computer.handoffOpen', locale, formatMessage)}
    </span>
    <CodexCuIcon name="shared:K9" />
  </CodexCuButton>;
}

// handoff-page-6e0d4333b8f7 w/T/E: the valid-link branch redirects; the host
// owns that navigation and its original pending renderer, exposed as a slot.
export function CodexCloudComputerHandoffPage({ signedIn = false, targetReady = false, ownerReady = false,
  pending = false, pendingSlot, onReturnHome, renderHomeLink, homeHref = '/',
  locale = 'zh-CN', formatMessage, theme, windowType, reducedMotion, className }) {
  const valid = signedIn && targetReady;
  return <CodexCuScope as="main" theme={theme} referenceWindowType={windowType}
    data-reduced-motion={reducedMotion == null ? undefined : String(reducedMotion)}
    className={join(p('flex h-dvh w-full flex-col bg-surface text-default'), className)}>
    <header className={p('flex shrink-0 justify-end p-4 select-none')}>
      <CodexCuButton as="a" href={homeHref} renderLink={renderHomeLink} onClick={onReturnHome} color="secondary" size="dialog">
        {message('restricted.aeon.computer.handoffReturnHome', locale, formatMessage)}
      </CodexCuButton>
    </header>
    <div className={p('flex min-h-0 flex-1 flex-col text-secondary')}>
      {valid && pending ? pendingSlot : (!valid || !ownerReady) && <div className={p('grid size-full place-items-center')}>
        {message('restricted.aeon.computer.handoffLinkUnavailable', locale, formatMessage)}
      </div>}
    </div>
  </CodexCuScope>;
}
