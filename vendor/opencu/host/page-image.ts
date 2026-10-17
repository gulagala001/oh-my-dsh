import type { WebContents } from 'electron'

type Send = (method: string, params?: object) => Promise<any> // Chromium resource replies are narrowed at each operation.
interface ResourceTree { frame: { id: string; loaderId: string }; resources: { url: string; mimeType: string; contentSize?: number }[]; childFrames?: ResourceTree[] }
const maximumBytes = 32 * 1024 * 1024

/** Reads the selected image's original bytes from its page, never from the app renderer or a screenshot. */
export async function readPageImage(guest: WebContents, send: Send, args: Record<string, unknown>): Promise<{ dataUrl: string }> {
  if (typeof args.url !== 'string' || typeof args.pageUrl !== 'string' || guest.getURL() !== args.pageUrl) throw new Error('The image page changed')
  const url = args.url, pageUrl = args.pageUrl
  if (!/^(https?:|blob:|data:image\/)/.test(url)) throw new Error('Unsupported page image URL')
  const { frameTree }: { frameTree: ResourceTree } = await send('Page.getResourceTree')
  const verifyPage = async (): Promise<void> => {
    if (guest.isDestroyed() || guest.getURL() !== pageUrl) throw new Error('The image page changed')
    const latest: { frameTree: ResourceTree } = await send('Page.getResourceTree')
    if (latest.frameTree.frame.id !== frameTree.frame.id || latest.frameTree.frame.loaderId !== frameTree.frame.loaderId) throw new Error('The image document changed')
  }
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const frames = (tree: ResourceTree): string[] => [tree.frame.id, ...(tree.childFrames ?? []).flatMap(frames)]
    for (const frameId of frames(frameTree)) {
      const { executionContextId } = await send('Page.createIsolatedWorld', { frameId, worldName: 'opencu-image-reader' })
      const result = await send('Runtime.evaluate', { contextId: executionContextId, awaitPromise: true, returnByValue: true,
        expression: `(async () => {
          const url = ${JSON.stringify(url)};
          if (![...document.images].some(image => (image.currentSrc || image.src) === url)) return null;
          const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error('The page could not read its image');
          const blob = await response.blob();
          if (!blob.type.startsWith('image/') || !blob.size || blob.size > ${maximumBytes}) throw new Error('The selected image is empty, invalid, or exceeds 32 MiB');
          return await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
          });
        })()`,
      })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'The page image could not be read')
      const dataUrl = result.result?.value
      if (dataUrl == null) continue
      await verifyPage()
      if (typeof dataUrl !== 'string' || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl) || dataUrl.length > maximumBytes * 4 / 3 + 128) throw new Error('Invalid page image')
      return { dataUrl }
    }
    throw new Error('The selected image is no longer present in this page')
  }
  const find = (tree: ResourceTree): { frameId: string; mimeType: string } | undefined => {
    const resource = tree.resources.find(item => item.url === url && item.mimeType.startsWith('image/'))
    if (resource) {
      if ((resource.contentSize ?? 0) > maximumBytes) throw new Error('The selected image exceeds 32 MiB')
      return { frameId: tree.frame.id, mimeType: resource.mimeType }
    }
    for (const child of tree.childFrames ?? []) { const result = find(child); if (result) return result }
  }
  const resource = find(frameTree)
  if (!resource) throw new Error('The selected image is no longer a resource of this page; reopen its context menu')
  let bytes: Buffer
  try {
    const result: { content: string; base64Encoded: boolean } = await send('Page.getResourceContent', { frameId: resource.frameId, url })
    bytes = Buffer.from(result.content, result.base64Encoded ? 'base64' : 'utf8')
  } catch (error) {
    if (url.startsWith('blob:') || url.startsWith('data:')) throw error
    // The frame and session keep the real browser's cookies and request policy when its cache was evicted.
    const { resource: loaded }: { resource: { success: boolean; stream?: string; netErrorName?: string; headers?: Record<string, string> } } = await send('Network.loadNetworkResource', {
      frameId: resource.frameId, url, options: { disableCache: false, includeCredentials: true },
    })
    if (!loaded.success || !loaded.stream) throw new Error(loaded.netErrorName ?? 'The browser could not read the image')
    const chunks: Buffer[] = []
    let size = 0
    try {
      const contentType = Object.entries(loaded.headers ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.split(';')[0]?.trim()
      if (contentType && !contentType.startsWith('image/')) throw new Error('The browser returned a non-image resource')
      if (contentType) resource.mimeType = contentType
      for (;;) {
        const chunk: { data: string; base64Encoded?: boolean; eof: boolean } = await send('IO.read', { handle: loaded.stream, size: 64 * 1024 })
        const data = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8')
        size += data.length
        if (size > maximumBytes) throw new Error('The selected image exceeds 32 MiB')
        chunks.push(data)
        if (chunk.eof) break
      }
      bytes = Buffer.concat(chunks)
    } finally { await send('IO.close', { handle: loaded.stream }) }
  }
  await verifyPage()
  if (!bytes.length || bytes.length > maximumBytes || !/^image\/[a-z0-9.+-]+$/i.test(resource.mimeType)) throw new Error('The selected image is empty, invalid, or exceeds 32 MiB')
  return { dataUrl: `data:${resource.mimeType};base64,${bytes.toString('base64')}` }
}
