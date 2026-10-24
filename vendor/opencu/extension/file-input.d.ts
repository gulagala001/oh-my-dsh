export function filePaths(value: unknown, options?: {allowString?: boolean}): string[]
export function fileInputState(this: HTMLInputElement, count: number): {multiple: boolean} | {__opencuFileError: {code: string; message: string}}
export function fileInputResult(value: unknown): {multiple: boolean}
export function validateFileInput(send: (method: string, params?: object) => Promise<any>, options: {backendNodeId: number; contextId?: number; files: string[]}): Promise<{multiple: boolean}>
export const clearFileInputFunction: string
export function writeFileInput(send: (method: string, params?: object) => Promise<any>, options: {backendNodeId: number; contextId?: number; files: string[]}): Promise<{fileCount: number; cleared?: boolean; eventDelivery?: string}>
