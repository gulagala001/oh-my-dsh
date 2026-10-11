import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CodexCuFileIcon, CodexCuIcon } from './codex-cu-icons.jsx';
import {
  CodexCuButton, CodexCuMenuItem, CodexCuMenuMessage, CodexCuMenuSectionLabel,
  CodexCuMenuSeparator, CodexCuMenuSurface,
} from './codex-cu-primitives.jsx';
import './codex-delivery-resource.css';
import { CodexCuScope, useCodexCuAppearance } from './codex-cu-scope.jsx';

// Codex 26.1007.21159, local-conversation-turn sc / bc, app-initial oxn / nxn.
// Complete functions, SHA-256 and UTF8/UTF16 ranges live in
// work/rea-reconstruction/delivery-resource/manifest.json.
const officeExtensions = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsm', 'xlsx']);
const remoteKinds = new Set(['ssh', 'wsl', 'remote-control']);
const officeExportKinds = { docx: 'document', xlsx: 'spreadsheet', pptx: 'presentation' };
const fileIconExtensions = {
  ts: 'typescript', tsx: 'react', jsx: 'react', js: 'javascript', mjs: 'javascript', cjs: 'javascript', hs: 'javascript',
  py: 'python', java: 'java', rs: 'rust', php: 'php', css: 'css', scss: 'css', less: 'css', sass: 'css',
  cpp: 'cplusplus', cxx: 'cplusplus', cc: 'cplusplus', c: 'cplusplus', hpp: 'cplusplus', hh: 'cplusplus', h: 'cplusplus',
  rb: 'code', go: 'code', kt: 'code', swift: 'code', m: 'code', mm: 'code', cs: 'code', sql: 'code',
  json: 'json', jsonc: 'json', md: 'document', mdx: 'document', markdown: 'document', mkd: 'document', mdown: 'document',
  html: 'html', htm: 'html', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'document',
  csv: 'spreadsheet', tsv: 'spreadsheet', xls: 'spreadsheet', xlsm: 'spreadsheet', xlsx: 'spreadsheet',
  doc: 'artifactDocument', docx: 'artifactDocument', ipynb: 'notebook', ppt: 'presentation', pptx: 'presentation',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ps1: 'shell', dockerfile: 'terminal',
  env: 'document', dotenv: 'document', gitignore: 'document', lock: 'document',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', ico: 'image',
  build: 'build', bazel: 'build', bzl: 'build', ninja: 'build', gradle: 'build', mk: 'build', makefile: 'build',
  sha: 'hashes', sha1: 'hashes', sha256: 'hashes', md5: 'hashes', checksum: 'hashes', sum: 'hashes',
  pdf: 'pdf', zip: 'folder', gz: 'folder', tgz: 'folder', tar: 'folder',
};
// Exact bundled MIME database + LEi priority rules, restricted to qki's icon prefixes.
// Full data/ranges: delivery-resource/mime-fallback.json.
const fileIconMimeFallback = Object.fromEntries([
  ['folder', 'gz zip'], ['pdf', 'pdf'],
  ['presentation', 'ppt pps pot ppam pptm sldm ppsm potm pptx sldx ppsx potx'],
  ['image', 'wmf emf exr apng avci avcs avif bmp cgm drle fits g3 gif heic heics heif heifs hej2 hsj2 ief jls jp2 jpg2 jpeg jpg jpe jph jhc jpm jpx jpf jxr jxra jxrs jxs jxsc jxsi jxss ktx ktx2 png btif pti sgi svg svgz t38 tif tiff tfx psd azv uvi uvvi uvg uvvg djvu djv dwg dxf fbs fpx fst mmr rlc ico dds mdi wdp npx b16 tap vtf wbmp xif pcx webp 3ds ras cmx fh fhc fh4 fh5 fh7 jng sid pic pct pnm pbm pgm ppm rgb tga xbm xpm xwd'],
  ['document', 'sub appcache manifest ics ifb coffee litcoffee css csv html htm shtml jade jsx less markdown md mml mdx n3 txt text conf def list log in ini dsc rtx sgml sgm shex slim slm spdx stylus styl tsv t tr roff man me ms ttl uri uris urls vcard curl dcurl mcurl scurl ged fly flx gv 3dml spot jad wml wmls vtt s asm c cc cxx cpp h hh dic htc f for f77 f90 hbs java lua mkd nfo opml p pas pde sass scss etx sfv ymp uu vcs vcf yaml yml'],
].flatMap(([type, extensions]) => extensions.split(' ').map(extension => [extension, type])));
const text = (labels, key, fallback, values = {}) => {
  const value = labels?.[key];
  return typeof value === 'function' ? value(values) : value ?? fallback;
};
const normalizePath = path => {
  const value = String(path ?? ''), unc = value.match(/^\\\\\?\\UNC\\(.*)$/i);
  if (unc != null) return `//${unc[1]}`.replaceAll('\\', '/');
  const drive = value.match(/^\\\\\?\\([a-zA-Z]:[\\/].*)$/);
  return (drive == null ? value : drive[1]).replaceAll('\\', '/');
};
const baseName = path => normalizePath(path).replace(/\/+$/, '').split('/').at(-1) ?? '';
export function codexDeliveryFileExtension(path) {
  const name = baseName(path).toLowerCase(), at = name.lastIndexOf('.');
  return at > 0 && at < name.length - 1 ? name.slice(at + 1) : null;
}
export function codexDeliveryFileIconType(path, mimeType) {
  if (!path && !mimeType) return 'file';
  if (path && /[\\/]$/.test(path)) return 'folder';
  if (baseName(path).toLowerCase() === 'skill.md') return 'skill';
  const name = baseName(path).toLowerCase(), dot = name.lastIndexOf('.');
  const iconExtension = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : dot === 0 && name.length > 1 ? name.slice(1) : dot === -1 ? name : null;
  const key = fileIconExtensions[iconExtension];
  if (key) return key;
  if (mimeType == null && fileIconMimeFallback[iconExtension]) return fileIconMimeFallback[iconExtension];
  const prefixes = [
    ['application/vnd.ms-powerpoint', 'presentation'],
    ['application/vnd.openxmlformats-officedocument.presentationml.', 'presentation'],
    ['image/', 'image'], ['text/', 'document'], ['application/pdf', 'pdf'],
    ['application/zip', 'folder'], ['application/gzip', 'folder'],
  ];
  return prefixes.find(([prefix]) => String(mimeType ?? '').startsWith(prefix))?.[1] ?? 'file';
}
export function codexDeliveryFileSubtitle(path, labels) {
  const extension = codexDeliveryFileExtension(path), upper = extension?.toUpperCase();
  if (['doc', 'docx'].includes(extension)) return text(labels, 'word', 'Word');
  if (['xls', 'xlsm', 'xlsx'].includes(extension)) return text(labels, 'excel', 'Excel');
  if (['ppt', 'pptx'].includes(extension)) return text(labels, 'powerpoint', 'Powerpoint');
  if (extension === 'tex') return text(labels, 'latexFileType', 'LaTeX document · Editable source');
  if (['pdf', 'md', 'mdx'].includes(extension)) return text(labels, 'documentFileType', `Document · ${upper}`, { extension: upper });
  if (['csv', 'tsv'].includes(extension)) return text(labels, 'spreadsheetFileType', `Spreadsheet · ${upper}`, { extension: upper });
  if (['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)) return text(labels, 'imageFileType', `Image · ${upper}`, { extension: upper });
  const normalized = normalizePath(path).replace(/\/+$/, '');
  const at = normalized.lastIndexOf('/');
  const directory = at < 0 ? '.' : normalized.slice(0, at);
  return directory === '.' ? '/' : `${directory}/`;
}

// The original _gt selector prefers detected app paths, then native mode,
// then available registered targets. A callback is additionally required here.
export function codexDeliveryVisibleTargets({ targets = [], availableTargets = [], targetMode = 'editor', onOpenTarget }) {
  const native = targets.filter(target => target.appPath != null);
  const sourceVisible = native.length ? native : targetMode === 'native'
    ? targets.filter(target => ['systemDefault', 'fileManager'].includes(target.target))
    : targets.filter(target => availableTargets.includes(target.target));
  return sourceVisible.filter(target => target.available !== false && (typeof target.onOpen === 'function' || typeof onOpenTarget === 'function'));
}

function ImageIcon({ src, size = 18 }) {
  return src ? <img alt="" src={src} width={size} height={size} draggable={false} className="codex-delivery-menu-image" /> : null;
}

function useMenu(open, onOpenChange, triggerRef, scope, point) {
  const menuRef = useRef(null), [placement, setPlacement] = useState(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || typeof document === 'undefined') return;
    const trigger = triggerRef.current, owner = trigger.ownerDocument, root = trigger.closest('[data-codex-cu-scope]');
    const update = () => {
      const rect = trigger.getBoundingClientRect();
      setPlacement({
        top: point?.y ?? rect.bottom, left: point?.x,
        right: point ? undefined : owner.documentElement.clientWidth - rect.right,
        theme: scope?.theme ?? root?.getAttribute('data-theme'),
        windowType: scope?.windowType ?? root?.getAttribute('data-codex-cu-window-type'),
      });
    };
    update();
    const outside = event => {
      if (!menuRef.current?.contains(event.target) && !trigger.contains(event.target)) onOpenChangeRef.current(false);
    };
    owner.addEventListener('pointerdown', outside);
    owner.defaultView?.addEventListener('resize', update);
    owner.addEventListener('scroll', update, true);
    return () => {
      owner.removeEventListener('pointerdown', outside);
      owner.defaultView?.removeEventListener('resize', update);
      owner.removeEventListener('scroll', update, true);
    };
  }, [open, triggerRef, scope?.theme, scope?.windowType, point?.x, point?.y]);
  const onKeyDown = event => {
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"]):not([data-disabled])') ?? [])];
    if (event.key === 'Escape') {
      event.preventDefault(); onOpenChange(false); triggerRef.current?.focus(); return;
    }
    if (event.key === 'Tab') { onOpenChange(false); return; }
    if (!items.length) return;
    const at = items.indexOf(event.target);
    const next = event.key === 'ArrowDown' ? (at + 1) % items.length
      : event.key === 'ArrowUp' ? (at - 1 + items.length) % items.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (next != null) { event.preventDefault(); items[next].focus(); }
    else if (['Enter', ' '].includes(event.key) && event.target.getAttribute('role') === 'menuitem') { event.preventDefault(); event.target.click(); }
  };
  return { menuRef, placement, onKeyDown };
}

function DeliveryMenu({ open, onOpenChange, triggerRef, scope, point, id, children, padded = true }) {
  const appearance = useCodexCuAppearance();
  const { menuRef, placement, onKeyDown } = useMenu(open, onOpenChange, triggerRef, scope, point);
  const ready = Boolean(placement);
  useLayoutEffect(() => {
    if (open && ready) menuRef.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"]):not([data-disabled])')?.focus();
  }, [open, ready]);
  if (!open || !placement || typeof document === 'undefined') return null;
  return createPortal(<CodexCuScope forceScope theme={scope?.theme ?? appearance.theme} referenceWindowType={scope?.windowType ?? appearance.referenceWindowType}
    className="codex-delivery-menu-portal" style={{ top: placement.top, right: placement.right, left: placement.left }}>
    <CodexCuMenuSurface ref={menuRef} id={id} open align="end" side="bottom" onKeyDown={onKeyDown}
      className={`codex-delivery-menu${padded ? ' codex-delivery-menu-padded' : ''}`}
      style={{ '--radix-dropdown-menu-content-available-width': 'calc(100vw - 16px)', '--radix-dropdown-menu-content-available-height': `calc(100vh - ${placement.top}px)` }}>
      <div className="codex-delivery-menu-content">{children}</div>
    </CodexCuMenuSurface>
  </CodexCuScope>, triggerRef.current.ownerDocument.body);
}

function DeliveryRow({ icon, title, subtitle, hoverSubtitle, trailing, onOpen, busy, labels, menuOpen, titleTooltip, onFocus, onMouseEnter, onContextMenu, rowRef, hitProps }) {
  return <div ref={rowRef} className="codex-delivery-resource-row" data-menu-open={menuOpen || undefined} onContextMenu={onContextMenu}>
    {typeof onOpen === 'function' && <button {...hitProps} type="button" className="codex-delivery-resource-hit" aria-busy={busy || undefined}
      disabled={busy} aria-label={text(labels, 'openResource', `Open ${title}`, { filename: title, title })}
      onClick={onOpen} onFocus={onFocus} onMouseEnter={onMouseEnter} />}
    <span className="codex-delivery-resource-body">
      <span className="codex-delivery-resource-icon">{icon}</span>
      <span className="codex-delivery-resource-text">
        <span className="codex-delivery-resource-title" title={titleTooltip}>{title}</span>
        {subtitle != null && <span className="codex-delivery-resource-subtitle">
          <span className="codex-delivery-default-subtitle">{subtitle}</span>
          {hoverSubtitle != null && <span className="codex-delivery-hover-subtitle">{hoverSubtitle}</span>}
        </span>}
      </span>
      {trailing}
    </span>
  </div>;
}

/** File operations are supplied by the host. No filesystem/clipboard backend is created. */
export function CodexDeliveryFileCard({
  path, title = baseName(path), subtitle, icon, mimeType, hostKind, platform, hostId, conversationId, cwd,
  targets = [], availableTargets = [], targetMode = 'editor', targetsLoaded = false, targetsLoading = false,
  onRequestTargets, onOpenTarget, onOpenPreview, previewAvailable = false, preview = {},
  latexEditorAvailable = false, onDownloadCopy, downloadsFolderIcon, onToast, onOpen,
  googleExport, labels, scope, contextMenu, dragProps,
}) {
  const triggerRef = useRef(null), rowRef = useRef(null), requested = useRef(false), menuId = useId();
  const [open, setOpen] = useState(false), [contextPoint, setContextPoint] = useState(null), [opening, setOpening] = useState(false);
  const extension = codexDeliveryFileExtension(path), remote = remoteKinds.has(hostKind);
  const visibleTargets = codexDeliveryVisibleTargets({ targets, availableTargets, targetMode, onOpenTarget });
  const appTargets = visibleTargets.filter(target => target.target !== 'fileManager');
  const fileManager = availableTargets.includes('fileManager')
    ? targets.find(target => target.target === 'fileManager' && target.available !== false && (typeof target.onOpen === 'function' || typeof onOpenTarget === 'function')) : null;
  const handlers = (preview.handlers ?? []).filter(handler => handler.available === true && typeof handler.onOpen === 'function');
  const previewSection = preview.capable === true && preview.disabled !== true && (handlers.length > 0 || preview.currentTabKind === 'mcp-extension' && preview.isFile === true && preview.builtinSupported === true);
  const builtin = previewSection && preview.isFile === true && preview.builtinSupported === true && typeof preview.onBuiltin === 'function';
  const exportKind = officeExportKinds[extension];
  const canExport = googleExport?.enabled === true && googleExport.featureDisabled !== true && exportKind != null && typeof googleExport.onExport === 'function';
  const canDownload = fileManager != null && !remote && Boolean(downloadsFolderIcon) && typeof onDownloadCopy === 'function';
  const canRequest = typeof onRequestTargets === 'function' && !targetsLoaded;
  const hasMenu = previewSection && (builtin || handlers.length > 0) || appTargets.length > 0 || fileManager != null || canExport || targetsLoading || canRequest;
  const requestTargets = () => {
    if (!requested.current && typeof onRequestTargets === 'function') {
      requested.current = true;
      Promise.resolve().then(() => onRequestTargets({ path, hostId, cwd })).catch(() => { requested.current = false; });
    }
  };
  const notify = (level, key, message) => onToast?.({ level, message: text(labels, key, message), toastId: key });
  const invoke = async (callback, target, options = {}) => {
    setOpen(false); setContextPoint(null);
    try {
      const result = await callback(options);
      if (result === false || result?.success === false) throw new Error('Operation unavailable');
      onOpen?.(target);
      return result;
    } catch {
      notify('danger', 'localConversation.openTarget.error', 'Unable to open item');
      return null;
    }
  };
  const openTarget = target => invoke(
    target.onOpen ? options => target.onOpen(options) : options => onOpenTarget(target.target, options),
    target.target === 'fileManager' ? 'file_manager' : target.target,
    { path, hostId, cwd, appPath: target.appPath, bundleId: target.bundleId, persistPreferred: false },
  );
  const openPreview = previewAvailable && typeof onOpenPreview === 'function' ? () => invoke(onOpenPreview, 'codex_preview', { path, hostId, cwd, conversationId, openInSidePanel: true }) : undefined;
  const download = async () => {
    setOpen(false);
    try {
      const result = await onDownloadCopy({ path, hostId, conversationId });
      if (result === false || result?.success === false) throw new Error('Copy failed');
      notify('success', 'localConversation.endResource.downloadCopy.success', 'Saved a copy to Downloads');
    } catch { notify('danger', 'localConversation.endResource.downloadCopy.failure', 'Could not download a copy'); }
  };
  const exportFile = async () => {
    setOpen(false); setOpening(true);
    const app = { document: 'Google Docs', spreadsheet: 'Google Sheets', presentation: 'Google Slides' }[exportKind];
    try {
      const result = await googleExport.onExport({ path, hostId, cwd, conversationId, title, targetType: exportKind });
      if (result === false || result?.success === false) throw new Error('Export failed');
      if (result?.url == null && !result?.handled) onToast?.({ level: 'success', message: text(labels, 'googleDriveOpened', `Opened in ${app}`, { app }), toastId: 'connectedApps.googleDrive.opened' });
    } catch { onToast?.({ level: 'danger', message: text(labels, 'googleDriveOpenFailed', `Could not open in ${app}`, { app }), toastId: 'connectedApps.googleDrive.openFailed' }); }
    finally { setOpening(false); }
  };
  const contextActions = (contextMenu?.items ?? []).filter(item => item.type === 'separator' || item.available === true && typeof item.onSelect === 'function');
  const onContextMenu = contextActions.some(item => item.type !== 'separator') ? event => {
    event.preventDefault(); setOpen(false); setContextPoint({ x: event.clientX, y: event.clientY });
  } : undefined;
  const trailing = <span className="codex-delivery-resource-actions">
    {extension === 'tex' && latexEditorAvailable && openPreview && <CodexCuButton color="primary" size="toolbar" onClick={openPreview}>
      {text(labels, 'openLatexEditor', 'Open LaTeX editor')}
    </CodexCuButton>}
    {opening ? <span role="status" className="codex-delivery-opening"><CodexCuIcon name="spinner" />{text(labels, 'opening', 'Opening')}</span>
      : <CodexCuButton ref={triggerRef} color="outline" size="toolbar" className="codex-delivery-open-button"
        disabled={!hasMenu} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} data-state={open ? 'open' : 'closed'}
        onFocus={requestTargets} onMouseEnter={requestTargets} onClick={() => { requestTargets(); setOpen(value => !value); }}
        onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key) && hasMenu) { event.preventDefault(); requestTargets(); setOpen(true); } }}>
        {text(labels, 'openIn', 'Open in')}<CodexCuIcon name="shared:_T" className="codex-delivery-chevron" />
      </CodexCuButton>}
    <DeliveryMenu open={open && hasMenu} onOpenChange={setOpen} triggerRef={triggerRef} scope={scope} id={menuId}>
      {previewSection && (builtin || handlers.length > 0) && <>
        <CodexCuMenuSectionLabel>{text(labels, 'openInChatGPT', 'Open in ChatGPT')}</CodexCuMenuSectionLabel>
        {builtin && <CodexCuMenuItem onSelect={() => invoke(preview.onBuiltin, 'codex_preview', { path, hostId, fileViewer: 'default' })}>{text(labels, 'builtIn', 'Built-in')}</CodexCuMenuItem>}
        {handlers.map(handler => <CodexCuMenuItem key={handler.id} leftIcon={handler.icon ?? <ImageIcon src={handler.iconUrl} />} onSelect={() => invoke(handler.onOpen, 'codex_preview', { path, hostId, fileViewer: handler.id })}>{handler.title}</CodexCuMenuItem>)}
        <CodexCuMenuSeparator /><CodexCuMenuSectionLabel>{text(labels, 'openInAnotherApp', 'Open in another app')}</CodexCuMenuSectionLabel>
      </>}
      {appTargets.map(target => <CodexCuMenuItem key={target.id ?? `${target.target}:${target.appPath ?? ''}`} leftIcon={<ImageIcon src={target.icon} />} onSelect={() => openTarget(target)}>
        {target.label}{target.default === true && target.kind === 'native' && target.appPath != null && officeExtensions.has(extension) ? text(labels, 'defaultSuffix', ' (Default)') : ''}
      </CodexCuMenuItem>)}
      {targetsLoading && <CodexCuMenuMessage compact role="status">{text(labels, 'loadingAvailableApps', 'Loading available apps…')}</CodexCuMenuMessage>}
      {canExport && <CodexCuMenuItem disabled={googleExport.pending === true} leftIcon={googleExport.icon} onSelect={exportFile}>
        {text(labels, `exportTo${exportKind}`, `Export to ${exportKind === 'document' ? 'Google Docs' : exportKind === 'spreadsheet' ? 'Google Sheets' : 'Google Slides'}`)}
      </CodexCuMenuItem>}
      {fileManager && <>
        {(targetsLoading || appTargets.length > 0 || canExport) && <CodexCuMenuSeparator />}
        <CodexCuMenuItem leftIcon={<ImageIcon src={fileManager.icon} />} onSelect={() => openTarget(fileManager)}>
          {platform === 'macOS' ? text(labels, 'showInFinder', 'Show in Finder') : platform === 'windows' ? text(labels, 'showInFileExplorer', 'Show in File Explorer') : text(labels, 'showInFileManager', 'Show in File Manager')}
        </CodexCuMenuItem>
        {canDownload && <CodexCuMenuItem leftIcon={<ImageIcon src={downloadsFolderIcon} />} onSelect={download}>{text(labels, 'downloadCopy', 'Download a copy')}</CodexCuMenuItem>}
      </>}
    </DeliveryMenu>
  </span>;
  return <>
    <DeliveryRow rowRef={rowRef} icon={icon ?? <CodexCuFileIcon type={codexDeliveryFileIconType(path, mimeType)} size={24} />}
      title={title} subtitle={subtitle ?? codexDeliveryFileSubtitle(path, labels)} hoverSubtitle={openPreview ? text(labels, 'openPreview', 'Open preview') : undefined}
      trailing={trailing} onOpen={openPreview} labels={labels} menuOpen={open} onContextMenu={onContextMenu} hitProps={!remote ? dragProps : undefined} />
    {contextPoint && <DeliveryMenu open onOpenChange={() => setContextPoint(null)} point={contextPoint} triggerRef={rowRef} scope={scope} padded={false}>
      {contextActions.map((item, index) => item.type === 'separator' ? <CodexCuMenuSeparator key={item.id ?? index} />
        : <CodexCuMenuItem key={item.id ?? index} leftIcon={item.icon} onSelect={() => invoke(item.onSelect, item.target, { path, hostId })}>{item.label}</CodexCuMenuItem>)}
    </DeliveryMenu>}
  </>;
}

/** Prepared references keep page/cloud/native branches explicit. Icons are original caller data. */
export function CodexDeliveryReferenceCard({ resource, labels, onToast, scope }) {
  const [busy, setBusy] = useState(false), [menuOpen, setMenuOpen] = useState(false), triggerRef = useRef(null);
  const googleSubtitles = { document: 'Google Docs', spreadsheet: 'Google Sheets', presentation: 'Google Slides', drive: 'Drive' };
  const subtitle = resource.subtitle ?? (resource.type === 'website' ? 'Website'
    : resource.type === 'google-drive' ? googleSubtitles[resource.resourceKind]
    : resource.type === 'artifact-session' ? resource.kind === 'presentation' ? 'Slide' : 'Sheet'
    : resource.type === 'page-reference' ? resource.reference?.kind === 'space' || resource.spaceId != null ? 'Space' : 'Page' : null);
  const available = resource.available === true && typeof resource.onOpen === 'function';
  const actions = (resource.menuItems ?? []).filter(item => item.type === 'separator' || item.available === true && typeof item.onSelect === 'function');
  const canMenu = actions.some(item => item.type !== 'separator') && (resource.menuLabel != null || typeof resource.renderMenuTrigger === 'function');
  const open = async event => {
    const page = resource.type === 'page-reference';
    if (page) setBusy(true);
    try { const result = await resource.onOpen(event); if (result === false || result?.success === false) throw new Error('Open failed'); }
    catch { onToast?.({ level: 'danger', toastId: page ? 'codex.space.endResource.openError' : 'localConversation.openTarget.error', message: page ? text(labels, 'sourceOpenError', "Couldn't open source") : text(labels, 'localConversation.openTarget.error', 'Unable to open item') }); }
    finally { if (page) setBusy(false); }
  };
  const previewable = resource.type === 'artifact-session' && resource.pageId != null && available;
  const triggerProps = { ref: triggerRef, 'aria-haspopup': 'menu', 'aria-expanded': menuOpen, onClick: () => setMenuOpen(value => !value) };
  const trailing = canMenu ? <span className="codex-delivery-resource-actions">
    {resource.renderMenuTrigger ? resource.renderMenuTrigger(triggerProps) : <CodexCuButton {...triggerProps} color="outline" size="toolbar" className="codex-delivery-open-button">
      {resource.menuLabel}{resource.showMenuChevron === true && <CodexCuIcon name="shared:_T" className="codex-delivery-chevron" />}
    </CodexCuButton>}
    <DeliveryMenu open={menuOpen} onOpenChange={setMenuOpen} triggerRef={triggerRef} scope={scope}>
      {actions.map((item, index) => item.type === 'separator' ? <CodexCuMenuSeparator key={item.id ?? index} />
        : <CodexCuMenuItem key={item.id ?? index} leftIcon={item.icon} onSelect={() => {
          setMenuOpen(false);
          Promise.resolve().then(() => item.onSelect()).catch(() => onToast?.({ level: 'danger', toastId: 'localConversation.openTarget.error', message: text(labels, 'localConversation.openTarget.error', 'Unable to open item') }));
        }}>{item.label}</CodexCuMenuItem>)}
    </DeliveryMenu>
  </span> : (resource.type === 'page-reference' || previewable) && available ? <span className="codex-delivery-action-chip">{text(labels, 'open', 'Open')}</span> : resource.trailing;
  const title = resource.title ?? (resource.type === 'website' ? text(labels, 'websiteTitle', 'Web preview') : resource.type === 'artifact-session' ? resource.kind === 'presentation' ? 'Slide' : 'Sheet' : resource.type === 'page-reference' ? '…' : undefined);
  return <DeliveryRow icon={resource.icon} title={title} titleTooltip={title} subtitle={subtitle}
    hoverSubtitle={previewable ? text(labels, 'openPreview', 'Open preview') : resource.hoverSubtitle}
    onOpen={available ? open : undefined} busy={busy} trailing={trailing} labels={labels} menuOpen={menuOpen} />;
}

/** Final-turn resource grouping: ≤4 rows show all; larger sets initially show three. */
export function CodexDeliveryResourceList({ resources = [], fileCardProps, renderResource, labels, variant = 'default', className = '' }) {
  const [expanded, setExpanded] = useState(false);
  const cards = resources.filter(resource => (resource.type !== 'appgen-app' || !resource.hideSiteCard) && (renderResource || resource.type === 'file' || resource.path && !resource.type || ['website', 'google-drive', 'artifact-session', 'page-reference'].includes(resource.type)));
  if (!cards.length) return null;
  const visible = expanded || cards.length <= 4 ? cards : cards.slice(0, 3), hidden = cards.length - visible.length;
  return <div className={`codex-delivery-resources codex-delivery-resources-${variant} ${className}`}>
    {visible.map((resource, index) => <React.Fragment key={resource.id ?? resource.path ?? resource.url ?? index}>
      {renderResource ? renderResource(resource) : resource.type === 'file' || resource.path && !resource.type
        ? <CodexDeliveryFileCard {...fileCardProps} {...resource} labels={resource.labels ?? labels} />
        : ['website', 'google-drive', 'artifact-session', 'page-reference'].includes(resource.type)
          ? <CodexDeliveryReferenceCard resource={resource} labels={labels} onToast={fileCardProps?.onToast} scope={fileCardProps?.scope} /> : null}
    </React.Fragment>)}
    {hidden > 0 && <button type="button" className="codex-delivery-show-more" aria-expanded={false} onClick={() => setExpanded(true)}>
      {text(labels, 'showMore', `Show ${hidden} more`, { count: hidden })}<CodexCuIcon name="shared:_T" className="codex-delivery-show-more-chevron" />
    </button>}
  </div>;
}

/** The toast visual is controlled by callers; original default duration is five seconds. */
export function CodexDeliveryToast({ level = 'success', message, leading, onClose, labels, duration = 5000 }) {
  useEffect(() => {
    if (!onClose || duration === 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);
  const leadingIcon = leading === undefined ? <CodexCuIcon name={{ info: 'shared:ozi', success: 'shared:izi', warning: 'shared:_Fi', danger: 'shared:_Fi' }[level]} size={16} /> : leading;
  return <div className={`codex-delivery-toast codex-delivery-toast-${level}`} role={level === 'danger' ? 'alert' : 'status'}>
    <div className="codex-delivery-toast-row">
      {leadingIcon != null && <span className="codex-delivery-toast-leading">{leadingIcon}</span>}
      <div className="codex-delivery-toast-content"><div className="codex-delivery-toast-title">{message}</div></div>
      {onClose && <button type="button" className="codex-delivery-toast-close" onClick={onClose} aria-label={text(labels, 'close', 'Close')}><CodexCuIcon name="shared:g$" size={16} /></button>}
    </div>
  </div>;
}
