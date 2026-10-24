export function keyEventKey(key: string, modifiers: number): string;
export function keyEventParameters(spec: { key: string; code: string; windowsVirtualKeyCode: number }, down: boolean, modifiers: number, isMac: boolean, keyboardEditable?:boolean): {
  key: string; code: string; windowsVirtualKeyCode: number; type: 'keyDown' | 'rawKeyDown' | 'keyUp'; modifiers: number;
  commands?: string[]; text?: string; unmodifiedText?: string;
};

export function guestKeySpec(value: unknown): {key:string;code:string;windowsVirtualKeyCode:number};
export function extensionKeySpec(value: unknown): {key:string;code:string;windowsVirtualKeyCode:number};
export function sequentialTextKey(character:string): string|undefined;
export function checkSequentialDeadline(deadline?:number): void;
