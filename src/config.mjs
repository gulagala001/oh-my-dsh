import z from '@deepseek-ai/schemastery';
import { DEFAULT_IDENTITY } from './cc-adaptation/identity.mjs';
import { CONTEXT_FREQUENCY_PRESETS } from './frequency.mjs';

const route = z.object({ provider: z.string().default(''), model: z.string().default(''), temperature: z.number().default(0.7), effort: z.string().default('off') });
const contextCadence = CONTEXT_FREQUENCY_PRESETS.medium;
export function configSnapshot(config = {}) {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key,
    value && typeof value.get === 'function' ? value.get() : value]));
}
export const Config = z.object({
  dataDir: z.string(),
  contextEnabled: z.boolean().default(true),
  automaticReplace: z.boolean().default(true),
  preprocessBoundaries: z.boolean().default(false),
  prepareBatchWindows: z.number().step(1).min(1).default(2),
  prepareContinueTokens: z.number().step(1).min(1).default(8000),
  prepareInputTokens: z.number().step(1).min(1).default(300000),
  summaryTargetChars: z.number().step(1).min(1).default(1200),
  backgroundConcurrency: z.number().step(1).min(1).default(2),
  backgroundMaxRetries: z.number().step(1).min(0).default(2),
  digestWindow: z.number().step(1).min(1).default(contextCadence.digestWindow),
  digestLookback: z.number().step(1).min(0).default(8),
  coordinatorEvery: z.number().step(1).min(1).default(contextCadence.coordinatorEvery),
  coordinatorMinGapMs: z.number().step(1).min(0).default(contextCadence.coordinatorMinGapMs),
  coordinatorRecentEvents: z.number().step(1).min(0).default(12),
  traceEnabled: z.boolean().default(true),
  traceMaxChars: z.number().step(1).min(0).default(0),
  identityPrompt: z.string().default(DEFAULT_IDENTITY),
  stateHintsEnabled: z.boolean().default(false),
  budgetHintsEnabled: z.boolean().default(false),
  budgetEveryStep: z.boolean().default(false),
  budgetInjectionEvery: z.number().step(1).min(1).default(1),
  backgroundTasksEnabled: z.boolean().default(true),
  todoConstraintFirst: z.boolean().default(false),
  codegraphEnabled: z.boolean().default(true),
  componentAutoSetup: z.boolean().default(true),
  recommendedPluginsAutoUpdate: z.boolean().default(false),
  computerUseEnabled: z.boolean().default(true),
  computerUseBrowserExecutable: z.string().default(''),
  computerUseChromeUserDataDir: z.string().default(''),
  computerUseNativeBinary: z.string().default(''),
  computerUseNativeSocket: z.string().default(''),
  memoryScope: z.union(['full', 'project', 'session']).default('project'),
  backgroundMode: z.union(['unified', 'separate']).default('unified'),
  unifiedBackground: route.default({}),
  background: route.default({}),
  surgeon: route.default({}),
  jobTimeoutMs: z.number().step(1).min(0).default(600000),
  digestEvery: z.number().step(1).min(1).default(contextCadence.digestEvery),
  digestMaxTokens: z.number().step(1).min(0).default(0),
  idlePreprocessEnabled: z.boolean().default(false),
  flushIdleMs: z.number().step(1).min(0).default(90000),
  surgeonMaxTokens: z.number().step(1).min(0).default(0),
  requireShorter: z.boolean().default(true),
  keepTailEvents: z.number().step(1).min(0).default(30),
  surgeryCooldownSteps: z.number().step(1).min(0).default(contextCadence.surgeryCooldownSteps),
});

for (const [key, field] of Object.entries(Config.dict)) if (key !== 'dataDir') Config.dict[key] = field.volatile();

// Defaults apply to omitted values. An explicit null is not a numeric or
// boolean setting; use the same schema for API writes and pipeline options.
export function contextConfig(raw = {}) {
  for (const [key, value] of Object.entries(raw)) {
    const type = Config.dict[key]?.type;
    if (value === null && ['number', 'boolean'].includes(type)) throw new Error(key + ' expected ' + type + ', got null');
  }
  return structuredClone(configSnapshot(Config(raw)));
}
