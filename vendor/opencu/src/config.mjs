import z from '@deepseek-ai/schemastery';
export const Config = z.object({
  dataDir: z.string(),
  computerUseEnabled: z.boolean(),
  computerUseBrowserExecutable: z.string(),
  computerUseChromeUserDataDir: z.string(),
  computerUseNativeBinary: z.string(),
  computerUseNativeSocket: z.string(),
});
