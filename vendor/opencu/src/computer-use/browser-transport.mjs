import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { viewportGeometry } from './browser-screenshot.mjs';

const closedReply = ({ id, sessionId }) => ({ id, sessionId, error: { code: -32001, message: 'Browser transport closed before the request completed' } });

// Playwright's public CDP transport lets us observe the actual input, including
// locator actions after scrolling/hit testing, without replacing those actions
// or installing event handlers in the website. Observer connections use this
// same transport, but the manager only displays its conversation's controller.
export class BrowserTransport {
  constructor(endpoint, onPointer, wantsPointer = () => true) {
    this.endpoint = endpoint; this.onPointer = onPointer; this.wantsPointer = wantsPointer; this.source = randomUUID();
    this.sessions = new Map(); this.requests = new Map(); this.observations = new Map();
    this.sequence = 0; this.nextId = -1; this.queue = [];
    this.open();
  }
  open() {
    if (this.socket || this.closed) return;
    const socket = this.socket = new WebSocket(this.endpoint, { handshakeTimeout: 10000 });
    socket.on('open', () => { for (const message of this.queue.splice(0)) socket.send(message); });
    // A WebSocket read can contain several CDP messages. Each delivery needs
    // its own task so Playwright can settle a response before handling the
    // execution-context events following it (notably with extension replay).
    socket.on('message', data => setImmediate(() => {
      let message;
      try { message = JSON.parse(data.toString()); }
      catch { this.close(); return; }
      const observation = this.observations.get(message.id);
      if (observation) {
        this.observations.delete(message.id);
        if (!message.error && message.result?.cssVisualViewport) this.pointer({ ...observation, geometry: viewportGeometry(message.result) });
        return;
      }
      const request = this.requests.get(message.id);
      if (request) {
        this.requests.delete(message.id);
        if (request.method === 'Page.getFrameTree') {
          const session = this.sessions.get(request.sessionId);
          if (session && message.result?.frameTree) session.loaderId = message.result.frameTree.frame.loaderId;
        }
      }
      if (message.method === 'Target.attachedToTarget') {
        const { sessionId, targetInfo } = message.params;
        this.sessions.set(sessionId, { ...targetInfo });
      } else if (message.method === 'Target.detachedFromTarget') {
        this.sessions.delete(message.params.sessionId);
      } else if (message.method === 'Page.frameNavigated' && !message.params.frame.parentId) {
        const session = this.sessions.get(message.sessionId);
        if (session) session.loaderId = message.params.frame.loaderId;
      }
      this.onmessage?.(message);
    }));
    socket.on('error', error => { this.reason = error.message; });
    socket.on('close', () => setImmediate(() => {
      this.closed = true; this.queue = []; this.sessions.clear(); this.observations.clear();
      // A connection EOF need not include Target.detachedFromTarget for every
      // custom CDP session. Settle its outstanding requests before Playwright
      // disposes the root connection and removes our message callback.
      const pending = [...this.requests.values()]; this.requests.clear();
      for (const request of pending) this.onmessage?.(closedReply(request));
      this.pointer({ hidden: true }); this.onclose?.(this.reason);
    }));
  }
  pointer(value) {
    if (this.closed && !value.hidden) return;
    // Visual feedback cannot throw into or delay the browser input channel.
    try { this.onPointer?.({ ...value, source: this.source }); } catch {}
  }
  write(message) {
    const data = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
    else if (!this.closed) this.queue.push(data);
  }
  send(message) {
    if (this.closed) { setImmediate(() => this.onmessage?.(closedReply(message))); return; }
    this.requests.set(message.id, { id: message.id, method: message.method, sessionId: message.sessionId });
    const session = this.sessions.get(message.sessionId);
    if (message.method === 'Input.dispatchMouseEvent' && session?.type === 'page' && session.loaderId && this.onPointer && this.wantsPointer(session.targetId)) {
      const { type, x, y, buttons = 0, button, clickCount } = message.params;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const id = this.nextId--, sequence = ++this.sequence, at = Date.now();
        if (type === 'mousePressed') session.press = { x, y, at, sequence, loaderId: session.loaderId };
        const press = session.press?.loaderId === session.loaderId && at - session.press.at < 250 ? session.press : undefined;
        this.observations.set(id, { targetId: session.targetId, loaderId: session.loaderId, sequence, at, issuedAt: performance.now(), type, x, y, buttons, button, clickCount, press });
        // Obtain the geometry in the same protocol stream as this input. This
        // adds no awaited round trip, and does not use old screenshot bounds.
        this.write({ id, sessionId: message.sessionId, method: 'Page.getLayoutMetrics', params: {} });
      }
    }
    this.write(message);
  }
  close() {
    this.closed = true; this.queue = [];
    this.socket?.terminate();
  }
}
