const invalid = message => Object.assign(new Error(message), { code: 'INVALID_BROWSER_ACCESS' });

function httpUrl(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw invalid('Raw CDP requires an absolute HTTP(S) URL');
  let url;
  try { url = new URL(value); }
  catch { throw invalid('Raw CDP requires an absolute HTTP(S) URL. Relative URLs cannot be authorized without a trusted intercepted-request URL binding.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw invalid('Raw CDP requires an HTTP(S) URL without user information');
  }
  return url;
}

// Approval is obtained from the actual host tool execution for every operation.
export class PluginCdpProvider {
  #filePolicy;

  constructor(filePolicy) {
    if (typeof filePolicy?.isAccessApprovalAvailable !== 'function' || typeof filePolicy.requestAccessApproval !== 'function') {
      throw new TypeError('Raw CDP requires the plugin host access policy');
    }
    this.#filePolicy = filePolicy;
  }

  get enabled() { return this.#filePolicy.isAccessApprovalAvailable(); }

  isAvailable(record) {
    const adapter = record?.capabilityAdapter;
    return this.#filePolicy.isAccessApprovalAvailable(record) && typeof adapter?.send === 'function' && typeof adapter.subscribeEvents === 'function';
  }

  async authorizeOrigin({ origin, record, signal }) {
    const url = httpUrl(origin);
    if (url.origin !== origin) throw invalid('Raw CDP approval requires a canonical HTTP(S) origin');
    await this.#filePolicy.requestAccessApproval(record, {
      resource: 'fullCdp', target: origin, signal,
      reason: `Allow the current browser tool operation to use raw Chrome DevTools Protocol on ${origin}.`,
    });
    return true;
  }

  async authorizeUrl({ url: value, record, signal }) {
    const url = httpUrl(value);
    await this.#filePolicy.requestAccessApproval(record, {
      resource: 'origin', target: url.origin, signal,
      reason: `Allow the current raw Chrome DevTools Protocol operation to access the HTTP(S) origin ${url.origin}.`,
    });
    return true;
  }
}
