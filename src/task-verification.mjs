export const TASK_VERIFICATION_MODES = ['off', 'default', 'on'];
export const TASK_VERIFICATION_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'default', label: '默认' },
  { value: 'on', label: '开启' },
];
export const TASK_VERIFICATION_HINTS = {
  off: '停用验证工具、证据要求和验证提醒；保留普通待办与已有证据。',
  default: '提供验证工具和证据要求，不在收尾催促补充验证。',
  on: '启用完整验证：工具、证据要求、缺证据提醒和文字证据复核。',
};

export function verificationMode(preference, fallback = 'default') {
  if (TASK_VERIFICATION_MODES.includes(preference?.verificationMode)) return preference.verificationMode;
  // Old BT switches controlled reminders only; false never meant no tool.
  if (typeof preference?.verification === 'boolean') return preference.verification ? 'on' : 'default';
  return TASK_VERIFICATION_MODES.includes(fallback) ? fallback : 'default';
}

export const taskVerificationEnabled = (hub, session) => !session || hub?.taskReminders?.(session)?.verificationMode !== 'off';

// Only optional Todo bookkeeping language is removed. General work-quality
// instructions and the user's own requirements remain authoritative.
export function withoutTaskVerification(text) {
  return text.replaceAll(' and verification links', '')
    .replaceAll('Todo and verification continuation reminders', 'Todo continuation reminders')
    .replaceAll('Tasks, evidence, and reminder settings', 'Tasks and reminder settings')
    .replaceAll('Tasks, evidence, and BT settings', 'Tasks and BT settings');
}
