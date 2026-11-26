import z from '@deepseek-ai/schemastery';
import { DEFAULT_USD_CNY, DEFAULT_RATE_DATE } from './monitor-exchange.mjs';
import { DEFAULT_IDENTITY } from './cc-adaptation/identity.mjs';
import { personalityPatch, personalityPreset, migratePersonalityConfig } from './cc-adaptation/personality.mjs';
import { CONTEXT_FREQUENCY_PRESETS } from './frequency.mjs';
import { DEFAULT_IMAGE_RULES, validateImageRules } from './image-rules.mjs';
import { PROMPT_STYLES, isPromptStyle } from './prompt-styles/options.mjs';
import { TASK_VERIFICATION_MODES } from './task-verification.mjs';

const route = z.object({ provider: z.string().default(''), model: z.string().default(''), temperature: z.number().default(0.7), effort: z.string().default('off') });
const personalityModules = z.object({ style: z.string(), communication: z.string(), presentation: z.string() });
const contextCadence = CONTEXT_FREQUENCY_PRESETS.medium;
export function configSnapshot(config = {}) {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key,
    value && typeof value.get === 'function' ? value.get() : value]));
}
// The pipeline reads and observes the same schema. Shared background routes and
// execution limits also belong here because preparation uses them.
const contextSwitches = {
  contextEnabled: z.boolean().default(true),
  contextOptimizationEnabled: z.boolean().default(true),
};
const contextPreparation = {
  automaticReplace: z.boolean().default(true),
  autoCompactEnabled: z.boolean().default(false),
  autoCompactThreshold: z.number().step(1).min(1).default(400000),
  autoCompactMode: z.union(['detail', 'brief']).default('detail'),
  preprocessBoundaries: z.boolean().default(false),
  memoryCacheEnabled: z.boolean().default(true),
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
};
const contextExecution = {
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
};
const pipelineSchema = z.object({ ...contextSwitches, ...contextPreparation, ...contextExecution });
export function pipelineConfig(raw = {}) {
  const values = Object.fromEntries(Object.keys(pipelineSchema.dict).map(key => [key, raw[key]]));
  rejectNullScalars(values, pipelineSchema.dict);
  const config = pipelineSchema(values);
  // The public settings schema preserves extension fields on stored routes.
  // Only the declared route options are consumed by background execution.
  for (const [key, field] of Object.entries(pipelineSchema.dict)) {
    if (field.type === 'object') config[key] = Object.fromEntries(Object.keys(field.dict).map(option => [option, config[key][option]]));
  }
  return structuredClone(config);
}

export const Config = z.object({
  dataDir: z.string(),
  projectlessWorkspaceRoot: z.string(),
  monitorCurrency: z.union(['original', 'USD', 'CNY']).default('original'),
  monitorUsdCny: z.number().default(DEFAULT_USD_CNY),
  monitorRateDate: z.string().default(DEFAULT_RATE_DATE),
  monitorPrices: z.array(z.object({
    provider: z.string().pattern(/\S/).required(), model: z.string().pattern(/\S/).required(), currency: z.string().pattern(/^[A-Z]{3}$/).required(),
    inputTokens: z.number().min(0), outputTokens: z.number().min(0), cacheReadTokens: z.number().min(0), cacheWriteTokens: z.number().min(0),
  })).default([]),
  ...contextSwitches,
  multiImageFixEnabled: z.boolean().default(true),
  multiImageFixRules: z.array(z.object({
    provider: z.string().pattern(/\S/).required(),
    maxImages: z.number().step(1).min(2).required(),
    maxBytes: z.number().step(1).min(1).required(),
    keepImages: z.number().step(1).min(1).required(),
  })).default(DEFAULT_IMAGE_RULES.map(rule => ({ ...rule }))),
  ...contextPreparation,
  identityPrompt: z.string().default(DEFAULT_IDENTITY),
  identityPreset: z.string().default('custom'),
  identitySavedPresets: z.array(z.object({ id: z.string().required(), name: z.string().required(), text: z.string().required(), description: z.string(), modules: personalityModules })).default([]),
  identityCustomPrompt: z.string(),
  identityCustomModules: personalityModules,
  identityCustomDescription: z.string(),
  sessionPersonalityEnabled: z.boolean().default(true),
  promptStyle: z.union(PROMPT_STYLES.map(option => option.value)).default('omd'),
  sessionPromptStyleEnabled: z.boolean().default(false),
  experimentalUnharnessedEnabled: z.boolean().default(false),
  experimentalUnharnessedSubagentsEnabled: z.boolean().default(true),
  stateHintsEnabled: z.boolean().default(false),
  budgetHintsEnabled: z.boolean().default(false),
  budgetEveryStep: z.boolean().default(false),
  budgetInjectionEvery: z.number().step(1).min(1).default(1),
  backgroundTasksEnabled: z.boolean().default(true),
  todoConstraintFirst: z.boolean().default(false),
  taskVerificationMode: z.union(TASK_VERIFICATION_MODES).default('default'),
  codegraphEnabled: z.boolean().default(true),
  componentAutoSetup: z.boolean().default(true),
  recommendedPluginsPageEnabled: z.boolean().default(true),
  recommendedPluginsAutoUpdate: z.boolean().default(false),
  pluginPreflightEnabled: z.boolean().default(false),
  memoryScope: z.union(['full', 'project', 'session', 'global']).default('project'),
  dreamAutoEnabled: z.boolean().default(false),
  dreamIntervalMs: z.number().step(1).min(60000).default(3600000),
  dreamDeepAgeMs: z.number().step(1).min(60000).default(604800000),
  dreamDailyTokens: z.number().step(1).min(0).default(200000),
  dreamProvider: z.string().default(''),
  dreamModel: z.string().default(''),
  dreamProjects: z.array(z.string()).default([]),
  ...contextExecution,
});

for (const [key, field] of Object.entries(Config.dict)) if (!['dataDir', 'projectlessWorkspaceRoot'].includes(key)) Config.dict[key] = field.volatile();

function rejectNullScalars(raw, fields) {
  for (const [key, value] of Object.entries(raw)) {
    const type = fields[key]?.type;
    if (value === null && ['number', 'boolean'].includes(type)) throw new Error(key + ' expected ' + type + ', got null');
  }
}

// Defaults apply to omitted values. An explicit null is not a numeric or
// boolean setting; use the same schema for API writes and pipeline options.
export function contextConfig(raw = {}) {
  raw = migratePersonalityConfig(raw);
  if (Object.hasOwn(raw, 'promptStyle') && !isPromptStyle(raw.promptStyle)) throw Error('无效的系统提示词风格');
  if (Object.hasOwn(raw, 'taskVerificationMode') && !TASK_VERIFICATION_MODES.includes(raw.taskVerificationMode)) throw Error('无效的任务验证档位');
  if (Object.hasOwn(raw, 'multiImageFixRules')) validateImageRules(raw.multiImageFixRules);
  personalityPatch(raw, personalityPreset(raw));
  rejectNullScalars(raw, Config.dict);
  const value = structuredClone(configSnapshot(Config(raw))), routes = new Set();
  validateImageRules(value.multiImageFixRules);
  if (!Number.isFinite(value.monitorUsdCny) || value.monitorUsdCny <= 0) throw Error('美元兑人民币汇率必须为正数');
  if (value.monitorRateDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.monitorRateDate)) throw Error('汇率日期无效');
  for (const price of value.monitorPrices) {
    for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
      if (Object.hasOwn(price, key) && (typeof price[key] !== 'number' || !Number.isFinite(price[key]) || price[key] < 0)) throw new Error('单价必须是非负有限数值，未知请留空');
    }
    const key = JSON.stringify([price.provider, price.model]);
    if (routes.has(key)) throw new Error('同一提供方和模型只能配置一条单价');
    routes.add(key);
  }
  return value;
}
