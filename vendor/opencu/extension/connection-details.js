const invalid = message => Object.assign(new Error(message), { code: 'INVALID_CONNECTION_DETAILS' });

export function parseConnectionDetails(text, manual = {}) {
  let value = manual;
  if (text.trim()) {
    try { value = JSON.parse(text); }
    catch { throw invalid('请粘贴「复制连接信息」得到的完整内容，不要只粘贴令牌。'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('连接信息不完整，请回到 DSH 重新复制。');
  const port = typeof value.port === 'number' || typeof value.port === 'string' && /^\d+$/.test(value.port) ? Number(value.port) : NaN;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw invalid('连接端口无效，请回到 DSH 重新复制连接信息。');
  if (typeof value.token !== 'string' || value.token.trim().length < 24) throw invalid('缺少连接令牌，请回到 DSH 复制并粘贴完整连接信息。');
  return { port, token: value.token.trim() };
}

export function connectionError(error) {
  if (error.code === 'INVALID_CONNECTION_DETAILS') return error.message;
  if (['UNAUTHORIZED', 'INVALID_TOKEN'].includes(error.code)) return '连接信息已失效或不正确，请回到 DSH 重新复制，再粘贴连接。';
  if (error.code === 'CONSENT_REQUIRED') return '请先勾选授权，再点击「授权并连接」。';
  if (error.code === 'ALREADY_CONNECTED') return '已有连接，请先断开后再更换。';
  if (['RELEASE_FAILED', 'DISCONNECT_FAILED'].includes(error.code)) return '尚未确认释放控制。请取消浏览器顶部的调试提示条，再点击「重试断开」。';
  if (['CLOSING', 'CLOSED', 'STALE_CONNECTION', 'DISCONNECTED'].includes(error.code)) return '本地连接已结束。请保持 DSH 打开，重新复制连接信息后再连接。';
  if (['TypeError', 'TimeoutError', 'AbortError'].includes(error.name) || ['INVALID_PORT', 'BRIDGE_FAILURE'].includes(error.code) || /fetch|network|timed?\s*out|aborted/i.test(error.message || '')) return '无法连接 DSH。请保持 DSH 打开，并从「电脑与浏览器 → Chrome / Edge 连接」重新复制连接信息。';
  return '连接未完成，请重试；仍失败时，请回到 DSH 重新复制连接信息。';
}
