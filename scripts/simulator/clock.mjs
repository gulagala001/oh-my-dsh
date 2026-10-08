import { setImmediate as nativeSetImmediate } from 'node:timers';

const checkpoint = () => new Promise((resolve) => nativeSetImmediate(resolve));

/** Controls only timers registered on this instance, not I/O or OS time. */
export class VirtualClock {
  constructor({ now = 1700000000000, maxCallbacks = 10000 } = {}) {
    if (!Number.isFinite(now)) throw new TypeError('now must be finite');
    if (!Number.isSafeInteger(maxCallbacks) || maxCallbacks < 1) {
      throw new TypeError('maxCallbacks must be a positive safe integer');
    }
    this._now = now;
    this._maxCallbacks = maxCallbacks;
    this._nextId = 1;
    this._timers = new Map();
    this._callbackErrors = [];
    this._advancing = false;
    this._disposed = false;
    for (const name of ['now', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'advance', 'pending', 'dispose']) {
      this[name] = this[name].bind(this);
    }
  }

  now() { return this._now; }

  _schedule(fn, ms, args, interval) {
    if (this._disposed) throw new Error('VirtualClock is disposed');
    if (typeof fn !== 'function') throw new TypeError('timer callback must be a function');
    const delay = Number(ms ?? 0);
    if (!Number.isFinite(delay)) throw new TypeError('timer delay must be finite');
    const normalized = Math.max(0, delay);
    const due = this._now + normalized;
    if (!Number.isFinite(due)) throw new RangeError('timer due time is outside the finite range');
    const id = this._nextId++;
    const task = { id, due, fn, args, interval: interval ? normalized : null, refed: true };
    const handle = {
      id,
      ref() { task.refed = true; return this; },
      unref() { task.refed = false; return this; },
      hasRef() { return task.refed; },
      [Symbol.toPrimitive]() { return id; },
    };
    task.handle = handle;
    this._timers.set(id, task);
    return handle;
  }

  setTimeout(fn, ms = 0, ...args) { return this._schedule(fn, ms, args, false); }
  setInterval(fn, ms = 0, ...args) { return this._schedule(fn, ms, args, true); }

  clearTimeout(handle) {
    // An object from another clock must not cancel a coincident local ID.
    const id = typeof handle === 'number' ? handle : handle?.id;
    const task = this._timers.get(id);
    if (task && (typeof handle === 'number' || task.handle === handle)) this._timers.delete(id);
  }

  clearInterval(handle) { this.clearTimeout(handle); }

  pending() {
    return [...this._timers.values()]
      .sort((a, b) => a.due - b.due || a.id - b.id)
      .map(({ id, due, interval, refed }) => ({ id, due, type: interval === null ? 'timeout' : 'interval', interval, refed }));
  }

  async _checkpoint() {
    // Native setImmediate drains arbitrarily deep finite microtask chains. Awaiting
    // callbacks themselves would deadlock callbacks that await a later timer.
    await checkpoint();
    if (this._callbackErrors.length) throw this._callbackErrors.shift();
  }

  async advance(ms) {
    if (this._disposed) throw new Error('VirtualClock is disposed');
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
      throw new RangeError('advance requires a finite nonnegative number');
    }
    const target = this._now + ms;
    if (!Number.isFinite(target)) throw new RangeError('advance target is outside the finite range');
    if (this._advancing) throw new Error('Concurrent or reentrant clock advancement is not allowed');
    this._advancing = true;
    let callbacks = 0;
    try {
      await this._checkpoint();
      while (!this._disposed) {
        const task = [...this._timers.values()]
          .filter((candidate) => candidate.due <= target)
          .sort((a, b) => a.due - b.due || a.id - b.id)[0];
        if (!task) break;
        if (callbacks >= this._maxCallbacks) {
          throw new Error(`VirtualClock callback limit exceeded (${this._maxCallbacks}); possible zero interval or runaway timer`);
        }
        callbacks++;
        this._now = task.due;
        if (task.interval === null) this._timers.delete(task.id);
        else {
          task.due += task.interval;
          if (!Number.isFinite(task.due)) {
            this._timers.delete(task.id);
            throw new RangeError('interval due time is outside the finite range');
          }
        }
        const result = task.fn.apply(task.handle, task.args);
        if (result && typeof result.then === 'function') {
          Promise.resolve(result).catch((error) => {
            if (!this._disposed) this._callbackErrors.push(error);
          });
        }
        await this._checkpoint();
      }
      if (!this._disposed) this._now = target;
      return { now: this._now, callbacks, pending: this._timers.size };
    } finally {
      this._advancing = false;
    }
  }

  dispose() {
    this._disposed = true;
    this._timers.clear();
    this._callbackErrors.length = 0;
  }
}
