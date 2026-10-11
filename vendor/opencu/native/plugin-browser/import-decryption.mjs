import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { importFailure, assertImportSignal, assertSourceIdentitiesSync, readSourceJson } from './import-source.mjs';

const macIv = Buffer.alloc(16, 0x20);
const macEmptyFallback = Buffer.from('d0d0ec9c7d77d43ac54187fa4818d17f', 'hex');
const dpapiScript = "$ErrorActionPreference='Stop';try{Add-Type -AssemblyName System.Security;$text=[Console]::In.ReadToEnd();$inputBytes=[Convert]::FromBase64String($text);$outputBytes=[System.Security.Cryptography.ProtectedData]::Unprotect($inputBytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($outputBytes));[Array]::Clear($inputBytes,0,$inputBytes.Length);[Array]::Clear($outputBytes,0,$outputBytes.Length)}catch{[Console]::Error.Write('DPAPI_FAILED');exit 1}";

function decryptCipher(algorithm, key, iv, payload, tag) {
  let update, final;
  try {
    const cipher = createDecipheriv(algorithm, key, iv);
    if (tag) cipher.setAuthTag(tag);
    update = cipher.update(payload); final = cipher.final();
    return Buffer.concat([update, final]);
  } finally { update?.fill(0); final?.fill(0); }
}

async function systemSecret(executable, arguments_, { signal, input, limit = 131072, timeout = 120000, errorCode }) {
  assertImportSignal(signal);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let chunks = [], errors = [], length = 0, errorLength = 0, reason, finished = false;
    const stop = code => { reason ??= importFailure(code); child.kill(); };
    const abort = () => stop('ABORTED');
    const timer = setTimeout(() => stop('SOURCE_SYSTEM_AUTHORIZATION_TIMEOUT'), timeout);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      length += chunk.length;
      if (length > limit) { chunk.fill(0); stop('SOURCE_SYSTEM_RESULT_INVALID'); } else chunks.push(chunk);
    });
    child.stderr.on('data', chunk => {
      errorLength += chunk.length;
      if (errorLength > 16384) { chunk.fill(0); stop('SOURCE_SYSTEM_RESULT_INVALID'); } else errors.push(chunk);
    });
    child.stdin.on('error', () => { reason ??= importFailure(errorCode); });
    child.once('error', () => { reason ??= importFailure('SOURCE_SYSTEM_API_UNAVAILABLE'); });
    child.once('close', code => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      const output = Buffer.concat(chunks), diagnostics = Buffer.concat(errors);
      for (const chunk of [...chunks, ...errors]) chunk.fill(0);
      chunks = []; errors = [];
      if (!reason && code !== 0) {
        const text = diagnostics.toString('utf8');
        const mapped = process.platform === 'darwin' && /could not be found|not found|\(-25300\)/iu.test(text) ? 'SOURCE_KEYCHAIN_ITEM_NOT_FOUND'
          : process.platform === 'darwin' && /canceled|cancelled|\(-128\)/iu.test(text) ? 'SOURCE_KEYCHAIN_USER_CANCELED' : errorCode;
        reason = importFailure(mapped);
      }
      diagnostics.fill(0);
      if (signal?.aborted) reason = importFailure('ABORTED');
      if (reason) { output.fill(0); reject(reason); } else resolve(output);
    });
    if (signal?.aborted) abort();
    child.stdin.end(input ?? undefined);
  });
}

function decodeBase64(value, code) {
  if (typeof value !== 'string' || !value || value.length > 131072 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 !== 0) throw importFailure(code);
  return Buffer.from(value, 'base64');
}

async function unprotect(ciphertext, signal) {
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const input = Buffer.from(ciphertext.toString('base64'), 'ascii');
  let output;
  try {
    output = await systemSecret(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', dpapiScript],
      { signal, input, errorCode: 'SOURCE_DPAPI_USER_OR_MACHINE_IDENTITY_REQUIRED' });
    return decodeBase64(output.toString('ascii'), 'SOURCE_DPAPI_RESULT_INVALID');
  } finally { input.fill(0); output?.fill(0); }
}

export function sourceDecryptionCapabilities() {
  return { chromeLegacy: ['darwin', 'win32'].includes(process.platform), atlasLegacy: process.platform === 'darwin',
    atlasProtectedAccessGroup: false, windowsAppBound: false, windowsAppBoundRequiresOriginalIdentity: true,
    rowFailuresReported: true };
}

// Exact source identities and formats come from profile-decryption/native-evidence.md
// and Chromium 152 OSCrypt. The OS decides access; no source key is created.
export class SelectedProfileDecryption {
  #permit; #key; #keyTask; #keyFailure; #closed = false;
  constructor(permit) { this.#permit = permit; }
  #assert() {
    if (this.#closed) throw importFailure('SOURCE_DECRYPTION_CLOSED');
    assertImportSignal(this.#permit.signal); assertSourceIdentitiesSync(this.#permit.identities);
    if (Date.now() >= this.#permit.expiresAt) throw importFailure('SOURCE_SELECTION_EXPIRED');
  }
  async #sourceKey() {
    this.#assert();
    if (this.#keyFailure) throw this.#keyFailure;
    this.#keyTask ??= this.#loadKey().catch(error => { this.#keyFailure = error; throw error; });
    const key = await this.#keyTask; this.#assert(); return key;
  }
  async #loadKey() {
    if (process.platform === 'darwin') {
      const identities = this.#permit.profile.source === 'chrome' ? [['Chrome Safe Storage', 'Chrome']]
        : this.#permit.profile.source === 'atlas' ? [['ChatGPT Safe Storage', 'ChatGPT'], ['Aura Safe Storage', 'Aura']] : [];
      if (!identities.length) throw importFailure('SOURCE_BROWSER_UNSUPPORTED');
      let last;
      for (const [service, account] of identities) {
        this.#assert(); let password;
        try {
          password = await systemSecret('/usr/bin/security', ['find-generic-password', '-w', '-s', service, '-a', account],
            { signal: this.#permit.signal, errorCode: 'SOURCE_KEYCHAIN_ACCESS_DENIED' });
          if (password.at(-1) === 10) password = password.subarray(0, password.length - 1);
          if (!password.length || password.length > 65536) throw importFailure('SOURCE_KEYCHAIN_DATA_UNAVAILABLE');
          this.#assert(); this.#key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1'); return this.#key;
        } catch (error) {
          last = error;
          if (error.code !== 'SOURCE_KEYCHAIN_ITEM_NOT_FOUND') throw error;
        } finally { password?.fill(0); }
      }
      throw this.#permit.profile.source === 'atlas' ? importFailure('SOURCE_ATLAS_PROTECTED_KEYCHAIN_ENTITLEMENT_REQUIRED') : last;
    }
    if (process.platform === 'win32' && this.#permit.profile.source === 'chrome') {
      const identity = this.#permit.identities.find(item => item.path === join(this.#permit.profile.rootPath, 'Local State'));
      const state = await readSourceJson(identity, { signal: this.#permit.signal });
      let wrapped;
      try {
        wrapped = decodeBase64(state.value?.os_crypt?.encrypted_key, 'SOURCE_DPAPI_KEY_INVALID');
        if (wrapped.length < 6 || wrapped.subarray(0, 5).toString('ascii') !== 'DPAPI') throw importFailure('SOURCE_DPAPI_KEY_INVALID');
        this.#key = await unprotect(wrapped.subarray(5), this.#permit.signal);
        if (this.#key.length !== 32) { this.#key.fill(0); this.#key = undefined; throw importFailure('SOURCE_DPAPI_KEY_LENGTH_INVALID'); }
        this.#assert(); return this.#key;
      } finally { wrapped?.fill(0); if (state.value?.os_crypt) state.value.os_crypt.encrypted_key = ''; }
    }
    throw importFailure('SOURCE_DECRYPTION_PLATFORM_UNSUPPORTED');
  }
  async decrypt(value) {
    this.#assert();
    if (!(value instanceof Uint8Array) || !value.length || value.length > 1048576) throw importFailure('SOURCE_CIPHERTEXT_INVALID');
    const ciphertext = Buffer.from(value);
    let plaintext;
    try {
      const version = ciphertext.subarray(0, 3).toString('ascii');
      if (version === 'v20') throw importFailure('SOURCE_APP_BOUND_ORIGINAL_BROWSER_IDENTITY_REQUIRED');
      if (version !== 'v10') {
        if (process.platform === 'win32' && ciphertext[0] !== 0x76) plaintext = await unprotect(ciphertext, this.#permit.signal);
        else throw importFailure('SOURCE_CIPHERTEXT_VERSION_UNSUPPORTED');
      } else {
        const key = await this.#sourceKey(), payload = ciphertext.subarray(3);
        if (process.platform === 'darwin') {
          if (!payload.length || payload.length % 16) throw importFailure('SOURCE_CIPHERTEXT_INVALID');
          try { plaintext = decryptCipher('aes-128-cbc', key, macIv, payload); }
          catch {
            try { plaintext = decryptCipher('aes-128-cbc', macEmptyFallback, macIv, payload); }
            catch { throw importFailure('SOURCE_DECRYPTION_FAILED'); }
          }
        } else if (process.platform === 'win32') {
          if (payload.length < 28) throw importFailure('SOURCE_CIPHERTEXT_INVALID');
          try {
            plaintext = decryptCipher('aes-256-gcm', key, payload.subarray(0, 12), payload.subarray(12, -16), payload.subarray(-16));
          } catch { throw importFailure('SOURCE_DECRYPTION_FAILED'); }
        } else throw importFailure('SOURCE_DECRYPTION_PLATFORM_UNSUPPORTED');
      }
      this.#assert(); return plaintext;
    } catch (error) { plaintext?.fill(0); throw error; }
    finally { ciphertext.fill(0); }
  }
  dispose() { this.#closed = true; this.#key?.fill(0); this.#key = undefined; this.#keyTask = undefined; }
}
