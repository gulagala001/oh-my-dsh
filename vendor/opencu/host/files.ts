/** Local file actions invoked only by the authenticated product renderer. */
import { constants } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, open, readFile, realpath, rename, rmdir, stat, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { app, BrowserWindow, dialog, shell, type WebContents } from 'electron'
import { operateArtifactDocument } from './opencu-artifact-documents.ts'

const writes = new Map<string, Promise<unknown>>()
const etag = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** Open, reveal, read, or save a local file using the owning desktop window. */
export async function operateOpenCUFile(owner: WebContents, operation: unknown, args: unknown): Promise<unknown> {
  if (!args || typeof args !== 'object' || !('path' in args) || typeof args.path !== 'string' || !isAbsolute(args.path)) throw new Error('An absolute local file path is required')
  const path = await realpath(args.path), info = await stat(path)
  const home = resolve(process.env.DSH_HOME || join(homedir(), '.dsh'))
  const attachments = await realpath(join(home, 'attachments')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return join(home, 'attachments'); throw error })
  const editable = path !== attachments && !path.startsWith(attachments + sep)
  if (operation === 'metadata') return { kind: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other', sizeBytes: info.size, modifiedAtMs: info.mtimeMs, editable }
  if (operation === 'reveal') { shell.showItemInFolder(path); return { success: true } }
  if (!info.isFile()) throw new Error('A regular local file is required')
  if (operation === 'targets') {
    const icon = (await app.getFileIcon(path, { size: 'small' })).toDataURL()
    return { icon, platform: process.platform }
  }
  if (operation === 'open') {
    if (!('target' in args) || !['systemDefault', 'fileManager'].includes(String(args.target))) throw new Error('Unsupported local file target')
    if (args.target === 'fileManager') shell.showItemInFolder(path)
    else { const failure = await shell.openPath(path); if (failure) throw new Error(failure) }
    return { success: true }
  }
  if (operation === 'saveCopy') {
    const window = BrowserWindow.fromWebContents(owner)
    if (!window || window.isDestroyed()) throw new Error('The file owner window is unavailable')
    const live = (): void => {
      if (owner.isDestroyed() || window.isDestroyed()) throw new Error('The file owner window is unavailable')
    }
    live()
    const result = await dialog.showSaveDialog(window, { defaultPath: basename(path), properties: ['createDirectory', 'showOverwriteConfirmation'] })
    if (result.canceled || !result.filePath) return { path: null }
    live()
    const selected = result.filePath
    const destination = await realpath(selected).catch(async (error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return join(await realpath(dirname(selected)), basename(selected)); throw error })
    live()
    if (destination !== path) {
      if (destination === attachments || destination.startsWith(attachments + sep)) throw new Error('Save a local copy outside the attachment store')
      const directory = await mkdtemp(join(dirname(destination), '.opencu-copy-')), temporary = join(directory, 'copy')
      try { live(); await copyFile(path, temporary); await rename(temporary, destination) }
      finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
        await rmdir(directory)
      }
    }
    return { path: result.filePath }
  }
  if (operation === 'artifactDocument') {
    if (!editable) throw new Error('Save a local copy before editing a delivered attachment')
    if (info.size > 256 * 1024 * 1024) throw new Error('File exceeds the preview size limit')
    if (!('request' in args) || !('command' in args)) throw new Error('Artifact document command is required')
    return operateArtifactDocument(join(home, 'opencu', 'artifact-documents'), path, args.command, args.request, async (bytes, ifMatch) => {
      const result = await operateOpenCUFile(owner, 'write', { path, bytes, ifMatch })
      if (!result || typeof result !== 'object' || !('outcome' in result) || typeof result.outcome !== 'string') throw new Error('Invalid file save result')
      return { outcome: result.outcome, ...('etag' in result && typeof result.etag === 'string' ? { etag: result.etag } : {}) }
    })
  }
  if (operation === 'write') {
    if (!editable) throw new Error('Save a local copy before editing a delivered attachment')
    if (!('bytes' in args) || !(args.bytes instanceof Uint8Array) || args.bytes.byteLength > 256 * 1024 * 1024 || !('ifMatch' in args) || typeof args.ifMatch !== 'string') throw new Error('File writes require bytes and the current file version')
    const bytes = Buffer.from(args.bytes), expected = args.ifMatch
    const work = (writes.get(path) ?? Promise.resolve()).then(async () => {
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      let temporary: string | undefined
      try {
        const current = await file.stat()
        if (!current.isFile() || current.size > 256 * 1024 * 1024) throw new Error('File exceeds the preview size limit')
        if (etag(await file.readFile()) !== expected) return { outcome: 'conflict' }
        temporary = join(dirname(path), `.opencu-write-${randomUUID()}.tmp`)
        const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, current.mode & 0o777)
        try { await output.writeFile(bytes); await output.chmod(current.mode & 0o777); await output.sync() } finally { await output.close() }
        const latest = await stat(path)
        if (latest.ino !== current.ino || latest.dev !== current.dev || latest.size !== current.size || latest.mtimeMs !== current.mtimeMs || etag(await readFile(path)) !== expected) return { outcome: 'conflict' }
        await rename(temporary, path); temporary = undefined
        return { outcome: 'saved', etag: etag(bytes) }
      } finally {
        await file.close()
        if (temporary) await unlink(temporary)
      }
    })
    const settled = work.catch(() => undefined)
    writes.set(path, settled)
    try { return await work } finally { if (writes.get(path) === settled) writes.delete(path) }
  }
  if (operation === 'read') {
    const limit = 'maxBytes' in args && typeof args.maxBytes === 'number' && Number.isSafeInteger(args.maxBytes) && args.maxBytes > 0 ? Math.min(args.maxBytes, 256 * 1024 * 1024) : 256 * 1024 * 1024
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > limit) throw new Error('File exceeds the preview size limit')
      const chunks: Buffer[] = []
      let length = 0
      while (length <= limit) {
        const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, limit - length + 1))
        const { bytesRead } = await file.read(chunk, 0, chunk.length, null)
        if (!bytesRead) break
        length += bytesRead
        if (length > limit) throw new Error('File exceeds the preview size limit')
        chunks.push(chunk.subarray(0, bytesRead))
      }
      const bytes = Buffer.concat(chunks, length)
      return { contentsBase64: bytes.toString('base64'), sizeBytes: bytes.length, modifiedAtMs: info.mtimeMs, etag: etag(bytes) }
    } finally { await file.close() }
  }
  throw new Error('Unsupported local file operation')
}
