import { leaseComponent } from './component-lease.mjs';
import { Context } from '@deepseek-ai/cordis';
import { Extensions, VERSION } from './service.mjs';

export const name = 'dsh-extensions';
export const inject = ['webServer', 'connection', 'loader'];
export { VERSION };

const ownership = Symbol.for('dsh.extensions.backend');
const component = { name: 'dsh-extensions-service', inject, apply(scope) { new Extensions(scope); } };

export function apply(ctx) {
  ctx.root[Context.isolate].dshExtensions ??= Symbol('dshExtensions');
  return leaseComponent(ctx, ownership, ctx[Context.isolate].dshExtensions, component);
}
