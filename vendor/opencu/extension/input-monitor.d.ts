export interface PageInputMonitor {
  expectInput(events: Record<string, unknown>[], pending?: boolean): string;
  expectTextInput(text: string): string | undefined;
  clearInput(): void;
  finishInput(id: string, dispatched?: boolean): void;
  dispose(): void;
}
export function createPageInputMonitor(enqueue: (message: { type: string; kind: string }) => void): PageInputMonitor;
export function inputFrameFailure(error: Error & {code?: string | number; details?: Record<string, unknown>}, options?: {documentChanged?: () => boolean; validate?: () => Promise<unknown>}): Promise<Error & {code?: string | number; details?: Record<string, unknown>}>;
