// Pinned host persistence primitives; retain its lock, framing and publication.
export { SessionWriteLease } from '../vendor/dsh/session-persistence-jsonl/src/lease.ts'
export { prepareJsonlMigration, readDecodedJsonlSource, verifyJsonlCurrentGeneration } from '../vendor/dsh/session-persistence-jsonl/src/generation.ts'
export { decompressZstdPrefix, scanZstdFrames } from '../vendor/dsh/session-persistence-jsonl/src/zstd.ts'
export { generationLogFilename, parseGenerationLogFilename } from '../vendor/dsh/session-persistence-jsonl/src/format.ts'
export { historicalSessionFormatCatalog, sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
export { createSessionFormatV3ToV4, historicalChildCatalogSource } from '@deepseek-ai/dsh-session-format-v3-to-v4'
export { SessionFormatEventCollector } from '@deepseek-ai/dsh-session-format'
