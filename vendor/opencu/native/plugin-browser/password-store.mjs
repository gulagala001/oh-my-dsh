import { PluginBrowserCredentialStore } from './credential-store.mjs';

// The compatibility store and the production password store share one private,
// encrypted implementation; neither exposes secret operations as IPC methods.
export class PluginBrowserPasswordStore extends PluginBrowserCredentialStore {}
