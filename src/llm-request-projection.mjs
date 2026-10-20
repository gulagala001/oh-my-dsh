import { symbols } from '@deepseek-ai/cordis';
import { isDeepStrictEqual } from 'node:util';

const registrations = new WeakMap();
const projectOptions = (entries, options) => {
  for (const entry of entries) if (entry.active) options = entry.project(options);
  return options;
};

function install(runtime) {
  const stream = runtime.stream, prepareCall = runtime.prepareCall;
  const descriptors = ['stream', 'prepareCall'].map(key => Object.getOwnPropertyDescriptor(runtime, key));
  const state = { entries: new Set() };
  state.stream = function(options) {
    return stream.call(this, projectOptions([...state.entries].reverse(), options));
  };
  state.prepareCall = async function(...args) {
    // Registration order belongs to this preparation. Owners can leave while
    // it is pending, but later owners cannot enter an already bound request.
    const entries = [...state.entries].reverse();
    const prepared = await prepareCall.apply(this, args);
    return Object.freeze({ ...prepared, stream: options => prepared.stream(projectOptions(entries, options)) });
  };
  runtime.stream = state.stream; runtime.prepareCall = state.prepareCall;
  const owned = ['stream', 'prepareCall'].map(key => Object.getOwnPropertyDescriptor(runtime, key));
  state.restore = () => {
    for (const [i, key] of ['stream', 'prepareCall'].entries()) {
      if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(runtime, key), owned[i])) continue;
      if (descriptors[i]) Object.defineProperty(runtime, key, descriptors[i]);
      else delete runtime[key];
    }
    if (registrations.get(runtime) === state) registrations.delete(runtime);
  };
  registrations.set(runtime, state);
  return state;
}

// Frozen requests cannot be replaced inside llm/stream middleware. Project at
// both public entry points, retaining native prepared-call ownership and hooks.
export function installRequestProjection(ctx, project) {
  ctx.effect(() => {
    const runtime = ctx.llm[symbols.original] || ctx.llm;
    let state = registrations.get(runtime);
    // An intervening external wrapper is an ordering boundary. Keep it in
    // place and create a new segment rather than moving it around projections.
    if (!state || runtime.stream !== state.stream || runtime.prepareCall !== state.prepareCall) state = install(runtime);
    const entry = { project, active: true }; state.entries.add(entry);
    return () => {
      entry.active = false; state.entries.delete(entry);
      if (!state.entries.size) state.restore();
    };
  });
}

// describe() serializes every active plugin schema. Request hooks read one
// provider profile; share a short-lived snapshot, refreshed on native updates.
const profiles = new WeakMap();
export function providerProfile(ctx, provider) {
  const settings = ctx.settings;
  if (!settings) return undefined;
  let cached = profiles.get(settings);
  if (!cached || Date.now() - cached.at > 1000) {
    cached = { at: Date.now(), providers: settings.describe().find(entry => entry.ns === 'llm-pi-ai')?.value?.providers };
    profiles.set(settings, cached);
  }
  return cached.providers?.[provider];
}
export function trackProviderProfiles(ctx) {
  ctx.on('settings/document-updated', ns => { if (ns === 'llm-pi-ai' && ctx.settings) profiles.delete(ctx.settings); }, { global: true });
}
