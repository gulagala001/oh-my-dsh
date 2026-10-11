import React, {useEffect, useRef, useState} from 'react';
import {CodexCuIcon, CodexCuFileIcon} from './codex-cu-icons.jsx';
import {CodexCuButton, CodexCuTooltip, CodexCuMenuSurface, CodexCuMenuItem, CodexCuMenuSeparator, CodexCuPopoverSurface, CodexCuSpinner} from './codex-cu-primitives.jsx';
import {CodexCuSettingsActionRow, CodexCuSettingsRow, CodexCuSettingsGroup, CodexCuSettingsDisclosureRow, CodexCuSettingsSection, CodexCuSettingsSectionHeader, CodexCuSettingsSectionContent, CodexCuSettingsPage, CodexCuSettingsSearch, CodexCuSettingsPanelLoading} from './codex-cu-settings-primitives.jsx';
import downloadsCss from './codex-browser-downloads.css';
import { CodexCuScope } from './codex-cu-scope.jsx';
export const codexBrowserDownloadsCss = downloadsCss;

/* Reconstructed from Codex 26.1007.21159/build 20052. Source locations, SHA-256,
 * complete extracted definitions and unresolved branches are in
 * work/rea-reconstruction/downloads/. No download transport is implemented here. */
const DOWNLOAD_MESSAGES_EN = {
  "downloads.popover.showInFinder": "Show in Finder",
  "downloads.popover.showInFileExplorer": "Show in File Explorer",
  "downloads.popover.showInFileManager": "Show in File Manager",
  "downloads.popover.loading": "Loading downloads",
  "downloads.popover.empty": "No downloads yet",
  "downloads.popover.emptyDescription": "Files downloaded from the built-in browser will appear here",
  "downloads.popover.openDownload": "Open {filename}",
  "downloads.popover.revealFile": "Reveal {filename} in its folder",
  "downloads.popover.actionsForFile": "Download actions for {filename}",
  "downloads.popover.cancel": "Stop downloading",
  "downloads.popover.pause": "Pause",
  "downloads.popover.resume": "Resume",
  "downloads.popover.open": "Open",
  "downloads.popover.stop": "Stop",
  "downloads.popover.copyAddress": "Copy address",
  "downloads.popover.copyPath": "Copy path",
  "downloads.popover.remove": "Remove from list",
  "downloads.status.started": "Starting",
  "downloads.status.paused": "Paused",
  "downloads.status.failed": "Download failed",
  "downloads.status.canceled": "Stopped",
  "downloads.status.downloaded": "Downloaded",
  "downloads.status.missingFile": "File moved or deleted",
  "downloads.status.remainingStarting": "starting",
  "downloads.status.remainingNow": "now",
  "downloads.status.remainingSeconds": "{seconds}s",
  "downloads.status.remainingMinutes": "{minutes}m",
  "downloads.status.remainingHours": "{hours}h",
  "downloads.status.progressSize": "{received} of {total}",
  "downloads.action.genericError": "Unable to complete the download action",
  "downloads.action.pauseError": "This download cannot be paused",
  "downloads.action.removeError": "Active downloads cannot be removed",
  "downloads.action.resumeError": "This download cannot be resumed",
  "downloads.action.missingError": "This download is no longer available",
  "downloads.action.openError": "Unable to open the downloaded file",
  "downloads.action.showInFolderError": "Unable to show the downloaded file in its folder",
  "downloads.peek.completeLabel": "Download complete: {filename}",
  "downloads.peek.failedLabel": "Download failed: {filename}",
  "downloads.peek.openError": "Unable to open the downloaded file",
  "downloads.peek.showInFolderError": "Unable to show the downloaded file in its folder",
  "downloads.peek.completeTitle": "Download complete",
  "downloads.peek.failedTitle": "Download failed",
  "downloads.peek.showInFolder": "Show in folder",
  "downloads.peek.open": "Open",
  "downloads.peek.viewDownloads": "View downloads",
  "downloads.popover.openFolder": "Open folder",
  "downloads.popover.openFolderError": "Unable to open the downloads folder",
  "downloads.popover.title": "Downloads",
  "downloads.lifecycle.started": "Downloading {filename}",
  "downloads.lifecycle.resumed": "{filename} download resumed",
  "downloads.lifecycle.paused": "{filename} download paused",
  "downloads.lifecycle.failed": "{filename} failed to download",
  "downloads.lifecycle.canceled": "{filename} download canceled",
  "downloads.lifecycle.complete": "{filename} downloaded",
  "downloads.toolbar.activeIndeterminate": "Downloads, {count, plural, one {# active download} other {# active downloads}} in progress",
  "downloads.toolbar.paused": "Downloads, {count, plural, one {# download paused} other {# downloads paused}}",
  "downloads.toolbar.activeProgress": "Downloads, {count, plural, one {# active download} other {# active downloads}}, {progress}% complete",
  "downloads.toolbar.failedAttention": "{label}, {count, plural, one {# failed download needs attention} other {# failed downloads need attention}}",
  "downloads.toolbar.completedAttention": "{label}, {count, plural, one {# completed download ready} other {# completed downloads ready}}",
  "settings.browserUse.downloadHistory.search": "Search download history",
  "settings.browserUse.downloadHistory.clearError": "Unable to clear download history",
  "settings.browserUse.downloadHistory.loading": "Loading download history",
  "settings.browserUse.downloadHistory.retry": "Try again",
  "settings.browserUse.downloadHistory.loadError": "Unable to load download history",
  "settings.browserUse.downloadHistory.noResults.description": "Try searching for a different filename or address",
  "settings.browserUse.downloadHistory.empty.description": "Files downloaded from the built-in browser will appear here",
  "settings.browserUse.downloadHistory.noResults": "No matching downloads",
  "settings.browserUse.downloadHistory.empty": "No downloads yet",
  "settings.browserUse.downloadHistory.breadcrumb.current": "Download history",
  "settings.browserUse.downloadHistory.title": "Download history",
  "settings.browserUse.downloadHistory.allTime": "All-time history",
  "settings.browserUse.downloadHistory.clearAll": "Clear all",
  "settings.browserUse.downloadHistory.paginationError": "Unable to load more downloads",
  "settings.browserUse.downloadHistory.deleted": "Deleted",
  "settings.browserUse.downloadHistory.resume": "Resume download",
  "settings.browserUse.downloadHistory.pause": "Pause download",
  "settings.browserUse.downloadHistory.cancel": "Cancel download",
  "settings.browserUse.downloadHistory.remove": "Remove from download history",
  "settings.browserUse.downloadHistory.open": "Open {filename}",
  "settings.browserUse.downloadHistory.actionError": "Unable to complete the download action",
  "skills.pageSearchInput.clear": "Clear search"
};
const DOWNLOAD_MESSAGES_ZH = {
  "downloads.action.genericError": "无法完成下载操作",
  "downloads.action.missingError": "此下载已不可用",
  "downloads.action.openError": "无法打开已下载的文件",
  "downloads.action.pauseError": "此下载无法暂停",
  "downloads.action.removeError": "无法移除正在进行的下载",
  "downloads.action.resumeError": "此下载无法恢复",
  "downloads.action.showInFolderError": "无法在其所在文件夹中显示已下载的文件",
  "downloads.lifecycle.canceled": "{filename} 下载已取消",
  "downloads.lifecycle.complete": "{filename} 已下载",
  "downloads.lifecycle.failed": "{filename} 下载未成功",
  "downloads.lifecycle.paused": "{filename} 下载已暂停",
  "downloads.lifecycle.resumed": "{filename} 下载已恢复",
  "downloads.lifecycle.started": "正在下载 {filename}",
  "downloads.peek.completeLabel": "下载完成：{filename}",
  "downloads.peek.completeTitle": "下载完成",
  "downloads.peek.failedLabel": "下载未成功：{filename}",
  "downloads.peek.failedTitle": "下载未成功",
  "downloads.peek.open": "打开",
  "downloads.peek.openError": "无法打开下载的文件",
  "downloads.peek.showInFolder": "在文件夹中显示",
  "downloads.peek.showInFolderError": "无法在其文件夹中显示已下载文件",
  "downloads.peek.viewDownloads": "查看下载",
  "downloads.popover.actionsForFile": "{filename} 的下载操作",
  "downloads.popover.cancel": "停止下载",
  "downloads.popover.copyAddress": "复制地址",
  "downloads.popover.copyPath": "复制路径",
  "downloads.popover.empty": "暂无下载内容",
  "downloads.popover.emptyDescription": "从内置浏览器下载的文件将显示在这里",
  "downloads.popover.loadError": "无法加载下载内容",
  "downloads.popover.loading": "正在加载下载内容",
  "downloads.popover.open": "打开",
  "downloads.popover.openDownload": "打开 {filename}",
  "downloads.popover.openFolder": "打开文件夹",
  "downloads.popover.openFolderError": "无法打开下载文件夹",
  "downloads.popover.pause": "暂停",
  "downloads.popover.remove": "从列表中移除",
  "downloads.popover.resume": "继续",
  "downloads.popover.revealFile": "在所在文件夹中显示 {filename}",
  "downloads.popover.showInFileExplorer": "在文件资源管理器中显示",
  "downloads.popover.showInFileManager": "在文件管理器中显示",
  "downloads.popover.showInFinder": "在访达中显示",
  "downloads.popover.stop": "停止",
  "downloads.popover.title": "下载",
  "downloads.status.canceled": "已停止",
  "downloads.status.downloaded": "已下载",
  "downloads.status.failed": "下载未成功",
  "downloads.status.missingFile": "文件已移动或删除",
  "downloads.status.paused": "已暂停",
  "downloads.status.progressSize": "{received} / {total}",
  "downloads.status.remainingHours": "{hours}小时",
  "downloads.status.remainingMinutes": "{minutes} 分钟",
  "downloads.status.remainingNow": "即将完成",
  "downloads.status.remainingSeconds": "{seconds}秒",
  "downloads.status.remainingStarting": "正在开始",
  "downloads.status.started": "正在开始",
  "downloads.toolbar.activeIndeterminate": "下载，{count, plural, one {# 个进行中的下载项} other {# 个进行中的下载项}}",
  "downloads.toolbar.activeProgress": "下载，{count, plural, one {# 个进行中的下载项} other {# 个进行中的下载项}}，已完成 {progress}%",
  "downloads.toolbar.completedAttention": "{label}，{count, plural, one {# 个已完成下载项就绪} other {# 个已完成下载项就绪}}",
  "downloads.toolbar.failedAttention": "{label}，{count, plural, one {# 个失败下载项待处理} other {# 个失败下载项待处理}}",
  "downloads.toolbar.paused": "下载，{count, plural, one {# 个已暂停下载项} other {# 个已暂停下载项}}",
  "settings.browserUse.downloadHistory.actionError": "无法完成下载操作",
  "settings.browserUse.downloadHistory.allTime": "全部历史记录",
  "settings.browserUse.downloadHistory.breadcrumb.current": "下载历史记录",
  "settings.browserUse.downloadHistory.cancel": "取消下载",
  "settings.browserUse.downloadHistory.clearAll": "清除全部",
  "settings.browserUse.downloadHistory.clearError": "无法清除下载历史记录",
  "settings.browserUse.downloadHistory.deleted": "已删除",
  "settings.browserUse.downloadHistory.empty": "暂无下载内容",
  "settings.browserUse.downloadHistory.empty.description": "从内置浏览器下载的文件将显示在这里",
  "settings.browserUse.downloadHistory.loadError": "无法加载下载历史记录",
  "settings.browserUse.downloadHistory.loading": "正在加载下载历史记录",
  "settings.browserUse.downloadHistory.noResults": "没有匹配的下载项",
  "settings.browserUse.downloadHistory.noResults.description": "请尝试搜索其他文件名或地址",
  "settings.browserUse.downloadHistory.open": "打开 {filename}",
  "settings.browserUse.downloadHistory.paginationError": "无法加载更多下载记录",
  "settings.browserUse.downloadHistory.pause": "暂停下载",
  "settings.browserUse.downloadHistory.remove": "从下载历史记录中移除",
  "settings.browserUse.downloadHistory.resume": "继续下载",
  "settings.browserUse.downloadHistory.retry": "重试",
  "settings.browserUse.downloadHistory.search": "搜索下载历史记录",
  "settings.browserUse.downloadHistory.title": "下载历史记录",
  "skills.pageSearchInput.clear": "清空搜索"
};

export const CODEX_DOWNLOAD_STATUSES = Object.freeze(['started', 'in_progress', 'paused', 'complete', 'canceled', 'failed']);
const ACTIVE_STATUSES = new Set(['started', 'in_progress', 'paused']);
const ENDED_STATUSES = new Set(['canceled', 'complete', 'failed']);
const canInvoke = callback => typeof callback === 'function';
const join = parts => parts.filter(part => part !== null && part !== undefined && part !== '').join(' · ');

function message(locale, id, values = {}) {
  let result = (String(locale).toLowerCase().startsWith('zh') ? DOWNLOAD_MESSAGES_ZH : DOWNLOAD_MESSAGES_EN)[id] ?? DOWNLOAD_MESSAGES_EN[id] ?? '';
  result = result.replace(/\{(\w+), plural, ((?:[^{}]|\{[^{}]*\})*)\}/g, (_, key, choices) => {
    const count = Number(values[key]);
    const cases = Object.fromEntries([...choices.matchAll(/(=\d+|\w+)\s*\{([^{}]*)\}/g)].map(match => [match[1], match[2]]));
    const choice = cases['=' + count] ?? cases[new Intl.PluralRules(locale).select(count)] ?? cases.other ?? '';
    return choice.replace(/#/g, new Intl.NumberFormat(locale).format(count));
  });
  return result.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

export function formatCodexDownloadBytes(value, locale = 'zh-CN') {
  if (!Number.isFinite(value) || value <= 0) return new Intl.NumberFormat(locale, {style:'unit', unit:'byte', unitDisplay:'long'}).format(0);
  if (value < 1024) return new Intl.NumberFormat(locale, {style:'unit', unit:'byte', unitDisplay:'long'}).format(value);
  const units = ['kilobyte', 'megabyte', 'gigabyte', 'terabyte'];
  let amount = value / 1024, unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {amount /= 1024; unit += 1;}
  return new Intl.NumberFormat(locale, {maximumFractionDigits:1, style:'unit', unit:units[unit], unitDisplay:'short'}).format(amount);
}

function progressSize(download, locale) {
  const received = formatCodexDownloadBytes(download.receivedBytes, locale);
  return download.status === 'complete' || !(download.totalBytes > 0) ? received : message(locale, 'downloads.status.progressSize', {received, total:formatCodexDownloadBytes(download.totalBytes, locale)});
}
function elapsedSeconds(download) {return Math.max(1, (download.updatedAtMs - download.startedAtMs) / 1000);}
function remainingTime(download, locale) {
  if (download.receivedBytes <= 0) return message(locale, 'downloads.status.remainingStarting');
  if (download.totalBytes <= download.receivedBytes) return message(locale, 'downloads.status.remainingNow');
  const seconds = Math.ceil((download.totalBytes - download.receivedBytes) / (download.receivedBytes / elapsedSeconds(download)));
  if (seconds < 60) return message(locale, 'downloads.status.remainingSeconds', {seconds});
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? message(locale, 'downloads.status.remainingMinutes', {minutes}) : message(locale, 'downloads.status.remainingHours', {hours:Math.ceil(minutes / 60)});
}
function downloadTime(download, locale) {return new Intl.DateTimeFormat(locale, {hour:'numeric', minute:'2-digit'}).format(download.updatedAtMs);}

export function codexDownloadStatusText(download, locale = 'zh-CN') {
  switch (download.status) {
    case 'in_progress': return join([formatCodexDownloadBytes(download.receivedBytes / elapsedSeconds(download), locale) + '/s', progressSize(download, locale), download.totalBytes > 0 ? remainingTime(download, locale) : null]);
    case 'started': return join([message(locale, 'downloads.status.started'), progressSize(download, locale)]);
    case 'paused': return join([message(locale, 'downloads.status.paused'), progressSize(download, locale)]);
    case 'failed': return join([message(locale, 'downloads.status.failed'), progressSize(download, locale), downloadTime(download, locale)]);
    case 'canceled': return join([message(locale, 'downloads.status.canceled'), download.receivedBytes > 0 ? progressSize(download, locale) : null, downloadTime(download, locale)]);
    case 'complete': return join([message(locale, download.fileExists === false ? 'downloads.status.missingFile' : 'downloads.status.downloaded'), progressSize(download, locale), downloadTime(download, locale)]);
    default: return '';
  }
}

export function CodexBrowserDownloadStatus({download, locale = 'zh-CN'}) {
  return <div className="codex-browser-download-status" data-failed={download.status === 'failed'}><span className="codex-browser-download-status-text">{codexDownloadStatusText(download, locale)}</span></div>;
}

/* Source je: unknown-size paused downloads retain only the track; a known-size
 * zero-byte download has an invisible fill and a nonzero fill is at least 3%. */
export function CodexBrowserDownloadProgress({download, reducedMotion = false}) {
  const paused = download.status === 'paused';
  const fraction = download.totalBytes > 0 ? Math.min(1, download.receivedBytes / download.totalBytes) : null;
  return <div className="codex-browser-download-progress" aria-hidden="true">
    {fraction === null ? paused ? null : <div className="codex-browser-download-progress-fill" data-indeterminate="true" style={reducedMotion ? {animation:'none'} : undefined}/> : <div className="codex-browser-download-progress-fill" data-paused={paused} data-animated={!reducedMotion} style={{opacity:fraction === 0 ? 0 : 1, transform:`scaleX(${Math.max(.03, fraction)})`}}/>}
  </div>;
}

export function codexDownloadsToolbarState(snapshot) {
  if (snapshot == null) return {activeCount:0, attention:null, indicator:{kind:'idle'}};
  const active = snapshot.downloads.filter(download => ACTIVE_STATUSES.has(download.status));
  const unacknowledged = new Set(snapshot.unacknowledgedIds ?? []);
  let failed = 0, complete = 0;
  for (const download of snapshot.downloads) if (unacknowledged.has(download.id)) {if (download.status === 'failed') failed += 1; else if (download.status === 'complete') complete += 1;}
  const attention = failed > 0 ? {count:failed, kind:'failure'} : complete > 0 ? {count:complete, kind:'completion'} : null;
  let indicator = {kind:'idle'};
  if (active.length) {
    const percent = active.some(download => download.totalBytes <= 0) ? null : Math.round(active.reduce((sum, download) => sum + Math.min(download.totalBytes, Math.max(0, download.receivedBytes)), 0) / active.reduce((sum, download) => sum + download.totalBytes, 0) * 100);
    indicator = active.every(download => download.status === 'paused') ? {kind:'paused', progressPercent:percent} : percent === null ? {kind:'indeterminate'} : {kind:'progress', progressPercent:percent};
  }
  return {activeCount:active.length, attention, indicator};
}
function toolbarLabel(state, locale) {
  let label = message(locale, state.indicator.kind === 'idle' ? 'downloads.popover.title' : state.indicator.kind === 'paused' ? 'downloads.toolbar.paused' : state.indicator.kind === 'indeterminate' ? 'downloads.toolbar.activeIndeterminate' : 'downloads.toolbar.activeProgress', {count:state.activeCount, progress:state.indicator.progressPercent});
  if (state.attention) label = message(locale, state.attention.kind === 'failure' ? 'downloads.toolbar.failedAttention' : 'downloads.toolbar.completedAttention', {label, count:state.attention.count});
  return label;
}

/* Source app-shared::nPi: 20px, 2px stroke, 16% track, pathLength 100.
 * This is an actual progress visualization, independent of the icon registry. */
function DownloadProgressRing({percent, reducedMotion = false, transitionDurationMs = 120}) {
  const value = !Number.isFinite(percent) || percent < 0 ? 0 : percent > 100 ? 100 : percent;
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" fill="none" opacity=".16"/>
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" opacity={value === 0 ? 0 : 1} strokeLinecap="round" fill="none" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - value} style={{transition:reducedMotion ? 'none' : `stroke-dashoffset ${transitionDurationMs}ms ease-out, opacity ${transitionDurationMs}ms ease-out`}} transform="rotate(-90 10 10)"/>
  </svg>;
}
function DownloadSpinner({size = 24, className = '', iconClassName = ''}) {
  return <CodexCuSpinner as="span" containerClassName={className} className={iconClassName} Icon={props => <CodexCuIcon name="shared:Dk" size={size} {...props} />} />;
}
export function CodexBrowserDownloadsIndicator({state, reducedMotion = false}) {
  const kind = state.indicator.kind;
  const progress = kind === 'idle' ? null : kind === 'indeterminate' ? <DownloadSpinner size={20}/> : <DownloadProgressRing percent={state.indicator.progressPercent ?? 0} reducedMotion={kind === 'paused' || reducedMotion} transitionDurationMs={kind === 'paused' ? 0 : 120}/>;
  return <span className="codex-browser-download-indicator" data-tone={kind === 'paused' ? 'paused' : kind !== 'idle' || state.attention != null ? 'active' : 'idle'} aria-hidden="true">
    {progress === null ? <CodexCuIcon name="shared:mht"/> : <>{progress}<CodexCuIcon name="shared:lO" className="codex-browser-download-icon-xs codex-browser-download-indicator-arrow"/><span className="codex-browser-download-indicator-line"/></>}
  </span>;
}
export function CodexBrowserDownloadsTrigger({snapshot, state = codexDownloadsToolbarState(snapshot), open = false, floating = false, reducedMotion = false, locale = 'zh-CN', onClick, disabled = false, buttonRef}) {
  const label = toolbarLabel(state, locale);
  return <CodexCuTooltip tooltipContent={label}><CodexCuButton ref={buttonRef} className="codex-browser-downloads-trigger" type="button" color="ghostActive" radius={floating ? 'full' : 'default'} size="toolbar" uniform aria-label={label} data-browser-sidebar-skip-address-commit="true" data-state={open ? 'open' : undefined} aria-expanded={open} disabled={disabled} onClick={onClick}><CodexBrowserDownloadsIndicator state={state} reducedMotion={reducedMotion}/></CodexCuButton></CodexCuTooltip>;
}

const FILE_EXTENSION_TYPES = Object.freeze({
  ts:'typescript', tsx:'react', jsx:'react', js:'javascript', mjs:'javascript', cjs:'javascript', hs:'javascript', py:'python', java:'java', rs:'rust', php:'php', css:'css', scss:'css', less:'css', sass:'css', cpp:'cplusplus', cxx:'cplusplus', cc:'cplusplus', c:'cplusplus', hpp:'cplusplus', hh:'cplusplus', h:'cplusplus', rb:'code', go:'code', kt:'code', swift:'code', m:'code', mm:'code', cs:'code', sql:'code', json:'json', jsonc:'json', md:'document', mdx:'document', markdown:'document', mkd:'document', mdown:'document', html:'html', htm:'html', yaml:'yaml', yml:'yaml', toml:'toml', xml:'document', csv:'spreadsheet', tsv:'spreadsheet', xls:'spreadsheet', xlsm:'spreadsheet', xlsx:'spreadsheet', doc:'artifactDocument', docx:'artifactDocument', ipynb:'notebook', ppt:'presentation', pptx:'presentation', sh:'shell', bash:'shell', zsh:'shell', fish:'shell', ps1:'shell', dockerfile:'terminal', env:'document', dotenv:'document', gitignore:'document', lock:'document', png:'image', jpg:'image', jpeg:'image', gif:'image', webp:'image', bmp:'image', svg:'image', ico:'image', build:'build', bazel:'build', bzl:'build', ninja:'build', gradle:'build', mk:'build', makefile:'build', sha:'hashes', sha1:'hashes', sha256:'hashes', md5:'hashes', checksum:'hashes', sum:'hashes', pdf:'pdf', zip:'folder', gz:'folder', tgz:'folder', tar:'folder'
});
const MIME_EXTENSION_TYPES = {
  "gz": "folder",
  "pdf": "pdf",
  "ppt": "presentation",
  "pps": "presentation",
  "pot": "presentation",
  "ppam": "presentation",
  "pptm": "presentation",
  "sldm": "presentation",
  "ppsm": "presentation",
  "potm": "presentation",
  "pptx": "presentation",
  "sldx": "presentation",
  "ppsx": "presentation",
  "potx": "presentation",
  "wmf": "image",
  "emf": "image",
  "zip": "folder",
  "exr": "image",
  "apng": "image",
  "avci": "image",
  "avcs": "image",
  "avif": "image",
  "bmp": "image",
  "cgm": "image",
  "drle": "image",
  "fits": "image",
  "g3": "image",
  "gif": "image",
  "heic": "image",
  "heics": "image",
  "heif": "image",
  "heifs": "image",
  "hej2": "image",
  "hsj2": "image",
  "ief": "image",
  "jls": "image",
  "jp2": "image",
  "jpg2": "image",
  "jpeg": "image",
  "jpg": "image",
  "jpe": "image",
  "jph": "image",
  "jhc": "image",
  "jpm": "image",
  "jpx": "image",
  "jpf": "image",
  "jxr": "image",
  "jxra": "image",
  "jxrs": "image",
  "jxs": "image",
  "jxsc": "image",
  "jxsi": "image",
  "jxss": "image",
  "ktx": "image",
  "ktx2": "image",
  "png": "image",
  "btif": "image",
  "pti": "image",
  "sgi": "image",
  "svg": "image",
  "svgz": "image",
  "t38": "image",
  "tif": "image",
  "tiff": "image",
  "tfx": "image",
  "psd": "image",
  "azv": "image",
  "uvi": "image",
  "uvvi": "image",
  "uvg": "image",
  "uvvg": "image",
  "djvu": "image",
  "djv": "image",
  "sub": "document",
  "dwg": "image",
  "dxf": "image",
  "fbs": "image",
  "fpx": "image",
  "fst": "image",
  "mmr": "image",
  "rlc": "image",
  "ico": "image",
  "dds": "image",
  "mdi": "image",
  "wdp": "image",
  "npx": "image",
  "b16": "image",
  "tap": "image",
  "vtf": "image",
  "wbmp": "image",
  "xif": "image",
  "pcx": "image",
  "webp": "image",
  "3ds": "image",
  "ras": "image",
  "cmx": "image",
  "fh": "image",
  "fhc": "image",
  "fh4": "image",
  "fh5": "image",
  "fh7": "image",
  "jng": "image",
  "sid": "image",
  "pic": "image",
  "pct": "image",
  "pnm": "image",
  "pbm": "image",
  "pgm": "image",
  "ppm": "image",
  "rgb": "image",
  "tga": "image",
  "xbm": "image",
  "xpm": "image",
  "xwd": "image",
  "appcache": "document",
  "manifest": "document",
  "ics": "document",
  "ifb": "document",
  "coffee": "document",
  "litcoffee": "document",
  "css": "document",
  "csv": "document",
  "html": "document",
  "htm": "document",
  "shtml": "document",
  "jade": "document",
  "jsx": "document",
  "less": "document",
  "markdown": "document",
  "md": "document",
  "mml": "document",
  "mdx": "document",
  "n3": "document",
  "txt": "document",
  "text": "document",
  "conf": "document",
  "def": "document",
  "list": "document",
  "log": "document",
  "in": "document",
  "ini": "document",
  "dsc": "document",
  "rtx": "document",
  "sgml": "document",
  "sgm": "document",
  "shex": "document",
  "slim": "document",
  "slm": "document",
  "spdx": "document",
  "stylus": "document",
  "styl": "document",
  "tsv": "document",
  "t": "document",
  "tr": "document",
  "roff": "document",
  "man": "document",
  "me": "document",
  "ms": "document",
  "ttl": "document",
  "uri": "document",
  "uris": "document",
  "urls": "document",
  "vcard": "document",
  "curl": "document",
  "dcurl": "document",
  "mcurl": "document",
  "scurl": "document",
  "ged": "document",
  "fly": "document",
  "flx": "document",
  "gv": "document",
  "3dml": "document",
  "spot": "document",
  "jad": "document",
  "wml": "document",
  "wmls": "document",
  "vtt": "document",
  "s": "document",
  "asm": "document",
  "c": "document",
  "cc": "document",
  "cxx": "document",
  "cpp": "document",
  "h": "document",
  "hh": "document",
  "dic": "document",
  "htc": "document",
  "f": "document",
  "for": "document",
  "f77": "document",
  "f90": "document",
  "hbs": "document",
  "java": "document",
  "lua": "document",
  "mkd": "document",
  "nfo": "document",
  "opml": "document",
  "p": "document",
  "pas": "document",
  "pde": "document",
  "sass": "document",
  "scss": "document",
  "etx": "document",
  "sfv": "document",
  "ymp": "document",
  "uu": "document",
  "vcs": "document",
  "vcf": "document",
  "yaml": "document",
  "yml": "document"
};

export function codexDownloadFileType(download) {
  const path = download.path || download.filename || '';
  const base = path.toLowerCase().split(/[\\/]/).pop();
  let type = /[\\/]$/.test(path) ? 'folder' : base === 'skill.md' ? 'skill' : FILE_EXTENSION_TYPES[base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : base] ?? MIME_EXTENSION_TYPES[base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : base];
  if (!type && download.mimeType) {
    const mime = download.mimeType;
    type = mime.startsWith('application/vnd.ms-powerpoint') || mime.startsWith('application/vnd.openxmlformats-officedocument.presentationml.') ? 'presentation' : mime.startsWith('image/') ? 'image' : mime.startsWith('text/') ? 'document' : mime.startsWith('application/pdf') ? 'pdf' : mime.startsWith('application/zip') || mime.startsWith('application/gzip') ? 'folder' : null;
  }
  return type === 'folder' ? 'document' : type ?? 'file';
}
function fileIcon(download, renderFileIcon) {
  const type = codexDownloadFileType(download);
  return renderFileIcon ? renderFileIcon({download, type, size:18}) : <CodexCuFileIcon type={type} size={18}/>;
}
function renderDownloadStatus(download, locale, rowStatusSlot) {
  if (canInvoke(rowStatusSlot)) return rowStatusSlot(download);
  if (canInvoke(download.renderStatus)) return download.renderStatus(download);
  if (download.renderStatus !== undefined) return download.renderStatus;
  return <CodexBrowserDownloadStatus download={download} locale={locale}/>;
}
function revealLabel(platform, locale) {return message(locale, platform === 'macOS' ? 'downloads.popover.showInFinder' : platform === 'windows' ? 'downloads.popover.showInFileExplorer' : 'downloads.popover.showInFileManager');}
function actionError(result, locale) {
  const ids = {'download-not-pausable':'pauseError', 'download-not-removable':'removeError', 'download-not-resumable':'resumeError', 'missing-download':'missingError', 'open-failed':'openError', 'show-in-folder-failed':'showInFolderError'};
  return message(locale, 'downloads.action.' + (ids[result?.reason] ?? 'genericError'));
}
function DownloadActionButton({label, ariaLabel = label, icon, disabled, onClick, size = 'toolbar', iconClassName, children}) {
  return <CodexCuTooltip tooltipContent={label}><CodexCuButton type="button" color="ghostTertiary" size={size} uniform aria-label={ariaLabel} disabled={disabled} onClick={onClick}>{children ?? <CodexCuIcon name={icon} className={iconClassName}/>}</CodexCuButton></CodexCuTooltip>;
}
export function codexDownloadMenuItems(download, {actions = {}, platform = 'macOS', locale = 'zh-CN', runAction} = {}) {
  const items = [];
  const invoke = action => () => ['copyAddress', 'copyPath'].includes(action) ? actions[action]?.(download) : runAction ? runAction(action, download) : actions[action]?.(download);
  const item = (id, label, action, enabled = true) => ({id, label, action, disabled:!enabled || !canInvoke(actions[action]), onSelect:invoke(action)});
  if (download.status === 'complete') items.push(item('download-open', message(locale, 'downloads.popover.open'), 'open', download.fileExists));
  items.push(item('download-show-in-folder', revealLabel(platform, locale), 'showInFolder', download.fileExists));
  if (ACTIVE_STATUSES.has(download.status)) items.push(item('download-stop', message(locale, 'downloads.popover.stop'), 'cancel', download.canCancel));
  items.push(item('download-copy-address', message(locale, 'downloads.popover.copyAddress'), 'copyAddress'), item('download-copy-path', message(locale, 'downloads.popover.copyPath'), 'copyPath'));
  if (ENDED_STATUSES.has(download.status)) items.push({id:'download-remove-separator', separator:true}, item('download-remove', message(locale, 'downloads.popover.remove'), 'remove'));
  return items;
}
function DownloadMenuItems({items, onSelect}) {
  return items.map(item => item.separator ? <CodexCuMenuSeparator key={item.id}/> : <CodexCuMenuItem key={item.id} disabled={item.disabled} onSelect={() => {item.onSelect?.(); onSelect?.();}}>{item.label}</CodexCuMenuItem>);
}
export function CodexBrowserDownloadRow({download, actions = {}, runAction, pending = false, platform = 'macOS', locale = 'zh-CN', reducedMotion = false, renderFileIcon, onContextMenu, renderLayer, rowMenuSurfaceProps = {}, rowStatusSlot, rowTrailingSlot}) {
  const menuAnchor = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const invoke = action => () => runAction ? runAction(action, download) : actions[action]?.(download);
  const isActive = ACTIVE_STATUSES.has(download.status);
  const isComplete = download.status === 'complete' && download.fileExists === true;
  const canOpen = isComplete && !pending && canInvoke(actions.open);
  const menuItems = codexDownloadMenuItems(download, {actions, platform, locale, runAction});
  const body = <><div className="codex-browser-download-file-icon">{fileIcon(download, renderFileIcon)}</div><div className="codex-browser-download-content"><div className="codex-browser-download-copy"><div className="codex-browser-download-filename">{download.filename}</div>{renderDownloadStatus(download, locale, rowStatusSlot)}</div>{isActive && <CodexBrowserDownloadProgress download={download} reducedMotion={reducedMotion}/>}</div></>;
  let rowAction;
  if (pending) rowAction = <DownloadSpinner iconClassName="codex-browser-download-icon-xs"/>;
  else if (download.status === 'paused' && (download.canResume || download.canCancel)) rowAction = <div className="codex-browser-download-actions"><DownloadActionButton label={message(locale, 'downloads.popover.resume')} icon="shared:Urt" disabled={!download.canResume || !canInvoke(actions.resume)} onClick={invoke('resume')}/><DownloadActionButton label={message(locale, 'downloads.popover.cancel')} icon="shared:xot" disabled={!download.canCancel || !canInvoke(actions.cancel)} onClick={invoke('cancel')}/></div>;
  else if ((download.status === 'started' || download.status === 'in_progress') && (download.canPause || download.canCancel)) rowAction = <div className="codex-browser-download-actions"><DownloadActionButton label={message(locale, 'downloads.popover.pause')} icon="shared:frt" disabled={!download.canPause || !canInvoke(actions.pause)} onClick={invoke('pause')}/><DownloadActionButton label={message(locale, 'downloads.popover.cancel')} icon="shared:xot" disabled={!download.canCancel || !canInvoke(actions.cancel)} onClick={invoke('cancel')}/></div>;
  else rowAction = <span className="codex-browser-download-menu-anchor"><CodexCuButton ref={menuAnchor} type="button" color="ghostTertiary" size="toolbar" uniform aria-label={message(locale, 'downloads.popover.actionsForFile', {filename:download.filename})} aria-expanded={menuOpen} disabled={!canInvoke(renderLayer)} onClick={() => setMenuOpen(!menuOpen)}><CodexCuIcon name="shared:Iet" size={16}/></CodexCuButton>{menuOpen && renderLayer?.({kind:'download-menu', anchorRef:menuAnchor, open:menuOpen, onClose:() => setMenuOpen(false), side:'bottom', align:'end', sideOffset:1, collisionPadding:6, children:<CodexCuMenuSurface {...rowMenuSurfaceProps} align="end" contentWidth="menu"><DownloadMenuItems items={menuItems} onSelect={() => setMenuOpen(false)}/></CodexCuMenuSurface>})}</span>;
  return <div className="codex-browser-download-row" data-download-status={download.status} onContextMenu={onContextMenu ? event => onContextMenu({event, download, items:menuItems}) : undefined}>
    {isComplete ? <button type="button" className="codex-browser-download-main" aria-label={message(locale, 'downloads.popover.openDownload', {filename:download.filename})} disabled={!canOpen} draggable={canOpen && canInvoke(actions.drag)} onPointerEnter={canOpen && canInvoke(actions.drag) && canInvoke(actions.prepareDrag) ? () => void Promise.resolve(actions.prepareDrag(download)).catch(() => {}) : undefined} onPointerDown={event => {event.currentTarget.dataset.fileDragStarted = 'false'; if (canOpen && canInvoke(actions.drag) && canInvoke(actions.prepareDrag)) void Promise.resolve(actions.prepareDrag(download)).catch(() => {});}} onKeyDown={event => {event.currentTarget.dataset.fileDragStarted = 'false';}} onDragStart={canOpen && canInvoke(actions.drag) ? event => {event.preventDefault(); event.currentTarget.dataset.fileDragStarted = String(actions.drag(download, event) === true);} : undefined} onClick={event => {const dragged = event.currentTarget.dataset.fileDragStarted === 'true'; event.currentTarget.dataset.fileDragStarted = 'false'; if (!dragged && canOpen && event.detail <= 1) invoke('open')();}}>{body}</button> : <div className="codex-browser-download-main">{body}</div>}
    <div className="codex-browser-download-actions"><DownloadActionButton label={revealLabel(platform, locale)} ariaLabel={message(locale, 'downloads.popover.revealFile', {filename:download.filename})} icon="shared:_tt" disabled={!download.fileExists || pending || !canInvoke(actions.showInFolder)} onClick={invoke('showInFolder')}/>{rowAction}{rowTrailingSlot?.(download)}</div>
  </div>;
}

function DownloadEmpty({loading, locale, title, description}) {
  return <div className="codex-browser-download-empty"><div className="codex-browser-download-empty-content"><div className="codex-browser-download-empty-icon">{loading ? <DownloadSpinner size={24}/> : <CodexCuIcon name="shared:hb" size={32}/>}</div><div className="codex-browser-download-empty-copy"><div className="codex-browser-download-empty-title">{title ?? message(locale, loading ? 'downloads.popover.loading' : 'downloads.popover.empty')}</div>{!loading && <div className="codex-browser-download-empty-description">{description ?? message(locale, 'downloads.popover.emptyDescription')}</div>}</div></div></div>;
}
export function CodexBrowserDownloadList({snapshot, actions = {}, pendingActionId, onError, locale = 'zh-CN', platform = 'macOS', reducedMotion = false, renderFileIcon, onContextMenu, renderLayer, rowMenuSurfaceProps, rowStatusSlot, rowTrailingSlot, className = ''}) {
  const [localPending, setLocalPending] = useState(null);
  const runAction = async (action, download) => {
    if (!canInvoke(actions[action])) return;
    setLocalPending(download.id);
    try {const result = await actions[action](download); if (result?.ok === false) onError?.(actionError(result, locale), 'downloadsList.runDownloadAction');}
    catch {onError?.(actionError(null, locale), 'downloadsList.runDownloadAction');}
    finally {setLocalPending(null);}
  };
  if (snapshot == null) return <DownloadEmpty loading locale={locale}/>;
  const downloads = snapshot.downloads;
  if (downloads.length === 0) return <DownloadEmpty locale={locale}/>;
  const sorted = [...downloads.filter(download => ACTIVE_STATUSES.has(download.status)), ...downloads.filter(download => !ACTIVE_STATUSES.has(download.status))];
  return <div className={'codex-browser-download-list ' + className}>{sorted.map(download => <CodexBrowserDownloadRow key={download.id} download={download} actions={actions} runAction={runAction} pending={(pendingActionId ?? localPending) === download.id} platform={platform} locale={locale} reducedMotion={reducedMotion} renderFileIcon={renderFileIcon} onContextMenu={onContextMenu} renderLayer={renderLayer} rowMenuSurfaceProps={rowMenuSurfaceProps} rowStatusSlot={rowStatusSlot} rowTrailingSlot={rowTrailingSlot}/>)}</div>;
}

export function CodexBrowserDownloadsPanel({snapshot, actions = {}, pendingActionId, onError, locale = 'zh-CN', platform = 'macOS', reducedMotion = false, renderFileIcon, onContextMenu, renderLayer, rowMenuSurfaceProps, rowStatusSlot, rowTrailingSlot, openingFolder = false, onOpenFolder}) {
  return <div className="codex-browser-downloads-panel"><div className="codex-browser-downloads-header"><div className="codex-browser-downloads-title">{message(locale, 'downloads.popover.title')}</div><CodexCuTooltip tooltipContent={message(locale, 'downloads.popover.openFolder')}><CodexCuButton type="button" color="ghost" size="toolbar" uniform aria-label={message(locale, 'downloads.popover.openFolder')} disabled={!canInvoke(onOpenFolder)} loading={openingFolder} onClick={onOpenFolder}><CodexCuIcon name="shared:Bdt"/></CodexCuButton></CodexCuTooltip></div><CodexBrowserDownloadList snapshot={snapshot} actions={actions} pendingActionId={pendingActionId} onError={onError} locale={locale} platform={platform} reducedMotion={reducedMotion} renderFileIcon={renderFileIcon} onContextMenu={onContextMenu} renderLayer={renderLayer} rowMenuSurfaceProps={rowMenuSurfaceProps} rowStatusSlot={rowStatusSlot} rowTrailingSlot={rowTrailingSlot}/></div>;
}

export function CodexBrowserDownloadPeek({event, download, actions = {}, locale = 'zh-CN', onDismiss, onViewDownloads, onError, onHold, onRelease, surfaceProps = {}}) {
  const [pending, setPending] = useState(null);
  const complete = event.status === 'complete';
  const available = complete && (download?.status !== 'complete' || download.fileExists);
  const run = async action => {
    if (!canInvoke(actions[action])) return;
    setPending(action);
    try {const result = await actions[action](download ?? event); if (result?.ok !== false) {setPending(null); onDismiss?.(); return;}}
    catch {}
    setPending(null);
    onError?.(message(locale, action === 'open' ? 'downloads.peek.openError' : 'downloads.peek.showInFolderError'), 'downloadAttentionPeek.runAction');
  };
  const label = message(locale, complete ? 'downloads.peek.completeLabel' : 'downloads.peek.failedLabel', {filename:event.filename});
  return <CodexCuPopoverSurface {...surfaceProps} align="end" opaque aria-label={label} onFocusCapture={() => onHold?.('focus')} onBlurCapture={event => {if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) onRelease?.('focus');}} onPointerEnter={() => onHold?.('pointer')} onPointerLeave={() => onRelease?.('pointer')}>
    <div className="codex-browser-download-peek"><div className="codex-browser-download-peek-header"><CodexCuIcon name={complete ? 'shared:db' : 'shared:Hv'} className="codex-browser-download-icon-sm codex-browser-download-peek-icon" data-complete={complete}/><div className="codex-browser-download-content"><div className="codex-browser-download-peek-title">{message(locale, complete ? 'downloads.peek.completeTitle' : 'downloads.peek.failedTitle')}</div><div className="codex-browser-download-peek-filename">{event.filename}</div></div></div>
      <div className="codex-browser-download-peek-actions">{available ? <><CodexCuButton color="secondary" disabled={pending != null || !canInvoke(actions.showInFolder)} loading={pending === 'showInFolder'} onClick={() => void run('showInFolder')}>{message(locale, 'downloads.peek.showInFolder')}</CodexCuButton><CodexCuButton disabled={pending != null || !canInvoke(actions.open)} loading={pending === 'open'} onClick={() => void run('open')}>{message(locale, 'downloads.peek.open')}</CodexCuButton></> : <CodexCuButton disabled={!canInvoke(onViewDownloads)} onClick={onViewDownloads}>{message(locale, 'downloads.peek.viewDownloads')}</CodexCuButton>}</div>
    </div>
  </CodexCuPopoverSurface>;
}
function lifecycleText(event, locale) {
  if (!event) return '';
  const status = event.status === 'in_progress' ? event.previousStatus === 'paused' ? 'resumed' : null : event.status;
  return status ? message(locale, 'downloads.lifecycle.' + status, {filename:event.filename}) : '';
}

/* Snapshot and lifecycle events are host inputs. The 5s holdable peek and 15s
 * cooldown are source constants; events are never synthesized from list rows. */
export function CodexBrowserDownloads({snapshot, open, defaultOpen = false, onOpenChange, floating = false, isVisible = true, platform = 'macOS', locale = 'zh-CN', reducedMotion = false, actions = {}, pendingActionId, onError, renderFileIcon, onContextMenu, renderLayer, menuSurfaceProps = {}, peekSurfaceProps = {}, rowMenuSurfaceProps, rowStatusSlot, rowTrailingSlot, attentionEvent, browserTabId, conversationId, theme, windowType = 'electron'}) {
  const triggerRef = useRef(null), initialEvent = useRef(attentionEvent);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [peek, setPeek] = useState(null);
  const openValue = open ?? localOpen;
  const hold = useRef(new Set()), timeout = useRef(null), deadline = useRef(0), remaining = useRef(5000), cooldown = useRef(0), sequence = useRef(null);
  const dismiss = () => {clearTimeout(timeout.current); timeout.current = null; setPeek(null); hold.current.clear();};
  const schedule = delay => {remaining.current = delay; deadline.current = Date.now() + delay; timeout.current = setTimeout(dismiss, delay);};
  const setOpen = value => {setLocalOpen(value); onOpenChange?.(value); if (value) dismiss();};
  useEffect(() => {
    if (!attentionEvent || sequence.current === attentionEvent.sequence) return;
    sequence.current = attentionEvent.sequence;
    if (!['complete', 'failed'].includes(attentionEvent.status) || !attentionEvent.userInitiated || attentionEvent.browserTabId == null || attentionEvent.conversationId == null || Date.now() < cooldown.current || peek != null) return;
    if (attentionEvent.browserTabId !== browserTabId || attentionEvent.conversationId !== conversationId) return;
    cooldown.current = Date.now() + 15000;
    remaining.current = 5000;
    setPeek(attentionEvent);
    schedule(5000);
  }, [attentionEvent, browserTabId, conversationId]);
  useEffect(() => () => {clearTimeout(timeout.current);}, []);
  useEffect(() => {if (openValue) dismiss();}, [openValue]);
  useEffect(() => {
    if (!openValue || !isVisible || !canInvoke(actions.acknowledge)) return;
    const ids = snapshot?.unacknowledgedIds ?? [];
    if (ids.length) Promise.resolve(actions.acknowledge(ids)).catch(() => {});
  }, [openValue, isVisible, snapshot?.unacknowledgedIds, actions.acknowledge]);
  const openFolder = async () => {
    if (!canInvoke(actions.showDownloadsFolder)) return;
    setOpeningFolder(true);
    try {const result = await actions.showDownloadsFolder(); if (result?.ok === false) onError?.(message(locale, 'downloads.popover.openFolderError'), 'downloads.popover.openFolderError');}
    catch {onError?.(message(locale, 'downloads.popover.openFolderError'), 'downloads.popover.openFolderError');}
    finally {setOpeningFolder(false);}
  };
  const showTrigger = openValue || peek != null || (snapshot?.downloads.length ?? 0) > 0;
  const showPeek = peek != null && isVisible && !openValue;
  const currentDownload = snapshot?.downloads.find(download => download.id === peek?.id) ?? null;
  return <CodexCuScope className="codex-browser-downloads" theme={theme} referenceWindowType={windowType}>

    {showTrigger && <div className="codex-browser-downloads-reveal"><CodexBrowserDownloadsTrigger buttonRef={triggerRef} snapshot={snapshot} open={openValue} floating={floating} reducedMotion={reducedMotion} locale={locale} disabled={!canInvoke(renderLayer)} onClick={() => setOpen(!openValue)}/></div>}
    {openValue && renderLayer?.({kind:'downloads', anchorRef:triggerRef, open:openValue, onClose:() => setOpen(false), side:'bottom', align:'end', sideOffset:1, collisionPadding:6, children:<CodexCuMenuSurface {...menuSurfaceProps} align="end" contentWidth="panelWide" surface="opaque"><CodexBrowserDownloadsPanel snapshot={snapshot} actions={actions} pendingActionId={pendingActionId} onError={onError} locale={locale} platform={platform} reducedMotion={reducedMotion} renderFileIcon={renderFileIcon} onContextMenu={onContextMenu} renderLayer={renderLayer} rowMenuSurfaceProps={rowMenuSurfaceProps} rowStatusSlot={rowStatusSlot} rowTrailingSlot={rowTrailingSlot} openingFolder={openingFolder} onOpenFolder={canInvoke(actions.showDownloadsFolder) ? () => void openFolder() : undefined}/></CodexCuMenuSurface>})}
    {showPeek && renderLayer?.({kind:'download-peek', anchorRef:triggerRef, open:showPeek, onClose:dismiss, side:'bottom', align:'end', sideOffset:4, collisionPadding:6, children:<CodexBrowserDownloadPeek surfaceProps={peekSurfaceProps} event={peek} download={currentDownload} actions={actions} locale={locale} onDismiss={dismiss} onViewDownloads={() => setOpen(true)} onError={onError} onHold={reason => {hold.current.add(reason); if (timeout.current != null) {remaining.current = Math.max(0, deadline.current - Date.now()); clearTimeout(timeout.current); timeout.current = null;}}} onRelease={reason => {hold.current.delete(reason); if (hold.current.size === 0 && timeout.current == null) schedule(remaining.current);}}/>})}
    {isVisible && <span className="codex-browser-download-sr" aria-atomic="true" aria-live="polite" role="status">{attentionEvent === initialEvent.current ? '' : lifecycleText(attentionEvent, locale)}</span>}
  </CodexCuScope>;
}

/* Global browser download history is a separate source branch. Its nested
 * settings rows never inherit the popover's filename/status/action layout. */
export function mergeCodexDownloadHistorySnapshot(history, live, searchQuery = '') {
  if (live == null) return history;
  const query = searchQuery.toLowerCase();
  const byId = new Map(history.downloads.map(download => [download.id, download]));
  for (const download of live.downloads) {
    const previous = byId.get(download.id);
    if (previous == null) {
      if (ACTIVE_STATUSES.has(download.status) && (download.filename.toLowerCase().includes(query) || download.url.toLowerCase().includes(query))) byId.set(download.id, download);
    } else byId.set(download.id, {...download, fileExists:previous.fileExists});
  }
  return {capturedAtMs:Math.max(history.capturedAtMs, live.capturedAtMs), downloads:[...byId.values()].sort((left, right) => right.startedAtMs - left.startedAtMs), unacknowledgedIds:history.unacknowledgedIds};
}
export function groupCodexDownloadHistory(downloads) {
  const byDay = new Map();
  for (const download of downloads) {
    const key = new Date(download.startedAtMs).toDateString();
    const group = byDay.get(key);
    if (group == null) byDay.set(key, {downloads:[download], key, startedAtMs:download.startedAtMs});
    else group.downloads.push(download);
  }
  return [...byDay.values()];
}
export function CodexBrowserDownloadHistoryRow({download, actions = {}, runAction, pending = false, platform = 'macOS', locale = 'zh-CN', reducedMotion = false, renderFileIcon}) {
  const active = ACTIVE_STATUSES.has(download.status);
  const missing = download.status === 'complete' && download.fileExists === false;
  const resumable = download.status === 'paused' && download.canResume;
  const complete = download.status === 'complete' && download.fileExists === true;
  const invoke = action => () => runAction ? runAction(action, download) : actions[action]?.(download);
  const filename = <span className="codex-browser-download-history-filename" data-missing={missing}>{download.filename}</span>;
  const label = missing ? <span className="codex-browser-download-history-deleted-label">{filename}<span className="codex-browser-download-history-deleted">{message(locale, 'settings.browserUse.downloadHistory.deleted')}</span></span> : filename;
  const time = <span className="codex-browser-download-history-time">{new Intl.DateTimeFormat(locale, {hour:'numeric', minute:'numeric'}).format(download.startedAtMs)}</span>;
  const controls = <>
    {(resumable || download.canPause) && <DownloadActionButton size="icon" iconClassName="codex-browser-download-icon-sm" label={message(locale, resumable ? 'settings.browserUse.downloadHistory.resume' : 'settings.browserUse.downloadHistory.pause')} icon={resumable ? 'primary:gm' : 'primary:vm'} disabled={pending || !canInvoke(actions[resumable ? 'resume' : 'pause'])} onClick={invoke(resumable ? 'resume' : 'pause')}/>}
    {download.fileExists === true && <DownloadActionButton size="icon" iconClassName="codex-browser-download-icon-sm" label={revealLabel(platform, locale)} icon="shared:qE" disabled={pending || !canInvoke(actions.showInFolder)} onClick={invoke('showInFolder')}/>}
    {(!active || download.canCancel) && <DownloadActionButton size="icon" iconClassName="codex-browser-download-icon-sm" label={message(locale, active ? 'settings.browserUse.downloadHistory.cancel' : 'settings.browserUse.downloadHistory.remove')} icon="shared:VT" disabled={pending || !canInvoke(actions[active ? 'cancel' : 'remove'])} onClick={invoke(active ? 'cancel' : 'remove')}>{pending ? <DownloadSpinner iconClassName="codex-browser-download-icon-sm"/> : null}</DownloadActionButton>}
  </>;
  const description = download.status === 'complete' ? undefined : <><CodexBrowserDownloadStatus download={download} locale={locale}/>{active && <CodexBrowserDownloadProgress download={download} reducedMotion={reducedMotion}/>}</>;
  const icon = <div className="codex-browser-download-file-icon">{fileIcon(download, renderFileIcon)}</div>;
  return complete && canInvoke(actions.open) ? <CodexCuSettingsActionRow actions={controls} ariaLabel={message(locale, 'settings.browserUse.downloadHistory.open', {filename:download.filename})} description={description} icon={icon} label={label} onClick={() => {if (!pending) invoke('open')();}} trailing={time} variant="nested"/> : <CodexCuSettingsRow control={<div className="codex-browser-download-history-controls">{time}{controls}</div>} description={description} icon={icon} label={label} variant="nested"/>;
}
export function CodexBrowserDownloadHistoryGroup({group, expanded, onToggle, actions, runAction, pendingActionId, platform, locale = 'zh-CN', reducedMotion, renderFileIcon}) {
  const contentId = 'browser-download-history-' + group.startedAtMs;
  const content = expanded ? group.downloads.map(download => <CodexBrowserDownloadHistoryRow key={download.id} download={download} actions={actions} runAction={runAction} pending={pendingActionId === download.id} platform={platform} locale={locale} reducedMotion={reducedMotion} renderFileIcon={renderFileIcon}/>) : null;
  return <CodexCuSettingsGroup><CodexCuSettingsDisclosureRow content={content} contentId={contentId} expanded={expanded}><button aria-controls={contentId} aria-expanded={expanded} className="codex-browser-download-history-toggle" disabled={!canInvoke(onToggle)} onClick={onToggle} type="button"><CodexCuSettingsRow control={<CodexCuIcon name="shared:_T" className="codex-browser-download-history-chevron" data-expanded={expanded}/>} label={new Intl.DateTimeFormat(locale, {day:'numeric', month:'short', year:'numeric'}).format(group.startedAtMs)}/></button></CodexCuSettingsDisclosureRow></CodexCuSettingsGroup>;
}

/* Host-owned search/pagination transports feed snapshots and callbacks. backSlot
 * keeps the authentic browser settings navigation/breadcrumb outside this lane. */
export function CodexBrowserDownloadHistory({snapshot, liveSnapshot, unfilteredSnapshot = snapshot, searchQuery = '', onSearchQueryChange, loading = snapshot == null, error, onRetry, onClearAll, clearing = false, hasMoreUnfiltered = false, paginationError, paginationContent, onRetryNextPage, actions = {}, pendingActionId, onError, locale = 'zh-CN', platform = 'macOS', reducedMotion = false, renderFileIcon, backSlot, theme, windowType = 'electron', pageProps = {}}) {
  const [expandedState, setExpandedState] = useState(null), [localPending, setLocalPending] = useState(null);
  const merged = snapshot == null ? null : mergeCodexDownloadHistorySnapshot(snapshot, liveSnapshot, searchQuery);
  const groups = merged == null ? [] : groupCodexDownloadHistory(merged.downloads);
  const selected = expandedState?.searchQuery === searchQuery ? expandedState.keys : null;
  const toggle = key => setExpandedState(previous => {
    const keys = new Set(previous?.searchQuery === searchQuery ? previous.keys : groups[0] == null ? [] : [groups[0].key]);
    if (keys.has(key)) keys.delete(key); else keys.add(key);
    return {keys, searchQuery};
  });
  const runAction = async (action, download) => {
    if (!canInvoke(actions[action])) return;
    setLocalPending(download.id);
    try {const result = await actions[action](download); if (result?.ok === false) onError?.(message(locale, 'settings.browserUse.downloadHistory.actionError'), 'settings.browserUse.downloadHistory.actionError');}
    catch {onError?.(message(locale, 'settings.browserUse.downloadHistory.actionError'), 'settings.browserUse.downloadHistory.actionError');}
    finally {setLocalPending(null);}
  };
  let body;
  if (loading && !error) body = <CodexCuSettingsPanelLoading>{message(locale, 'settings.browserUse.downloadHistory.loading')}</CodexCuSettingsPanelLoading>;
  else if (error && snapshot == null) body = <CodexCuSettingsGroup><CodexCuSettingsRow control={<CodexCuButton color="secondary" size="toolbar" disabled={!canInvoke(onRetry)} onClick={onRetry}>{message(locale, 'settings.browserUse.downloadHistory.retry')}</CodexCuButton>} label={message(locale, 'settings.browserUse.downloadHistory.loadError')}/></CodexCuSettingsGroup>;
  else if (groups.length === 0) body = <CodexCuSettingsGroup><DownloadEmpty locale={locale} title={message(locale, searchQuery.length ? 'settings.browserUse.downloadHistory.noResults' : 'settings.browserUse.downloadHistory.empty')} description={message(locale, searchQuery.length ? 'settings.browserUse.downloadHistory.noResults.description' : 'settings.browserUse.downloadHistory.empty.description')}/></CodexCuSettingsGroup>;
  else body = <CodexCuSettingsSectionContent>{groups.map((group, index) => <CodexBrowserDownloadHistoryGroup key={group.key} group={group} expanded={selected?.has(group.key) ?? index === 0} onToggle={() => toggle(group.key)} actions={actions} runAction={runAction} pendingActionId={pendingActionId ?? localPending} platform={platform} locale={locale} reducedMotion={reducedMotion} renderFileIcon={renderFileIcon}/>)}</CodexCuSettingsSectionContent>;
  const canClear = canInvoke(onClearAll) && unfilteredSnapshot != null && (hasMoreUnfiltered || unfilteredSnapshot.downloads.some(download => ENDED_STATUSES.has(download.status)));
  const searchLabel = message(locale, 'settings.browserUse.downloadHistory.search');
  return <CodexCuScope theme={theme} referenceWindowType={windowType}><CodexCuSettingsPage {...pageProps} backSlot={backSlot} title={message(locale, 'settings.browserUse.downloadHistory.title')} stickyControls={<CodexCuSettingsSearch id="browser-download-history-search" label={searchLabel} placeholder={searchLabel} clearLabel={message(locale, 'skills.pageSearchInput.clear')} onSearchQueryChange={onSearchQueryChange} disabled={!canInvoke(onSearchQueryChange)} searchQuery={searchQuery}/>}>
    <CodexCuSettingsSection><CodexCuSettingsSectionHeader title={message(locale, 'settings.browserUse.downloadHistory.allTime')} actions={<CodexCuButton color="secondary" disabled={!canClear} loading={clearing} onClick={onClearAll} size="toolbar">{message(locale, 'settings.browserUse.downloadHistory.clearAll')}</CodexCuButton>}/>{body}{snapshot != null && paginationContent}{snapshot != null && paginationError && <CodexCuSettingsGroup><CodexCuSettingsRow control={<CodexCuButton color="secondary" disabled={!canInvoke(onRetryNextPage)} onClick={onRetryNextPage} size="toolbar">{message(locale, 'settings.browserUse.downloadHistory.retry')}</CodexCuButton>} label={message(locale, 'settings.browserUse.downloadHistory.paginationError')}/></CodexCuSettingsGroup>}</CodexCuSettingsSection>
  </CodexCuSettingsPage></CodexCuScope>;
}
