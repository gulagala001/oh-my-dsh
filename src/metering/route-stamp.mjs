import { createHash,randomUUID } from 'node:crypto';
import { ESTIMATOR_VERSION } from './estimate.mjs';

/** Resolve provider configuration through the public directory/settings seam.
 * Only a digest enters session logs. Opaque adapters get a runtime identity,
 * so an old process's receipt never impersonates a verified current route.
 */
export function createRouteStamps(ctx) {
  const runtime=randomUUID(),cache=new Map();let revision=0;
  const invalidate=()=>{revision++;cache.clear();};
  ctx.on('llm/adapters-updated',invalidate,{global:true,prepend:true});
  ctx.on('settings/document-updated',()=>cache.clear(),{global:true,prepend:true});
  return route=>{
    const llm=ctx.get('llm');
    if(!llm||!route)return null;
    const key=JSON.stringify([route.provider,route.model]);
    if(cache.has(key))return cache.get(key);
    const entry=llm.listConfigurableProviders?.().find(p=>p.provider===route.provider);
    const settings=ctx.get('settings');
    let value=entry&&settings?.describe?.().find(document=>document.ns===entry.settingsNs)?.value;
    for(const key of entry?.settingsPath??[])value=value?.[key];
    const source=value===undefined?{runtime,revision}:{settingsNs:entry.settingsNs,settingsPath:entry.settingsPath,value};
    const stamp=createHash('sha256').update(JSON.stringify([ESTIMATOR_VERSION,route.provider,route.model,source])).digest('hex');
    cache.set(key,stamp);return stamp;
  };
}
