// Pinned host persistence primitives; retain its lock, framing and publication.
export { SessionWriteLease } from '../vendor/dsh/session-persistence-jsonl/src/lease.ts'
export { prepareJsonlMigration, readDecodedJsonlSource, verifyJsonlCurrentGeneration } from '../vendor/dsh/session-persistence-jsonl/src/generation.ts'
export { decompressZstdPrefix, scanZstdFrames } from '../vendor/dsh/session-persistence-jsonl/src/zstd.ts'
export { generationLogFilename, parseGenerationLogFilename } from '../vendor/dsh/session-persistence-jsonl/src/format.ts'
export { historicalSessionFormatCatalog, sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
export { createSessionFormatV3ToV4, historicalChildCatalogSource } from '@deepseek-ai/dsh-session-format-v3-to-v4'
export { SessionFormatEventCollector } from '@deepseek-ai/dsh-session-format'

import { createSessionFormatCatalog, type SessionFormatArtifact, type SessionFormatHeader } from '@deepseek-ai/dsh-session-format'
import { releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, sessionFormatV0ToV1 } from '@deepseek-ai/dsh-session-format-v0-to-v1'
import { releasedV2SessionFormatCodec, sessionFormatV1ToV2 } from '@deepseek-ai/dsh-session-format-v1-to-v2'
import { releasedV3SessionFormatCodec, sessionFormatV2ToV3, assertReleasedV3Header, restoreReleasedV3Artifact } from '@deepseek-ai/dsh-session-format-v2-to-v3'
import { RELEASED_V3_EVENT_TYPES } from '@deepseek-ai/dsh-session-format-v3-to-v4'

// Apply bounded legacy-plugin repairs before the historical relationship check,
// then retain both that check and the installed V4 validation before publication.
export function createLegacySessionCatalog(normalize: (artifact: SessionFormatArtifact) => SessionFormatArtifact) {
  const restore = (artifact: SessionFormatArtifact) => restoreReleasedV3Artifact(normalize(artifact), RELEASED_V3_EVENT_TYPES)
  return createSessionFormatCatalog({
    currentVersion: 3,
    codecs: [releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, releasedV2SessionFormatCodec, releasedV3SessionFormatCodec],
    currentEncoder: releasedV3SessionFormatCodec,
    migrations: [sessionFormatV0ToV1, sessionFormatV1ToV2, sessionFormatV2ToV3],
    restoreCurrent: restore, restoreTransformedCurrent: restore,
    restoreCurrentHeader(header: SessionFormatHeader) { assertReleasedV3Header(header); return header },
  })
}
