const CHALLENGE_ID = /^[A-Za-z0-9_-]{32,128}$/;
const OPTION_ID = /^[A-Za-z0-9_-]{1,48}$/;
const statuses = new Set(['submitted', 'declined', 'cancelled', 'unavailable', 'expired',
  'origin_changed', 'page_changed', 'locator_invalid', 'submission_failed']);
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => new Error('Browser auth broker is unavailable');

function deferred() {
  let resolve, reject, settled = false;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => {});
  return { promise, resolve(value) { if (!settled) { settled = true; resolve(value); } },
    reject(error) { if (!settled) { settled = true; reject(error); } } };
}

function requireTransport(transport) {
  if (!transport || !['setMessageCallback', 'addCloseListener', 'sendMessage', 'close']
    .every(name => typeof transport[name] === 'function')) throw unavailable();
  return transport;
}

// Ch's private broker protocol. The caller supplies its own authenticated
// transport; this module never discovers or connects to Codex's broker socket.
export class BrowserAuthBrokerChallenge {
  #transport; #registered = deferred(); #submission = deferred(); #completed = deferred();
  #id = null; #submissionReceived = false; #resultSent = false; #passwordMetadata = false; #closed = false;

  constructor(transport) {
    this.#transport = requireTransport(transport);
    transport.setMessageCallback(message => {
      try { this.#handle(message); } catch (error) { this.fail(error); }
    });
    transport.addCloseListener(error => this.fail(error ?? new Error('Browser auth broker closed unexpectedly')));
  }

  static async create(createTransport, fields, options, details = {}) {
    if (typeof createTransport !== 'function') throw unavailable();
    const transport = await createTransport({ maxFrameBytes: 128 * 1024,
      closedBeforeResponseMessage: 'Browser auth broker closed unexpectedly' });
    const challenge = new BrowserAuthBrokerChallenge(transport);
    try {
      challenge.#send({ type: 'register', fields, ...(options == null ? {} : { options }),
        ...(details.qrCode === true ? { qr_code: true } : {}), origins: details.origins,
        manual_save_fields: details.manualSaveFields, manual_save_session_id: details.manualSaveSessionId,
        credential_binding: details.credentialBinding, email_otp_session_id: details.emailOtpSessionId });
      await challenge.#registered.promise;
      return challenge;
    } catch (error) { challenge.fail(error); throw error; }
  }

  get id() {
    if (this.#id == null) throw new Error('Browser auth challenge is not registered');
    return this.#id;
  }
  get hasSubmission() { return this.#submissionReceived; }
  async waitForSubmission() { return await this.#submission.promise; }
  async complete(status, passwordSubmitted) {
    if (!statuses.has(status)) throw new Error('Invalid browser auth completion');
    if (!this.#resultSent) {
      this.#resultSent = true;
      try {
        this.#send({ type: 'result', challenge_id: this.id, status,
          password_submitted: this.#passwordMetadata ? passwordSubmitted : undefined });
      } catch (error) { this.fail(error); throw error; }
    }
    return await this.#completed.promise;
  }
  publishQrCodePayload(payload, disappeared) {
    if (typeof payload !== 'string' || !payload.length) throw new Error('Invalid browser auth QR code payload');
    this.#send({ type: 'qr_code_snapshot', challenge_id: this.id, payload,
      ...(disappeared === true ? { disappeared: true } : {}) });
  }
  close() { if (!this.#closed) { this.#closed = true; this.#transport.close(); } }
  fail(error) {
    if (this.#closed) return;
    this.#closed = true;
    this.#registered.reject(error); this.#submission.reject(error); this.#completed.reject(error);
    this.#transport.close(error);
  }
  #send(message) {
    if (this.#closed) throw new Error('Browser auth broker is closed');
    this.#transport.sendMessage(message);
  }
  #handle(message) {
    if (!object(message) || typeof message.type !== 'string') throw new Error('Invalid browser auth broker message');
    if (message.type === 'registered') {
      if (typeof message.challenge_id !== 'string' || !CHALLENGE_ID.test(message.challenge_id)) throw new Error('Invalid browser auth challenge id');
      this.#id = message.challenge_id; this.#passwordMetadata = message.password_submission_metadata === true;
      this.#registered.resolve(this.#id); return;
    }
    if (message.type === 'submission') {
      if (message.challenge_id !== this.id) throw new Error('Browser auth challenge id mismatch');
      if (this.#resultSent) return;
      if (!object(message.fields)) throw new Error('Invalid browser auth submission');
      const fields = Object.create(null);
      for (const [key, value] of Object.entries(message.fields)) {
        if (typeof value !== 'string') throw new Error('Invalid browser auth submission');
        fields[key] = value;
      }
      const { selected_option: selected, native_credential_delivery: native,
        ordinary_credential_delivery: ordinary, manual_credential_save: manual, email_otp_delivery: otp } = message;
      if (selected !== undefined && (typeof selected !== 'string' || !OPTION_ID.test(selected))) throw new Error('Invalid browser auth submission');
      if (native !== undefined && native !== true) throw new Error('Invalid native credential delivery');
      if (ordinary !== undefined && ordinary !== true || ordinary === true && native === true) throw new Error('Invalid ordinary credential delivery');
      if (manual !== undefined && manual !== true) throw new Error('Invalid manual credential saving');
      if (otp !== undefined && otp !== true || otp === true && (native === true || ordinary === true || manual === true)) throw new Error('Invalid email OTP delivery');
      this.#submissionReceived = true;
      this.#submission.resolve({ fields, email_otp_delivery: otp, native_credential_delivery: native,
        ordinary_credential_delivery: ordinary, manual_credential_save: manual,
        ...(selected === undefined ? {} : { selected_option: selected }) });
      return;
    }
    if (message.type === 'completed') {
      if (message.challenge_id !== this.id || !statuses.has(message.status)) throw new Error('Invalid browser auth completion');
      this.#completed.resolve(message.status); this.#submission.resolve({ status: message.status }); return;
    }
    throw new Error('Browser auth broker rejected the request');
  }
}

// _F reads only the broker's session-level observation bit, never credentials.
export async function readBrowserAuthNativeObservationStatus(createTransport, sessionId) {
  if (typeof createTransport !== 'function' || typeof sessionId !== 'string' || !sessionId || sessionId.length > 256) throw unavailable();
  const transport = requireTransport(await createTransport({ maxFrameBytes: 1024, singleResponse: true }));
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true; clearTimeout(timer); transport.close();
      if (value === undefined) reject(new Error('Native credential state is unavailable')); else resolve(value);
    };
    const timer = setTimeout(() => finish(), 3000);
    transport.addCloseListener(() => finish());
    transport.setMessageCallback(message => {
      if (!object(message) || Object.keys(message).length !== 2 || message.type !== 'native_observation_status'
        || typeof message.used !== 'boolean') { finish(); return; }
      finish(message.used);
    });
    try { transport.sendMessage({ type: 'native_observation_status', session_id: sessionId }); }
    catch { finish(); }
  });
}
