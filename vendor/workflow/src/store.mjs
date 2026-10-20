import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';

const key = id => {
  if (typeof id !== 'string' || !id || id === '.' || id === '..' || /[\\/\0]/.test(id)) throw Error('Invalid workflow session id');
  return id;
};

/** Only workflow budgets live here; native sessions and journals retain their owners. */
export class WorkflowStore {
  constructor(directory) {
    this.dir = resolve(directory);
    this.states = new Map();
    mkdirSync(join(this.dir, 'sessions'), { recursive: true, mode: 0o700 });
  }
  peek(id) {
    key(id);
    if (this.states.has(id)) return this.states.get(id);
    try {
      const value = JSON.parse(readFileSync(join(this.dir, 'sessions', `${id}.json`), 'utf8'));
      if (value.id !== id) throw Error('Workflow budget identity mismatch');
      this.states.set(id, value);
      return value;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  state(id) {
    const state = this.peek(id) ?? { id };
    this.states.set(id, state);
    return state;
  }
  save(state) {
    const path = join(this.dir, 'sessions', `${key(state.id)}.json`);
    writeFileSync(`${path}.tmp`, JSON.stringify(state) + '\n', { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
    this.states.set(state.id, state);
  }
}
