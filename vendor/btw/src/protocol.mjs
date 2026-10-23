// One set of request/history limits for the server, browser store and composer.
export const MAX_QUESTION = 16000;
export const MAX_ANSWER = 64000;
export const MAX_HISTORY = 20;

export function validateQuestion(value) {
  if (typeof value !== 'string' || !value.trim()) throw Error('请输入旁聊问题');
  if (value.length > MAX_QUESTION) throw Error('问题过长，请控制在 16000 字符内');
  return value.trim();
}
