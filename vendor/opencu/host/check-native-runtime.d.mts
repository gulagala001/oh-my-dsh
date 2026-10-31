export function checkNativeRuntime(directory: string, options?: { node?: string }): Promise<{
  platform: NodeJS.Platform;
  checked: boolean;
  results?: Array<{ variant: string; node: string; nativeErrors: number; terminalRoundTrips: number }>;
}>;
