const refresh = entry => entry.refresh?.();
const ownsTurn = (entry, turn) => !entry.closed && !entry.closing && entry.turn === turn;

function acceptReceipt(entry, turn, value) {
  if (value?.requestId !== turn.id || typeof value.committed !== 'boolean'
    || value.committed && (!Array.isArray(value.messages) || value.messages.length !== 2
      || value.messages[0]?.role !== 'user' || value.messages[1]?.role !== 'assistant'
      || value.messages[0].text !== turn.text
      || value.messages.some(message => typeof message.text !== 'string' || typeof message.reasoning !== 'string')))
    throw Error('无法确认临时聊天回执，请恢复连接后重试。');
  if (!ownsTurn(entry, turn)) return;
  entry.messages = value.committed ? [...turn.before, ...value.messages] : turn.before;
  entry.draft = value.committed ? '' : turn.text;
  entry.error = value.committed ? '' : turn.error;
  entry.turn = null;
  refresh(entry);
}

async function settle(entry, turn, request) {
  const { id } = await entry.created;
  const value = await request('stop', { id, requestId: turn.id });
  acceptReceipt(entry, turn, value);
}

// A missing delivery receipt is uncertain, never permission to call the model
// again. The server's existing history decides whether to restore or commit.
export async function recoverTemporaryChat(entry, request) {
  const turn = entry.turn;
  if (!turn || entry.busy || !ownsTurn(entry, turn)) return;
  entry.busy = true; refresh(entry);
  try { await settle(entry, turn, request); }
  catch (error) { if (ownsTurn(entry, turn)) entry.error = `尚未确认上一轮回复，请恢复聊天后继续。${error.message}`; }
  finally { entry.busy = false; refresh(entry); }
}

export async function sendTemporaryChat(entry, request) {
  if (!entry.draft.trim() || entry.turn || entry.busy || entry.closed || entry.closing) return;
  const turn = { id: (entry.requestId ?? 0) + 1, text: entry.draft, before: entry.messages, abort: new AbortController() };
  entry.requestId = turn.id;
  entry.turn = turn; entry.busy = true; entry.error = ''; refresh(entry);
  let reader, confirmed = false;
  try {
    const { id } = await entry.created;
    turn.abort.signal.throwIfAborted();
    const response = await request('send', { id, requestId: turn.id, text: turn.text }, turn.abort.signal);
    reader = response.body.getReader();
    const decoder = new TextDecoder(), answer = { role: 'assistant', text: '', reasoning: '' };
    let pending = '';
    const receive = raw => {
      if (!raw.trim()) return;
      const event = JSON.parse(raw);
      if (event.type === 'error') throw Error(event.error);
      if (event.type === 'done') {
        if (event.committed !== true) throw Error('临时聊天尚未提交完整回复。');
        acceptReceipt(entry, turn, event); confirmed = true; return;
      }
      if (!ownsTurn(entry, turn)) return;
      if (event.type === 'start') entry.draft = '';
      if (event.type === 'text-delta') answer.text += event.text;
      if (event.type === 'reasoning-delta') answer.reasoning += event.text;
      entry.messages = [...turn.before, { role: 'user', text: turn.text }, { ...answer }];
      refresh(entry);
    };
    while (!confirmed) {
      const part = await reader.read();
      pending += decoder.decode(part.value, { stream: !part.done });
      let at;
      while (!confirmed && (at = pending.indexOf('\n')) >= 0) {
        const raw = pending.slice(0, at); pending = pending.slice(at + 1); receive(raw);
      }
      if (part.done) { if (!confirmed) receive(pending); break; }
    }
    if (!confirmed) throw Error('回复连接中断，草稿已保留。');
  } catch (error) {
    if (ownsTurn(entry, turn) && !confirmed) {
      turn.error = turn.abort.signal.aborted ? '回复已停止，草稿已保留。' : error.message;
      turn.abort.abort();
      entry.messages = turn.before; entry.draft = turn.text;
      refresh(entry);
      try { await settle(entry, turn, request); }
      catch (failure) { if (ownsTurn(entry, turn)) entry.error = `尚未确认上一轮回复，请恢复聊天后继续。${failure.message}`; }
    }
  } finally {
    // A valid done receipt is terminal even if EOF/transport cleanup fails.
    try { await reader?.cancel(); } catch {}
    reader?.releaseLock();
    entry.busy = false; refresh(entry);
  }
}
