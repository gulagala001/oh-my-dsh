// Pinned host persistence primitives; retain its lock, framing and publication.
export { SessionWriteLease } from '../vendor/dsh/session-persistence-jsonl/src/lease.ts'
export { prepareJsonlMigration, readDecodedJsonlSource, verifyJsonlCurrentGeneration } from '../vendor/dsh/session-persistence-jsonl/src/generation.ts'
export { decompressZstdPrefix, scanZstdFrames } from '../vendor/dsh/session-persistence-jsonl/src/zstd.ts'
export { generationLogFilename, parseGenerationLogFilename, generationLogPath, sessionDir } from '../vendor/dsh/session-persistence-jsonl/src/format.ts'
export { historicalSessionFormatCatalog, sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
export { createSessionFormatV3ToV4, historicalChildCatalogSource } from '@deepseek-ai/dsh-session-format-v3-to-v4'
export { SessionFormatEventCollector } from '@deepseek-ai/dsh-session-format'

import { createSessionFormatCatalog, SessionFormatUnsupportedMigrationError, type SessionFormatArtifact, type SessionFormatHeader, type SessionFormatEvent,
  type SessionFormatEventRun, type SessionFormatMigration, type SessionFormatMigrationContext, type SessionFormatMigrationStage, type SessionFormatMigrationStageInput } from '@deepseek-ai/dsh-session-format'
import { releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, sessionFormatV0ToV1 } from '@deepseek-ai/dsh-session-format-v0-to-v1'
import { releasedV2SessionFormatCodec, sessionFormatV1ToV2 } from '@deepseek-ai/dsh-session-format-v1-to-v2'
import { releasedV3SessionFormatCodec, sessionFormatV2ToV3, assertReleasedV3Header, restoreReleasedV3Artifact } from '@deepseek-ai/dsh-session-format-v2-to-v3'
import { RELEASED_V3_EVENT_TYPES } from '@deepseek-ai/dsh-session-format-v3-to-v4'
import { legacyPluginSourceMigration } from './session-legacy-sources.mjs'

// The pinned V1 converter coalesces chunk rows and repairs interrupted turns.
// Read its completed native coordinate map instead of guessing by content or
// event count. Refuse publication if a different host no longer exposes it.
function trackedV1Migration(onMapping?: (mapping: Map<number, number>, types: { type: string }[]) => void): SessionFormatMigration {
  if (!onMapping) return sessionFormatV1ToV2
  return { ...sessionFormatV1ToV2, createStage(input: SessionFormatMigrationStageInput) {
    const stage = sessionFormatV1ToV2.createStage(input) as SessionFormatMigrationStage & { state?: { mapping?: Map<number, number> } }
    const types: { type: string }[] = []
    const observe = (event: SessionFormatEvent) => { types[event.seq] = { type: event.type } }
    return {
      get headerInheritedEventCount() { return stage.headerInheritedEventCount },
      transformEvent(event: SessionFormatEvent, context: SessionFormatMigrationContext) { observe(event); stage.transformEvent(event, context) },
      transformRun(run: SessionFormatEventRun, context: SessionFormatMigrationContext) { for (const event of run.expand()) observe(event); stage.transformRun(run, context) },
      finish(context: SessionFormatMigrationContext) {
        const inherited = stage.finish(context), mapping = stage.state?.mapping
        if (!(mapping instanceof Map)) throw new SessionFormatUnsupportedMigrationError('native V1 migration coordinate map is unavailable; owned references remain unchanged')
        onMapping(mapping, types)
        return inherited
      },
    }
  } }
}

// Apply bounded legacy-plugin repairs before the historical relationship check,
// then retain both that check and the installed V4 validation before publication.
export function createLegacySessionCatalog(normalize: (artifact: SessionFormatArtifact) => SessionFormatArtifact, onSourceEvent?: (event: SessionFormatEvent, seq: number) => void,
  onV1Mapping?: (mapping: Map<number, number>, types: { type: string }[]) => void) {
  const restore = (artifact: SessionFormatArtifact) => restoreReleasedV3Artifact(normalize(artifact), RELEASED_V3_EVENT_TYPES)
  return createSessionFormatCatalog({
    currentVersion: 3,
    codecs: [releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, releasedV2SessionFormatCodec, releasedV3SessionFormatCodec],
    currentEncoder: releasedV3SessionFormatCodec,
    migrations: [sessionFormatV0ToV1, trackedV1Migration(onV1Mapping), legacyPluginSourceMigration(sessionFormatV2ToV3, onSourceEvent)],
    restoreCurrent: restore, restoreTransformedCurrent: restore,
    restoreCurrentHeader(header: SessionFormatHeader) { assertReleasedV3Header(header); return header },
  })
}
