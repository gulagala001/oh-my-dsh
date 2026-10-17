type OpenCUReply = { opencuReply: 1; ok: true; value: unknown } | { opencuReply: 1; ok: false; error: { message: string; code?: string; details?: object } }

/** Preserve operation errors that Electron's rejected invoke strips to a message. */
export async function replyOpenCU(work: () => unknown): Promise<OpenCUReply> {
  try { return { opencuReply: 1, ok: true, value: await work() } }
  catch (error) {
    const value = error instanceof Error ? error : new Error(String(error))
    return { opencuReply: 1, ok: false, error: { message: value.message,
      ...('code' in value && typeof value.code === 'string' ? { code: value.code } : {}),
      ...('details' in value && value.details !== null && typeof value.details === 'object' ? { details: value.details } : {}) } }
  }
}
