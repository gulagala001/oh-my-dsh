import z from '@deepseek-ai/schemastery';

const route = z.object({ provider: z.string().default(''), model: z.string().default(''), temperature: z.number().default(0.7) });
export const Config = z.object({
  dataDir: z.string(),
  memoryScope: z.union(['full', 'project', 'session']).default('full'),
  background: route.default({}),
  surgeon: route.default({}),
  stateEvery: z.number().step(1).min(1).default(8),
  curateMinGapMs: z.number().step(1).min(0).default(180000),
  minRegionTokens: z.number().step(1).min(1).default(4000),
  keepTailEvents: z.number().step(1).min(2).default(30),
  surgeryCooldownSteps: z.number().step(1).min(0).default(3),
  thresholdRatio: z.number().min(0.1).max(0.95).default(0.5),
});
