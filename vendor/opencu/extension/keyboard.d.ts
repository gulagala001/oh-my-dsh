export function keyEventKey(key: string, modifiers: number): string;
export function keyEventParameters(spec: { key: string; code: string; windowsVirtualKeyCode: number }, down: boolean, modifiers: number, isMac: boolean): {
  key: string; code: string; windowsVirtualKeyCode: number; type: 'keyDown' | 'rawKeyDown' | 'keyUp'; modifiers: number;
  commands?: string[]; text?: string; unmodifiedText?: string;
};
