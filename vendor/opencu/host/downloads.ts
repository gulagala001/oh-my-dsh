/** DownloadItem ownership for opt-in OpenCU sidebar leases. */
import { mkdirSync, existsSync, chmodSync, copyFileSync, writeFileSync, renameSync } from 'node:fs'
import { basename, extname, isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, dialog, shell, type DownloadItem, type WebContents } from 'electron'

interface DownloadRecord {
  id: string
  filename: string
  url: string
  startedAtMs: number
  updatedAtMs: number
  status: 'started' | 'in_progress' | 'paused' | 'complete' | 'failed' | 'canceled'
  receivedBytes: number
  totalBytes: number
  canPause: boolean
  canResume: boolean
  canCancel: boolean
  fileExists: boolean
  error?: string
  exportError?: string
}
interface DownloadLease {
  owner: WebContents
  downloads: Set<DownloadItem>
  downloadDirectory?: string
  exportDirectory?: string | undefined
  promptForDownload?: boolean
}
const records = new Map<string, { owner: WebContents; path: string; item: DownloadItem; value: DownloadRecord }>()
function safeName(value: string): string {
  const name = basename(value.replaceAll('\\', '/')).replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '') || 'download'
  const extension = extname(name), suffix = Buffer.byteLength(extension) <= 180 ? extension : ''
  let stem = '', bytes = Buffer.byteLength(suffix)
  for (const character of name.slice(0, name.length - suffix.length)) {
    bytes += Buffer.byteLength(character)
    if (bytes > 180) break
    stem += character
  }
  const filename = stem + suffix
  return /^record[.]json(?:[.]pending)?$/i.test(filename) ? 'download-' + filename : filename
}

/** Configure and operate on the caller's reserved guest, never another window's files. */
export async function openCUDownloadOperation(lease: DownloadLease, operation: unknown, args: unknown): Promise<unknown> {
  if (typeof args !== 'object' || args === null) throw new Error('Invalid download arguments')
  if (operation === 'configure') {
    if (!('directory' in args) || typeof args.directory !== 'string' || !isAbsolute(args.directory)) throw new Error('Absolute download directory required')
    mkdirSync(args.directory, { recursive: true, mode: 0o700 })
    lease.downloadDirectory = args.directory
    lease.exportDirectory = 'exportDirectory' in args && typeof args.exportDirectory === 'string' && isAbsolute(args.exportDirectory) ? args.exportDirectory : undefined
    lease.promptForDownload = 'prompt' in args && args.prompt === true
    return { ok: true }
  }
  if (!lease.downloadDirectory) throw new Error('Downloads are not configured for this guest')
  if (operation === 'chooseDownloadDirectory') {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  }
  if (operation === 'showDownloadsFolder') {
    const failure = await shell.openPath(lease.downloadDirectory)
    if (failure) throw new Error(failure)
    return { ok: true }
  }
  if (operation === 'list') return [...records.values()].filter(record => record.owner === lease.owner).map(record => ({ ...record.value }))
  if (!('id' in args) || typeof args.id !== 'string' || !/^[a-f0-9-]{36}$/.test(args.id)) throw new Error('Invalid download identity')
  const record = records.get(args.id)
  if (record && record.owner !== lease.owner) throw new Error('Download belongs to another window')
  const filename = 'filename' in args && typeof args.filename === 'string' ? args.filename : null
  if (!record && (!filename || basename(filename) !== filename || filename.includes('\\') || filename.includes('\u0000') || ['.', '..'].includes(filename))) throw new Error('A retained download filename is required')
  const path = record?.path ?? join(lease.downloadDirectory, args.id, filename!)
  if (operation === 'open' || operation === 'showInFolder') {
    if (!existsSync(path)) throw new Error('Downloaded file is missing')
    if (operation === 'open') { const failure = await shell.openPath(path); if (failure) throw new Error(failure) }
    else shell.showItemInFolder(path)
  } else {
    if (!record || ['complete', 'failed', 'canceled'].includes(record.value.status)) throw new Error('Download is no longer active')
    if (operation === 'pause') record.item.pause()
    else if (operation === 'resume' && record.item.canResume()) record.item.resume()
    else if (operation === 'cancel') record.item.cancel()
    else throw new Error('Unsupported download action')
  }
  return { ok: true }
}

/** Persist bytes without a save dialog; REA owns progress and subsequent file actions. */
export function captureOpenCUDownload(lease: DownloadLease, item: DownloadItem): boolean {
  if (!lease.downloadDirectory) return false
  const id = randomUUID(), filename = safeName(item.getFilename()), directory = join(lease.downloadDirectory, id)
  mkdirSync(directory, { mode: 0o700 })
  const path = join(directory, filename)
  const value: DownloadRecord = { id, filename, url: item.getURL(), startedAtMs: Date.now(), updatedAtMs: Date.now(), status: 'started',
    receivedBytes: 0, totalBytes: item.getTotalBytes(), canPause: true, canResume: false, canCancel: true, fileExists: false }
  const record = { owner: lease.owner, path, item, value }
  const persist = () => {
    const pending = join(directory, 'record.json.pending')
    writeFileSync(pending, JSON.stringify(value), { mode: 0o600 })
    renameSync(pending, join(directory, 'record.json'))
  }
  persist()
  records.set(id, record)
  if (lease.promptForDownload) item.setSaveDialogOptions({ defaultPath: join(lease.exportDirectory ?? app.getPath('downloads'), filename), properties: ['createDirectory', 'showOverwriteConfirmation'] })
  else item.setSavePath(path)
  lease.downloads.add(item)
  item.on('updated', (_event, state) => {
    Object.assign(value, { updatedAtMs: Date.now(), status: item.isPaused() || state === 'interrupted' ? 'paused' : 'in_progress',
      receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(), canPause: !item.isPaused() && state !== 'interrupted', canResume: item.canResume() })
  })
  item.once('done', (_event, state) => {
    lease.downloads.delete(item)
    Object.assign(value, { updatedAtMs: Date.now(), status: state === 'completed' ? 'complete' : state === 'cancelled' ? 'canceled' : 'failed',
      receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(), canPause: false, canResume: false, canCancel: false,
      fileExists: false })
    if (state === 'completed') {
      try {
        if (item.getSavePath() !== path) copyFileSync(item.getSavePath(), path)
        chmodSync(path, 0o600)
        value.fileExists = true
      } catch (error) { value.status = 'failed'; value.error = String(error) }
      if (value.fileExists && !lease.promptForDownload && lease.exportDirectory) {
        try {
          let destination = join(lease.exportDirectory, filename)
          if (existsSync(destination)) destination = join(lease.exportDirectory, `${id}-${filename}`)
          copyFileSync(path, destination, 1)
        } catch (error) { value.exportError = `Download retained, but export failed: ${String(error)}` }
      }
    }
    try { persist() } catch (error) { console.error('OpenCU retained download metadata', error) }
  })
  return true
}
