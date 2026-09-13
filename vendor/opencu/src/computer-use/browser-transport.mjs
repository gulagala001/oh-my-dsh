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
    this.sessions = new Map(); this.requests = new Map(); this.observations = new Map(); this.frameRestores = new Map(); this.frameAttachments = new Map();
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
      const attachment = this.frameAttachments.get(message.id);
      if (attachment) {
        this.frameAttachments.delete(message.id);
        if (attachment.detached || this.sessions.get(attachment.message.sessionId) !== attachment.parent) return;
        message = attachment.message;
      } else if (message.method === 'Target.attachedToTarget' && message.params.targetInfo.type === 'iframe' && !message.params.waitingForDebugger) {
        const parent = this.sessions.get(message.sessionId);
        if (parent && ['page', 'iframe'].includes(parent.type)) {
          // Restored OOPIFs attach before their parent's BFCache navigation.
          // A protocol round trip lets that commit reach Playwright first,
          // so it cannot immediately discard the restored child registration.
          const id = this.nextId--;
          this.frameAttachments.set(id, { message, parent });
          this.write({ id, sessionId: message.sessionId, method: 'Page.getFrameTree', params: {} });
          return;
        }
      }
      const restore = this.frameRestores.get(message.id);
      if (restore) {
        this.frameRestores.delete(message.id);
        const session = this.sessions.get(restore.sessionId), tree = message.result?.frameTree;
        if (!message.error && session === restore.session && session.loaderId === restore.loaderId && tree?.frame.loaderId === restore.loaderId) {
          const frames = new Set();
          const visit = node => {
            frames.add(node.frame.id);
            this.onmessage?.({ sessionId: restore.sessionId, method: 'Page.frameAttached', params: { frameId: node.frame.id, parentFrameId: node.frame.parentId } });
            this.onmessage?.({ sessionId: restore.sessionId, method: 'Page.frameNavigated', params: { frame: node.frame, type: 'Navigation' } });
            for (const child of node.childFrames ?? []) visit(child);
          };
          for (const child of tree.childFrames ?? []) visit(child);
          for (const context of session.contexts.values()) if (frames.has(context.auxData?.frameId))
            this.onmessage?.({ sessionId: restore.sessionId, method: 'Runtime.executionContextCreated', params: { context } });
        }
        return;
      }
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
          if (session && message.result?.frameTree) {
            const frame = message.result.frameTree.frame;
            session.loaderId = frame.loaderId;
            // A restored OOPIF has no new frameNavigated event. Playwright
            // does not initialize its URL from this non-main frame tree.
            if (session.restoreFrame && frame.id === session.targetId) {
              session.restoreFrame = false;
              this.onmessage?.({ sessionId: request.sessionId, method: 'Page.frameNavigated', params: { frame, type: 'Navigation' } });
            }
          }
        }
      }
      if (message.method === 'Target.attachedToTarget') {
        const { sessionId, targetInfo } = message.params;
        this.sessions.set(sessionId, { ...targetInfo, contexts: new Map(), restoreFrame: targetInfo.type === 'iframe' && !message.params.waitingForDebugger && ['page', 'iframe'].includes(this.sessions.get(message.sessionId)?.type) });
      } else if (message.method === 'Target.detachedFromTarget') {
        for (const attachment of this.frameAttachments.values()) if (attachment.message.params.sessionId === message.params.sessionId) attachment.detached = true;
        this.sessions.delete(message.params.sessionId);
      } else if (message.method === 'Page.frameNavigated') {
        const session = this.sessions.get(message.sessionId);
        if (session) {
          if (!message.params.frame.parentId || message.params.frame.id === session.targetId) session.loaderId = message.params.frame.loaderId;
          if (message.params.frame.id === session.targetId) session.restoreFrame = false;
        }
      }
      const session = this.sessions.get(message.sessionId);
      if (message.method === 'Runtime.executionContextsCleared') session?.contexts.clear();
      else if (message.method === 'Runtime.executionContextCreated') session?.contexts.set(message.params.context.id, message.params.context);
      else if (message.method === 'Runtime.executionContextDestroyed') session?.contexts.delete(message.params.executionContextId);
      this.onmessage?.(message);
      // BFCache restores existing documents without child frameAttached events.
      // Playwright clears its children at the main navigation, even though
      // Chromium has already replayed their execution contexts. Restore the
      // missing bindings from the actual frame tree, without reloading the page.
      if (session && message.method === 'Page.frameNavigated' && message.params.type === 'BackForwardCacheRestore' && !message.params.frame.parentId) {
        const id = this.nextId--;
        this.frameRestores.set(id, { sessionId: message.sessionId, session, loaderId: session.loaderId });
        this.write({ id, sessionId: message.sessionId, method: 'Page.getFrameTree', params: {} });
      }
    }));
    socket.on('error', error => { this.reason = error.message; });
    socket.on('close', () => setImmediate(() => {
      this.closed = true; this.queue = []; this.sessions.clear(); this.observations.clear(); this.frameRestores.clear(); this.frameAttachments.clear();
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
