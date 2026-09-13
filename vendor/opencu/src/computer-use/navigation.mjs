// Address-bar input, shared by new-tab and navigation actions. Model goto()
// still takes an explicit URL; free text search belongs to the user's UI.
export function addressToUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('网址过长或无效');
  const address = value.trim();
  if (!address) return 'about:blank';
  if (/^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(address)) return new URL('http://' + address).href;
  if (/^(?:[\w-]+\.)+[\w-]+(?::\d+)?(?:[/?#]|$)/i.test(address)) return new URL('https://' + address).href;
  if (/^[a-z][a-z\d+.-]*:/i.test(address)) {
    const parsed = new URL(address);
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol) && parsed.href !== 'about:blank') throw new Error('此地址类型不能在浏览器中打开');
    return parsed.href;
  }
  return 'https://www.google.com/search?q=' + encodeURIComponent(address);
}
