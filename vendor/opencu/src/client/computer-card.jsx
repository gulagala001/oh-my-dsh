import React, { useEffect, useId, useRef, useState } from 'react';
import { useComputerPresentation } from './computer-presentation.mjs';
import { SavedImage, toolResultCopy } from './tool-image.jsx';
import { validComputerPresentationTarget } from '../computer-use/presentation-target.mjs';
import { CodexCuActivityRow, CodexCuActivityShimmer, CodexCuTimelineActivityBody } from './codex-cu-activity-group.jsx';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import { CodexCuDialog, CodexCuDialogTitle } from './codex-cu-dialog.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';

const join = (...values) => values.filter(Boolean).join(' ');
const json = value => { try { return JSON.stringify(value, null, 2); } catch { return String(value); } };

// kqi → Fqi/It → Mqi/Nqi/zqi. Ordinary ka(text) never uses this renderer.
// The verified packed JSON grammar/core is loaded only for explicit json/jsonc;
// other languages retain the source plain fallback until their provider exists.
export function ToolCodeOutput({ content = '', language = 'plaintext', title, showActionBar = true,
  showStickyRightContent = true, showCopyButton = true, stickyHeader = false, shouldWrapCode = false,
  codeClassName, codeContainerClassName, wrapperClassName, clipboardContent, codeCopyText,
  copyButtonText = '复制代码', onCopy, onCopyCode, onToggleWrapCode, actionButtons,
  trailingActionButtons, alternateContent, previewContent, isShowingPreview = false,
  deferEnhancementsUntilVisible = false, variant = 'default', ...props }) {
  const [copied, setCopied] = useState(false), [copyError, setCopyError] = useState(''), [copyPending, setCopyPending] = useState(false), copyTimer = useRef(null);
  const wrapper = useRef(null), highlightState = useRef({ disposed: false, latestContent: content, latestLanguage: language, lastStartedAtMs: null, timeoutHandle: null });
  const [visible, setVisible] = useState(false), [highlighted, setHighlighted] = useState(null);
  const enhancementsReady = !deferEnhancementsUntilVisible || visible;
  const normalizedLanguage = language?.trim().toLowerCase();
  const isPlaintext = normalizedLanguage === 'plaintext';
  const highlightEnabled = enhancementsReady && alternateContent == null && !(isShowingPreview && previewContent != null) && ['json', 'jsonc'].includes(normalizedLanguage);
  useEffect(() => {
    if (enhancementsReady || !wrapper.current) return;
    if (typeof IntersectionObserver === 'undefined') { const timeout = setTimeout(() => setVisible(true), 0); return () => clearTimeout(timeout); }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '600px 0px' });
    observer.observe(wrapper.current); return () => observer.disconnect();
  }, [enhancementsReady]);
  useEffect(() => {
    const state = highlightState.current;
    state.latestContent = content; state.latestLanguage = language;
    if (!highlightEnabled || state.timeoutHandle != null) return;
    const elapsed = state.lastStartedAtMs == null ? 120 : performance.now() - state.lastStartedAtMs;
    const start = () => {
      state.timeoutHandle = null; if (state.disposed) return;
      const currentContent = state.latestContent, currentLanguage = state.latestLanguage;
      state.lastStartedAtMs = performance.now();
      import('./codex-tool-json-highlighter.mjs').then(provider => {
        if (state.disposed) return;
        const result = provider.highlightToolJson(currentContent, currentLanguage);
        if (result != null) setHighlighted(result);
      }).catch(() => { /* Fqi also falls back to plain code on provider failure. */ });
    };
    const delay = Math.max(0, 120 - elapsed);
    if (delay === 0) start(); else state.timeoutHandle = setTimeout(start, delay);
  }, [content, language, highlightEnabled]);
  useEffect(() => {
    const state = highlightState.current; state.disposed = false;
    return () => { state.disposed = true; if (state.timeoutHandle != null) { clearTimeout(state.timeoutHandle); state.timeoutHandle = null; } };
  }, []);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const copy = async () => {
    if (copyPending || copied) return;
    setCopyPending(true);
    try { await navigator.clipboard.writeText(clipboardContent ?? String(content)); setCopyError(''); setCopied(true); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2000); onCopy?.(); onCopyCode?.(); }
    catch (error) { setCopyError(error?.message || '复制失败'); }
    finally { setCopyPending(false); }
  };
  // kqi keeps the highlighted prefix during streaming and appends actual plain
  // content; stale unrelated output cannot replace the current text.
  const acceptedHighlight = ['json', 'jsonc'].includes(normalizedLanguage) && highlighted != null && typeof content === 'string' && content.startsWith(highlighted.code) ? highlighted : null;
  const lines = isPlaintext && enhancementsReady ? String(content).split('\n') : acceptedHighlight?.html.split('\n');
  const remainder = acceptedHighlight == null ? content : content.slice(acceptedHighlight.code.length);
  const codeContent = lines == null ? <span>{content}</span> : <span>{lines.map((line, index) => <React.Fragment key={index}>{isPlaintext ? <span>{line}</span> : <span dangerouslySetInnerHTML={{ __html: line }}/>}{index < lines.length - 1 ? '\n' : null}</React.Fragment>)}{!isPlaintext && remainder ? <span>{remainder}</span> : null}</span>;
  return <CodexCuScope ref={wrapper} className={join('tx-cu-code-output', wrapperClassName)} data-variant={variant} data-wrap={shouldWrapCode ? 'true' : undefined} data-markdown-copy="code-block" data-markdown-copy-text={codeCopyText} {...props}>
    {showActionBar && <div className={'tx-cu-code-actionbar' + (stickyHeader && !isShowingPreview ? ' is-sticky' : '')} data-markdown-copy="exclude">
      {variant === 'default' && (title ?? language) != null && <CodexCuIcon name="shared:b$" size={16}/>}
      <span className="tx-cu-code-title">{title ?? language}</span>
      {showStickyRightContent && <div className="tx-cu-code-actions">
        {variant !== 'default' && actionButtons}
        {onToggleWrapCode && <CodexCuButton color="ghostActive" size="imageToolbar" uniform aria-label={shouldWrapCode ? '禁用自动换行' : '启用自动换行'} aria-pressed={shouldWrapCode} onClick={onToggleWrapCode}><CodexCuIcon name={shouldWrapCode ? 'shared:bqi' : 'shared:_qi'} size={16}/></CodexCuButton>}
        {variant === 'default' && actionButtons}
        {showCopyButton && <CodexCuButton color={variant === 'default' ? 'ghostActive' : 'ghost'} size={variant === 'default' ? 'imageToolbar' : 'icon'} uniform={variant === 'default'} aria-label={copied ? '已复制' : copyButtonText} title={copied ? '已复制' : copyButtonText} aria-busy={copyPending || undefined} aria-disabled={copyPending || undefined} onClick={copied ? undefined : copy}><CodexCuIcon name={variant === 'default' ? copied ? 'shared:y$' : 'shared:x$' : copied ? 'shared:r7' : 'shared:SGi'} size={16}/></CodexCuButton>}
        {trailingActionButtons}
      </div>}
    </div>}
    {!(isShowingPreview && previewContent != null) && (alternateContent ?? <div className={join('tx-cu-code-container', codeContainerClassName)} dir="ltr"><code className={join('tx-cu-code-content', codeClassName)}>{codeContent}</code></div>)}
    {previewContent}
    {copyError && <span className="tx-cu-result-error" role="alert">{copyError}</span>}
  </CodexCuScope>;
}

function ToolTextResult({ text }) {
  // ka(text), not kqi: plaintext title and a 48-spacing-unit scroll area.
  return <div className="tx-cu-plaintext-result"><div className="tx-cu-plaintext-heading"><span>{toolResultCopy.plaintext}</span><div/></div><div className="tx-cu-plaintext-body"><pre>{text}</pre></div></div>;
}

function ToolResultBlock({ item, loadImage }) {
  if (item.type === 'image') return <SavedImage attachment={item.attachment} loadImage={loadImage} src={item.data && item.mimeType ? `data:${item.mimeType};base64,${item.data}` : undefined} alt="工具返回的图片"/>;
  if (item.type === 'text') return <ToolTextResult text={item.text ?? ''}/>;
  if (item.type === 'audio' && item.data && item.mimeType) return <audio controls src={`data:${item.mimeType};base64,${item.data}`}/>;
  if (item.type === 'resource_link' || item.type === 'resource-link') return <div className="tx-cu-resource-link">{toolResultCopy.resourceRead.replace('{resourceLinkName}',item.title??item.name??item.uri??'')}</div>;
  if (item.type === 'embedded_resource' || item.type === 'resource') {
    const resource = item.resource ?? {}, text = resource.text ?? resource.blob;
    return <div className="tx-cu-embedded-resource"><div><strong>URI</strong> <span>{resource.uri}</span></div>{resource.mimeType && <div><strong>MIME type</strong> <span>{resource.mimeType}</span></div>}{text != null && <><strong>Content</strong><pre>{text}</pre></>}</div>;
  }
  return <pre className="tx-cu-unknown-result">{json(item.raw ?? item)}</pre>;
}

export function ComputerCard({ block, loadImage, toolName, openFile, sessionId, callId, renderFiles }) {
  const [open, setOpen] = useState(false), [rawOpen, setRawOpen] = useState(false), bodyId = useId();
  const stored = useComputerPresentation(sessionId, block.kind === 'tool-result' && !block.meta && !block.isError ? [callId] : []);
  let args = {}; try { const value = JSON.parse(block.call?.argsRaw ?? block.argsRaw ?? '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) args = value; } catch {}
  const meta = block.meta ?? stored[callId], target = validComputerPresentationTarget(meta?.computerUseTarget) ? meta.computerUseTarget : null;
  const preparing = block.phase === 'preparing', settled = block.kind === 'tool-result', failure = block.isError || meta?.computerUseError;
  const content = Array.isArray(block.content) ? block.content : [], message = content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  const files = Array.isArray(meta?.computerUseFiles) ? meta.computerUseFiles : [];
  const stopped = failure && /tool call aborted|COMPUTER_USE_STOPPED|Computer Use (?:was |is )?stopped|execution (?:was )?cancelled/i.test(message + '\n' + (meta?.computerUseError ?? ''));
  const status = preparing ? '准备调用' : !settled ? '执行中' : stopped ? '已停止' : failure ? '执行失败' : '已完成';
  const title = (typeof args.title === 'string' ? args.title.replace(/\s+/g, ' ').trim() : '').slice(0, 80)
    || (toolName === 'computer_use_reset' ? '重置电脑操作' : target ? `使用${target.label}` : '使用电脑');
  const failureText = String(meta?.computerUseError?.message ?? meta?.computerUseError ?? '')
    || message.split('\n').findLast(line => /Execution failed:|tool call aborted|COMPUTER_USE_STOPPED/i.test(line)) || message.split('\n').find(line => line.trim()) || status;
  const state = preparing ? 'preparing' : !settled ? 'running' : stopped ? 'stopped' : failure ? 'error' : 'idle';
  const rawInvocation = block.invocation ?? block.call?.invocation ?? { tool: toolName, arguments: args };
  const rawHeading = rawInvocation.server ? toolResultCopy.rawHeading.replace('{server}', rawInvocation.server).replace('{tool}', rawInvocation.tool ?? toolName ?? '') : `原始 ${rawInvocation.tool ?? toolName ?? ''} 工具调用输出`;
  const defaultFiles = <div className="tx-cu-export-files" aria-label="交付文件">{files.map((file, index) => <button key={file.path ?? index} type="button" onClick={() => openFile?.(file.path)} disabled={!openFile} title={file.path}><CodexCuIcon name="file" size={16}/><span>{file.name || file.path?.split(/[\\/]/).pop()}</span></button>)}</div>;
  const body = <>
    {failure && <p className="tx-cu-result-error" role="status">{failureText}</p>}
    {open && !preparing && <CodexCuTimelineActivityBody id={bodyId} className="tx-cu-card-body">
      <div className="tx-cu-result-blocks">{content.map((item, index) => <ToolResultBlock key={index} item={item} loadImage={loadImage}/>)}</div>
      {!!files.length && (renderFiles?.({ files, openFile, sessionId, callId }) ?? defaultFiles)}
      <CodexCuButton className="tx-cu-raw-result-button" color="ghost" size="icon" aria-label={toolResultCopy.rawTrigger} title={toolResultCopy.rawTrigger} onClick={() => setRawOpen(true)}><CodexCuIcon name="shared:ZE" size={12}/></CodexCuButton>
    </CodexCuTimelineActivityBody>}
  </>;
  return <CodexCuScope className="tx-cu-tool-result-scope">
    <CodexCuActivityRow className="tx-cu-card" headerClassName="tx-cu-card-heading" data-state={state}
      icon={<CodexCuIcon name={target?.kind === 'tab' ? 'browser' : 'screen'} size={16}/>}
      summary={<CodexCuActivityShimmer active={preparing || !settled}>{title}{stopped ? ' · 已停止' : failure ? ' · 执行失败' : ''}</CodexCuActivityShimmer>}
      disclosure={preparing ? undefined : { expanded: open, onToggle: () => setOpen(value => !value), accessibleLabel: title }}
      body={body}/>
    <span className="tx-cu-result-sr-only" role="status">{status}</span>
    <CodexCuDialog open={rawOpen} onOpenChange={setRawOpen} size="wide" contentClassName="tx-cu-raw-result-dialog" contentProps={{ 'aria-label': rawHeading }}>
      <CodexCuDialogTitle>{rawHeading}</CodexCuDialogTitle>
      <div className="tx-cu-raw-result-content"><ToolCodeOutput language="json" codeContainerClassName="max-h-128 overflow-auto" content={json({ callId, invocation: rawInvocation, durationMs: block.durationMs, result: content })}/></div>
    </CodexCuDialog>
  </CodexCuScope>;
}
