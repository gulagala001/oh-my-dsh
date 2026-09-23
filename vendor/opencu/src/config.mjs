import z from '@deepseek-ai/schemastery';
export const Config = z.object({
  dataDir: z.string(),
  computerUseEnabled: z.boolean(),
  computerUseBrowserExecutable: z.string(),
  computerUseChromeUserDataDir: z.string(),
  computerUseNativeBinary: z.string(),
  computerUseNativeSocket: z.string(),
});

// Persist path edits through the live form, but activate them on restart as
// stated by the settings UI; only the enable switch changes this runtime.
for (const [key, field] of Object.entries(Config.dict)) if (key !== 'dataDir') Config.dict[key] = field.volatile();

export function configSnapshot(config = {}) {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key,
    value && typeof value.get === 'function' ? value.get() : value]));
}
