import { Context } from '@deepseek-ai/cordis';
import { leaseComponent } from './component-lease.mjs';

export function acquireShared(ctx, id, component, config) {
  return leaseComponent(ctx, Symbol.for(`dsh-btw.${id}.v1`), ctx[Context.isolate]?.sessions, component, config);
}
