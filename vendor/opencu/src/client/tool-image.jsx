import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuDialog } from './codex-cu-dialog.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';
import { CodexCuMenuItem, CodexCuMenuSurface } from './codex-cu-primitives.jsx';

// Verified Chinese locale entries and UTF-16/UTF-8 anchors: local-copy.json.
export const toolResultCopy=Object.freeze({plaintext:'纯文本',rawTrigger:'显示原始工具调用输出',rawHeading:'原始 {server}.{tool} 工具调用输出',resourceRead:'已读取 {resourceLinkName}',openImageInTab:'在新标签页中打开图像',copyImageAddress:'复制图像网址',addImageToChat:'添加到聊天',copyImage:'复制图像'});

// Se→iMi native image-context-menu visual. Providers are explicit capabilities;
// an unavailable image editor/upload/Finder service is not replaced with a fake.
export const ToolImageContextMenu=React.forwardRef(function ToolImageContextMenu({src,open=true,position,onClose,
  onOpenInNewTab,onAddToChat,onCopyImage,onRevealInFileManager,onDownload,onFailure,
  canSelect=true,canCopy=true,localPath,localHost=false,downloadCopyLabel='下载副本'},ref){
  const select=callback=>async()=>{onClose?.();try{await callback?.();}catch(error){onFailure?.(error);}};
  const webAddress=/^https?:/i.test(src??'')?src:null;
  return <CodexCuMenuSurface ref={ref} open={open} className="tx-cu-tool-image-context-menu" style={position} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose?.();return;}const items=[...event.currentTarget.querySelectorAll('[role=menuitem]:not([aria-disabled=true])')],index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}if((event.key==='Enter'||event.key===' ')&&document.activeElement?.getAttribute('role')==='menuitem'){event.preventDefault();document.activeElement.click();}}}>
    <CodexCuMenuItem disabled={!onOpenInNewTab} onSelect={select(onOpenInNewTab)}>{toolResultCopy.openImageInTab}</CodexCuMenuItem>
    {webAddress&&<CodexCuMenuItem onSelect={select(()=>navigator.clipboard.writeText(webAddress))}>{toolResultCopy.copyImageAddress}</CodexCuMenuItem>}
    {canSelect&&<CodexCuMenuItem disabled={!onAddToChat} onSelect={select(onAddToChat)}>{toolResultCopy.addImageToChat}</CodexCuMenuItem>}
    {canCopy&&typeof navigator.clipboard?.write==='function'&&<CodexCuMenuItem disabled={!onCopyImage} onSelect={select(onCopyImage)}>{toolResultCopy.copyImage}</CodexCuMenuItem>}
    {localPath&&localHost&&<CodexCuMenuItem disabled={!onRevealInFileManager} onSelect={select(()=>onRevealInFileManager?.(localPath))}>Show in Finder</CodexCuMenuItem>}
    {onDownload?<CodexCuMenuItem onSelect={select(onDownload)}>{downloadCopyLabel}</CodexCuMenuItem>:<CodexCuMenuItem href={src} download="computer-use-screenshot.png" onClick={()=>onClose?.()}>{downloadCopyLabel}</CodexCuMenuItem>}
  </CodexCuMenuSurface>;
});

// CIe=shared:i9t, xel/Cel/wel/Tel/Del/Ael. Values are percentages.
const zoomSteps = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
const clampUnit = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : .5;
const pair = points => { const [a, b] = [...points.values()]; if (!a || !b) return null; const distance = Math.hypot(a.x - b.x, a.y - b.y); return distance > 0 ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance } : null; };

// Classic xel branch. The separate gated native image_overlay branch is not used.
export function ImageDialog({ src, alt = 'Computer Use 截图大图', onClose, open = true, onOpenChange,
  controlsSurface = 'opaque', showZoomControls = true, toolbarLeadingAction, toolbarActions,
  toolbarContent, editButton, previewContent, bottomContent, caption, renderBottomAction,
  onNextImage, onPreviousImage, previousDisabled = false, nextDisabled = false,
  downloadFileName = 'computer-use-screenshot.png', downloadSrc = src, showDownload = true,
  onDownload, onDownloadClick, onDownloaded, onDownloadFailure, imageDraggable = false,
  imageDisplaySize, imageDecoding, imageFetchPriority, imageLoading, imageReferrerPolicy,
  onImageLoad, onImageError, portalContainer, containedInPortal = false, modal = true,
  closeAriaLabel = '关闭图片预览', dialogAriaLabel = '图片预览', downloadAriaLabel = '下载图片',
  previousAriaLabel = '上一张图像', nextAriaLabel = '下一张图像', onOpenAutoFocus, onCloseAutoFocus }) {
  const canvas = useRef(null), image = useRef(null), observer = useRef(null), points = useRef(new Map()), drag = useRef(null), pinch = useRef(null), moved = useRef(false);
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement);
  const [size, setSize] = useState(imageDisplaySize ?? null), [zoom, setZoom] = useState(null), [space, setSpace] = useState(null), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0), [panning, setPanning] = useState(false);
  useEffect(() => { setSize(imageDisplaySize ?? null); setZoom(null); setFailed(false); points.current.clear(); drag.current = null; pinch.current = null; }, [src, imageDisplaySize?.width, imageDisplaySize?.height]);
  useEffect(() => () => observer.current?.disconnect(), []);
  const measureCanvas = useCallback(node => {
    observer.current?.disconnect(); canvas.current = node;
    if (!node) { setSpace(null); return; }
    const measure = () => { const rect = node.getBoundingClientRect(), cssZoom = node.currentCSSZoom || 1; setSpace({ width: rect.width / cssZoom, height: rect.height / cssZoom }); };
    if (typeof ResizeObserver !== 'undefined') { observer.current = new ResizeObserver(measure); observer.current.observe(node); }
    measure();
  }, []);
  const candidateFit = size && space ? Math.min(1, space.width / size.width, space.height / size.height) * 100 : null;
  const fit = candidateFit != null && Number.isFinite(candidateFit) && candidateFit > 0 ? candidateFit : null;
  const percent = zoom ?? fit, ramp = [...zoomSteps, ...(fit != null && !zoomSteps.includes(fit) ? [fit] : [])].sort((a, b) => a - b), minimum = ramp[0], maximum = ramp.at(-1);
  const close = () => { onOpenChange?.(false); onClose?.(); };
  const reset = () => { setZoom(null); if (canvas.current) { canvas.current.scrollLeft = 0; canvas.current.scrollTop = 0; } };
  const zoomAt = (next, x, y) => {
    if (!Number.isFinite(next)) return;
    const viewport = canvas.current, img = image.current;
    if (!viewport || !img) { setZoom(next); return; }
    const before = img.getBoundingClientRect(), fractionX = clampUnit((x - before.left) / before.width), fractionY = clampUnit((y - before.top) / before.height);
    flushSync(() => setZoom(next));
    const after = img.getBoundingClientRect(); viewport.scrollLeft += after.left + after.width * fractionX - x; viewport.scrollTop += after.top + after.height * fractionY - y;
  };
  const zoomBy = direction => {
    if (percent == null) return;
    const next = direction > 0 ? ramp.find(value => value > percent) ?? maximum : ramp.slice().reverse().find(value => value < percent) ?? minimum;
    const rect = canvas.current?.getBoundingClientRect(); if (rect) zoomAt(next, rect.left + rect.width / 2, rect.top + rect.height / 2); else setZoom(next);
  };
  useLayoutEffect(() => {
    const viewport = canvas.current; if (!viewport || !showZoomControls || previewContent != null || percent == null) return;
    const wheel = event => { if (!event.ctrlKey) return; event.preventDefault(); event.stopPropagation(); const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1); zoomAt(Math.min(maximum, Math.max(minimum, percent * Math.exp(-delta / 200))), event.clientX, event.clientY); };
    viewport.addEventListener('wheel', wheel, { passive: false }); return () => viewport.removeEventListener('wheel', wheel);
  }, [percent, maximum, minimum, showZoomControls, previewContent, space]);
  const navigate = callback => { reset(); callback?.(); };
  const down = event => {
    if (previewContent != null || !showZoomControls || event.button !== 0) return;
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); moved.current = false;
    if (points.current.size > 1) { const value = pair(points.current); pinch.current = value && percent != null ? { distance: value.distance, zoom: percent } : null; drag.current = null; }
    else if (canvas.current) drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: canvas.current.scrollLeft, top: canvas.current.scrollTop };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = event => {
    if (!points.current.has(event.pointerId)) return;
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.current.size > 1) { const value = pair(points.current), start = pinch.current; if (value && start) { event.preventDefault(); moved.current = true; zoomAt(Math.min(maximum, Math.max(minimum, start.zoom * value.distance / start.distance)), value.x, value.y); } return; }
    const start = drag.current; if (!start || !canvas.current) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3) { moved.current = true; setPanning(true); }
    canvas.current.scrollLeft = start.left - (event.clientX - start.x); canvas.current.scrollTop = start.top - (event.clientY - start.y);
  };
  const up = event => {
    points.current.delete(event.pointerId); drag.current = null; pinch.current = null; setPanning(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const [remaining] = points.current.entries(); if (remaining && canvas.current) drag.current = { id: remaining[0], ...remaining[1], left: canvas.current.scrollLeft, top: canvas.current.scrollTop };
  };
  const download = event => {
    onDownloadClick?.();
    if (onDownload) { event.preventDefault(); onDownload(); return; }
    // A browser download target cannot report the native host's completion.
    // Preserve that gap rather than invoke onDownloaded before completion.
  };
  const navigation = onPreviousImage != null || onNextImage != null;
  return <CodexCuScope forceScope className="tx-cu-image-preview-scope">
    <CodexCuDialog open={open} onOpenChange={value => { if (!value) close(); }} modal={modal && !containedInPortal} viewportSized={!containedInPortal} unstyledContent showDialogClose={false}
      portalContainer={portalContainer} overlayClassName="tx-cu-image-viewer-overlay" contentClassName={'tx-cu-image-viewer' + (containedInPortal ? ' is-contained' : '')}
      contentProps={{ 'aria-label': dialogAriaLabel, 'data-controls': controlsSurface,
        onOpenAutoFocus, onCloseAutoFocus: event => { onCloseAutoFocus?.(event); if (!event.defaultPrevented) opener.current?.isConnected && opener.current.focus({ preventScroll: true }); },
        onInteractOutside: containedInPortal || !modal ? event => event.preventDefault() : undefined,
        onClick: event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); },
        onKeyDown: event => { if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent.isComposing || event.target.closest('input,textarea,[contenteditable=true]')) return; if (event.key === 'ArrowLeft' && onPreviousImage && !previousDisabled) { event.preventDefault(); navigate(onPreviousImage); } else if (event.key === 'ArrowRight' && onNextImage && !nextDisabled) { event.preventDefault(); navigate(onNextImage); } }
      }}>
      <div className={'tx-cu-image-layout' + (navigation ? ' has-navigation' : '')} onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
        <div className="tx-cu-image-tools">
          {toolbarLeadingAction && <button type="button" className="tx-cu-image-control tx-cu-image-leading" aria-label={toolbarLeadingAction.ariaLabel} aria-pressed={toolbarLeadingAction.active} onClick={toolbarLeadingAction.onClick}><span>{toolbarLeadingAction.label}</span></button>}
          {editButton && <button type="button" className="tx-cu-image-control" aria-label={editButton.ariaLabel} onClick={editButton.onClick}>{editButton.icon}</button>}
          {showDownload && <a className="tx-cu-image-control" href={downloadSrc} download={downloadFileName} aria-label={downloadAriaLabel} title={downloadAriaLabel} onClick={download} onError={onDownloadFailure}><CodexCuIcon name="shared:hb" size={16}/></a>}
          {toolbarContent}{toolbarActions?.map(action => <button key={action.ariaLabel} type="button" className="tx-cu-image-control" aria-label={action.ariaLabel} onClick={action.onClick}>{action.icon}</button>)}
          <button type="button" className="tx-cu-image-control" aria-label={closeAriaLabel} title={closeAriaLabel} autoFocus onClick={close}><CodexCuIcon name="shared:VT" size={20}/></button>
        </div>
        {onPreviousImage && <button type="button" className="tx-cu-image-control tx-cu-image-previous" aria-label={previousAriaLabel} disabled={previousDisabled} onClick={() => navigate(onPreviousImage)}><CodexCuIcon name="initial:gel" size={20}/></button>}
        {onNextImage && <button type="button" className="tx-cu-image-control tx-cu-image-next" aria-label={nextAriaLabel} disabled={nextDisabled} onClick={() => navigate(onNextImage)}><CodexCuIcon name="initial:gel" size={20} style={{ transform: 'rotate(180deg)' }}/></button>}
        <div ref={measureCanvas} className={'tx-cu-image-canvas' + (previewContent != null ? ' has-preview' : '') + (panning ? ' is-panning' : '')} onPointerDownCapture={down} onPointerMoveCapture={move} onPointerUpCapture={up} onPointerCancelCapture={up} onClick={event => { if (moved.current) { moved.current = false; return; } if (event.target === event.currentTarget) close(); }}>
          {previewContent ?? (failed ? <div className="tx-cu-image-failure" role="alert">图片加载失败<button type="button" className="tx-cu-image-control" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>重试</button></div> : <img ref={image} key={src + ':' + retry} src={src} alt={alt} draggable={imageDraggable} decoding={imageDecoding} fetchPriority={imageFetchPriority} loading={imageLoading} referrerPolicy={imageReferrerPolicy} style={size && percent != null ? { width: size.width * percent / 100, height: size.height * percent / 100 } : { maxWidth: '100%', maxHeight: '100%' }} onError={event => { setFailed(true); onImageError?.(event); }} onLoad={event => { setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); onImageLoad?.(event); }}/>) }
        </div>
        {(showZoomControls || bottomContent || caption?.trim() || renderBottomAction) && <div className="tx-cu-image-bottom">
          {renderBottomAction?.('tx-cu-image-control')}{bottomContent}{caption?.trim() && <div className="tx-cu-image-caption">{caption}</div>}
          {showZoomControls && <div className="tx-cu-image-zoom"><button type="button" aria-label="缩小图片" disabled={percent == null || percent <= minimum} onClick={() => zoomBy(-1)}><CodexCuIcon name="shared:EC" size={16}/></button><output aria-label="图片缩放比例">{percent == null ? '' : Math.round(percent) + '%'}</output><button type="button" aria-label="放大图片" disabled={percent == null || percent >= maximum} onClick={() => zoomBy(1)}><CodexCuIcon name="initial:ULo" size={16}/></button></div>}
        </div>}
      </div>
    </CodexCuDialog>
  </CodexCuScope>;
}

export function SavedImage({ attachment, loadImage, src: providedSrc, alt = '工具返回的图片', imageMenuProps }) {
  const [src, setSrc] = useState(providedSrc ?? ''), [error, setError] = useState(''), [retry, setRetry] = useState(0), [open, setOpen] = useState(false), [contextMenu,setContextMenu]=useState(null), [menuError,setMenuError]=useState('');const trigger=useRef(null),menu=useRef(null);
  useEffect(() => {
    let active = true; setSrc(providedSrc ?? ''); setError(''); setOpen(false);setContextMenu(null);setMenuError('');
    if (!providedSrc && loadImage) Promise.resolve().then(() => loadImage(attachment)).then(value => { if (active) { if (value) setSrc(value); else setError('图片加载失败'); } }).catch(error => { if (active) setError(error.message || '图片加载失败'); });
    else if (!providedSrc) setError('图片读取暂不可用');
    return () => { active = false; };
  }, [attachment, loadImage, providedSrc, retry]);
  useEffect(()=>{if(!contextMenu)return;const outside=event=>{if(!menu.current?.contains(event.target))setContextMenu(null);};document.addEventListener('pointerdown',outside);menu.current?.querySelector('[role=menuitem]:not([aria-disabled=true])')?.focus();return()=>document.removeEventListener('pointerdown',outside);},[contextMenu]);
  const openContextMenu=event=>{event.preventDefault();const container=event.currentTarget.closest('[data-codex-cu-scope]'),box=event.currentTarget.getBoundingClientRect(),x=event.clientX||box.left,y=event.clientY||box.bottom;setContextMenu({container,style:{position:'fixed',left:Math.max(8,Math.min(window.innerWidth-248,x)),top:Math.max(8,Math.min(window.innerHeight-240,y)),maxWidth:'calc(100vw - 16px)',maxHeight:'calc(100vh - 16px)'}});};
  return <CodexCuScope className="tx-cu-tool-image-scope">
    {error ? <button type="button" className="tx-cu-image-retry" onClick={() => setRetry(value => value + 1)} title={error}>图片加载失败 · 重试</button> : src ? <><button ref={trigger} type="button" className="tx-cu-image-button" aria-label="查看截图大图" onContextMenu={openContextMenu} onClick={() => setOpen(true)} onKeyDown={event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')openContextMenu(event);}}><img className="tx-cu-card-image" src={src} alt={alt} onError={() => setError('图片无法显示，请重试')}/></button>{open && <ImageDialog src={src} alt={alt} onClose={() => setOpen(false)}/>}</> : <span className="tx-cu-image-loading" role="status">正在加载图片…</span>}
    {contextMenu?.container&&createPortal(<ToolImageContextMenu {...imageMenuProps} ref={menu} src={src} position={contextMenu.style} onClose={()=>{setContextMenu(null);trigger.current?.focus();}} onFailure={error=>setMenuError(error?.message||'无法完成图片操作')}/>,contextMenu.container)}
    {menuError&&<span className="tx-cu-result-error" role="alert">{menuError}</span>}
  </CodexCuScope>;
}
