import { createRequire } from 'node:module';
import { release } from 'node:os';
import { presentationArtifact, verifyPresentationArtifactSignature } from './artifact.mjs';
import { record, nonempty, positive } from './ipc.mjs';

const require = createRequire(import.meta.url);
const BOOLEAN_CAPABILITIES = ['appKitMainThread', 'remoteContextAvailable', 'nativePanelImplementation',
  'producerVideoControl', 'encodedVideo', 'springMotion', 'nativeControls', 'completionEffect',
  'atomicPrepare', 'machSendRightCarrier', 'encodedVideoRelay'];
let loaded;

export function loadPluginNativePresentations(app) {
  if (process.platform !== 'darwin') return { kind: 'unavailable', reason: 'platform' };
  if (process.type !== 'browser') return { kind: 'unavailable', reason: 'main-process' };
  if (!app.isReady()) return { kind: 'unavailable', reason: 'app-not-ready' };
  if (Number(release().split('.')[0]) < 23) return { kind: 'unavailable', reason: 'os-version' };
  if (Number(process.versions.napi ?? '0') < 8) return { kind: 'unavailable', reason: 'node-api' };
  if (loaded) return loaded;
  let artifact;
  try {
    artifact = presentationArtifact();
    if (!artifact) return { kind: 'unavailable', reason: 'artifact-missing', detail: 'This plugin installation is missing its prebuilt native presentation addon for the current macOS architecture. Install a complete OpenCU package.' };
    verifyPresentationArtifactSignature(artifact);
  } catch (error) { return { kind: 'unavailable', reason: 'artifact-invalid', detail: error.message }; }
  try {
    const value = require(artifact.binary);
    if (!record(value) || typeof value.getCapabilities !== 'function' || typeof value.createHost !== 'function') throw new Error('Invalid native presentation addon exports');
    const capabilities = () => {
      const result = value.getCapabilities();
      if (!record(result) || result.platform !== 'darwin' || result.nodeAPIVersion !== 8
        || BOOLEAN_CAPABILITIES.some(key => typeof result[key] !== 'boolean')) throw new Error('Invalid native presentation capabilities');
      return { platform: 'darwin', nodeAPIVersion: 8, ...Object.fromEntries(BOOLEAN_CAPABILITIES.map(key => [key, result[key]])) };
    };
    const actual = capabilities();
    if (['appKitMainThread', 'nativePanelImplementation', 'remoteContextAvailable', 'atomicPrepare', 'machSendRightCarrier'].some(key => !actual[key])) {
      throw new Error('The official Electron process cannot host remote AppKit presentations with this binding');
    }
    const addon = { getCapabilities: capabilities, createHost(options, onEvent) {
      const host = value.createHost(options, event => {
        if (!record(event) || !nonempty(event.type) || !nonempty(event.hostToken)
          || !positive(event.senderID) || !positive(event.senderGeneration) || !record(event.payload)) {
          throw new Error('Invalid native presentation lifecycle event');
        }
        onEvent(event);
      });
      if (!record(host) || !nonempty(host.hostToken) || !positive(host.ownerWindowID)
        || typeof host.command !== 'function' || typeof host.close !== 'function') throw new Error('Invalid native presentation host exports');
      return { hostToken: host.hostToken, ownerWindowID: host.ownerWindowID,
        command: input => host.command(input), close: () => host.close() === true };
    } };
    return loaded = { kind: 'available', addon, capabilities: actual,
      artifact: { provider: artifact.provider, platform: artifact.manifest.platform, arch: artifact.manifest.arch,
        nodeApiVersion: artifact.manifest.nodeApiVersion, packaged: artifact.packaged } };
  } catch (error) { return { kind: 'unavailable', reason: 'addon-failed', detail: error.message }; }
}
