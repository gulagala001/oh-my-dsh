export function prepareNativeRuntime(directory: string, options?: {
  platform?: NodeJS.Platform;
  check?: boolean;
}): Promise<{ platform: NodeJS.Platform; packages: number; helpers: number; executables?: number; changed: number }>;
