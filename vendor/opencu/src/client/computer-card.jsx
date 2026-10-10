import React, { useId, useState } from 'react';
import { ComputerIcon } from './computer-icons.jsx';
import { useComputerPresentation } from './computer-presentation.mjs';
import { SavedImage } from './tool-image.jsx';
import { validComputerPresentationTarget } from '../computer-use/presentation-target.mjs';

const sizeLabel = bytes => !Number.isFinite(bytes) ? '' : bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B';

export function ComputerCard({ block, loadImage, toolName, openFile, sessionId, callId }) {
  const [open, setOpen] = useState(false), bodyId = useId();
  const stored = useComputerPresentation(sessionId, block.kind === 'tool-result' && !block.meta && !block.isError ? [callId] : []);
  let args = {}; try { const value = JSON.parse(block.call?.argsRaw ?? block.argsRaw ?? '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) args = value; } catch {}
  const meta = block.meta ?? stored[callId], target = validComputerPresentationTarget(meta?.computerUseTarget) ? meta.computerUseTarget : null;
  const preparing = block.phase === 'preparing', settled = block.kind === 'tool-result', failure = block.isError || meta?.computerUseError;
  const content = block.content ?? [], message = content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  const images = content.filter(item => item.type === 'image'), files = meta?.computerUseFiles ?? [];
  const stopped = failure && /tool call aborted|COMPUTER_USE_STOPPED|Computer Use (?:was |is )?stopped|execution (?:was )?cancelled/i.test(message + '\n' + (meta?.computerUseError ?? ''));
  const status = preparing ? '准备调用' : !settled ? '执行中' : stopped ? '已停止' : failure ? '执行失败' : '已完成';
  const title = (typeof args.title === 'string' ? args.title.replace(/\s+/g, ' ').trim() : '').slice(0, 80)
    || (toolName === 'computer_use_reset' ? '重置电脑操作' : target ? `使用${target.label}` : '使用电脑');
  const failureText = String(meta?.computerUseError?.message ?? meta?.computerUseError ?? '')
    || message.split('\n').findLast(line => /Execution failed:|tool call aborted|COMPUTER_USE_STOPPED/i.test(line)) || message.split('\n').find(line => line.trim()) || status;
  return <div className="tx-cu-card" data-state={preparing ? 'preparing' : !settled ? 'running' : stopped ? 'stopped' : failure ? 'error' : 'idle'}>
    <button type="button" className="tx-cu-card-heading" disabled={preparing} aria-expanded={preparing ? undefined : open} aria-controls={preparing ? undefined : bodyId} onClick={() => setOpen(value => !value)}>
      <span className="tx-cu-card-leading"><ComputerIcon name={target?.kind === 'tab' ? 'browser' : 'screen'} size={16}/><ComputerIcon className="tx-cu-card-chevron" name="chevron" size={14}/></span>
      <span className="tx-cu-card-title" title={title}>{title}</span>
      {target && <span className="tx-cu-card-target" title={target.origin ?? target.label}>{target.label}</span>}
      <small className={failure && !stopped ? 'tx-cu-error' : settled && !stopped ? 'tx-cu-visually-hidden' : ''}>{status}</small>
    </button>
    {(images.length > 0 || files.length > 0) && <div className="tx-cu-card-deliverables" aria-label="操作结果">
      {!!images.length && <div className="tx-cu-result-images">{images.map((item, index) => <SavedImage key={index} attachment={item.attachment} loadImage={loadImage}/>)}</div>}
      {!!files.length && <div className="tx-cu-export-files">{files.map((file, index) => <button key={index} type="button" onClick={() => openFile?.(file.path)} disabled={!openFile} title={file.path}>
        <ComputerIcon name="file" size={21}/><span><strong>{file.name}</strong><small>{sizeLabel(file.bytes)}</small></span><ComputerIcon name="popout" size={14}/>
      </button>)}</div>}
    </div>}
    {failure && <p className="tx-cu-card-failure tx-cu-error" role="status">{failureText}</p>}
    {open && !preparing && <div className="tx-cu-card-body" id={bodyId}>
      <details open={!images.length && !files.length}><summary>查看操作与结果</summary>{args.code && <pre aria-label="操作代码">{args.code}</pre>}{message && <pre aria-label="操作输出">{message}</pre>}</details>
    </div>}
  </div>;
}
