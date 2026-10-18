/** Read desktop capabilities only when the Host explicitly enables diagnostics. */
export async function initializeHostCapabilities({ api, signal, onState, readCapabilities, readNativeAccountView }) {
  if (signal.aborted) return;
  const state = await api('/state', undefined, signal);
  if (signal.aborted) return;
  onState?.(state);
  if (signal.aborted || state?.accountDiagnostics !== true) return;
  const capabilities = await readCapabilities() ?? {};
  if (signal.aborted) return;
  const nativeAccountView = readNativeAccountView() === true;
  if (signal.aborted) return;
  await api('/host-capabilities', {
    persistentProfiles: capabilities.persistentProfiles === true,
    downloads: capabilities.downloads === true,
    nativeAccountView,
  }, signal);
}
