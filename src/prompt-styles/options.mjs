export const PROMPT_STYLES = Object.freeze([
  { value: 'omd', label: 'OMD 默认' },
  { value: 'dsh', label: 'DSH 原生' },
  { value: 'codex', label: 'Codex' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'pi', label: 'Pi' },
  { value: 'grok', label: 'Grok' },
  { value: 'zcode', label: 'ZCode' },
].map(Object.freeze));
export const isPromptStyle = value => PROMPT_STYLES.some(option => option.value === value);
export const promptStyle = value => isPromptStyle(value) ? value : 'omd';
