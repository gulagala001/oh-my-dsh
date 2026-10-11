import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { setImmediate as yieldRead } from 'node:timers/promises';
import { importFailure, sourceHash, withSourceDatabase, sourceTable, sourceRecordCount, assertImportSignal, assertSourceIdentitiesSync } from './import-source.mjs';

const windowsEpoch = 11644473600000000n;
const utf8 = new TextDecoder('utf-8', { fatal: true });
export const importCategory = (status = 'not-requested') => ({ status, discovered: 0, canonicalized: 0, imported: 0,
  skippedExisting: 0, skippedInvalid: 0, failed: 0, remaining: 0 });
const integer = value => typeof value === 'bigint' ? Number(value) : value;
const time = value => typeof value === 'bigint' && value > 0n ? Number(value - windowsEpoch) / 1000 : NaN;
const source = (permit, name) => permit.identities.find(identity => identity.path === join(permit.profile.profilePath, name));
const assertCurrent = permit => {
  assertImportSignal(permit.signal); assertSourceIdentitiesSync(permit.identities);
  if (Date.now() >= permit.expiresAt) throw importFailure('SOURCE_SELECTION_EXPIRED');
};
const version = database => {
  sourceTable(database, 'meta', ['key', 'value']);
  const value = Number(database.prepare("SELECT value FROM meta WHERE key='version'").get()?.value);
  if (!Number.isSafeInteger(value)) throw importFailure('SOURCE_SCHEMA_UNSUPPORTED');
  return value;
};
function domainAllowed(host, allowlist) {
  return !allowlist.length || allowlist.includes(host);
}
function rowFailure(category, error) {
  if (error?.code === 'ABORTED' || error?.code === 'SOURCE_CHANGED' || error?.code === 'SOURCE_SELECTION_EXPIRED') throw error;
  category.failed++; category.error = typeof error?.code === 'string' && /^SOURCE_[A-Z0-9_]+$/u.test(error.code) ? error.code : 'SOURCE_RECORD_INVALID';
}

export async function readProfileCookies(permit, decryptor, category, directory) {
  const identity = source(permit, 'Network/Cookies')?.exists ? source(permit, 'Network/Cookies') : source(permit, 'Cookies');
  if (!identity?.exists) { category.status = 'missing'; category.error = 'SOURCE_COOKIE_DATABASE_MISSING'; return []; }
  category.status = 'reading'; const records = [];
  try {
    await withSourceDatabase(identity, { directory, identities: permit.identities, signal: permit.signal }, async database => {
      const schema = version(database);
      if (![23, 24].includes(schema)) throw importFailure('SOURCE_COOKIE_SCHEMA_UNSUPPORTED');
      sourceTable(database, 'cookies', ['host_key', 'top_frame_site_key', 'name', 'value', 'path', 'expires_utc',
        'is_secure', 'is_httponly', 'has_expires', 'encrypted_value', 'samesite', 'source_scheme', 'source_port', 'has_cross_site_ancestor']);
      sourceRecordCount(database, 'cookies', 250000);
      const query = database.prepare('SELECT host_key,top_frame_site_key,name,value,path,expires_utc,is_secure,is_httponly,has_expires,encrypted_value,samesite,source_scheme,source_port,has_cross_site_ancestor FROM cookies ORDER BY rowid');
      query.setReadBigInts(true); let index = 0;
      for (const row of query.iterate()) {
        if (++index % 128 === 0) await yieldRead();
        assertCurrent(permit);
        const host = typeof row.host_key === 'string' ? row.host_key.replace(/^\./u, '').toLowerCase() : '';
        if (!domainAllowed(host, permit.options.cookieDomainAllowlist)) continue;
        category.discovered++; let plaintext;
        try {
          if (!host || host.length > 253 || /[\s/\\@\x00-\x1f]/u.test(host) || new URL('https://' + host + '/').hostname !== host
            || typeof row.name !== 'string' || typeof row.path !== 'string' || !row.path.startsWith('/') || /[\x00-\x1f\x7f]/u.test(row.name + row.path)
            || typeof row.value !== 'string' || ![-1, 0, 1, 2, 3].includes(integer(row.samesite))
            || ![0, 1].includes(integer(row.is_secure)) || ![0, 1].includes(integer(row.is_httponly))
            || ![0, 1].includes(integer(row.has_expires)) || ![0, 1, 2].includes(integer(row.source_scheme))
            || !Number.isSafeInteger(integer(row.source_port)) || integer(row.source_port) < -1 || integer(row.source_port) > 65535) {
            category.skippedInvalid++; continue;
          }
          // Stock Electron cannot express CHIPS partition identities. Importing
          // those as unpartitioned cookies would change their security scope.
          if (row.top_frame_site_key !== '') throw importFailure('SOURCE_COOKIE_PARTITION_UNSUPPORTED');
          const expiry = integer(row.has_expires) ? time(row.expires_utc) / 1000 : undefined;
          if (expiry !== undefined && (!Number.isFinite(expiry) || expiry <= Date.now() / 1000)) { category.skippedInvalid++; continue; }
          let value = row.value;
          if (!(row.encrypted_value instanceof Uint8Array)) throw importFailure('SOURCE_COOKIE_CIPHERTEXT_INVALID');
          if (row.encrypted_value.length) {
            if (value) throw importFailure('SOURCE_COOKIE_BOTH_PLAINTEXT_AND_CIPHERTEXT');
            plaintext = await decryptor.decrypt(row.encrypted_value);
            let content = plaintext;
            if (schema === 24) {
              const expected = Buffer.from(sourceHash(row.host_key), 'hex');
              if (content.length < 32 || !timingSafeEqual(content.subarray(0, 32), expected)) throw importFailure('SOURCE_COOKIE_HOST_BINDING_MISMATCH');
              content = content.subarray(32);
            }
            try { value = utf8.decode(content); } catch { throw importFailure('SOURCE_COOKIE_ENCODING_INVALID'); }
          }
          if (Buffer.byteLength(row.name + value, 'utf8') > 4096 || /[\x00-\x1f\x7f]/u.test(value)) { category.skippedInvalid++; continue; }
          const secure = integer(row.is_secure) === 1, hostOnly = !row.host_key.startsWith('.');
          const scheme = secure || integer(row.source_scheme) === 2 ? 'https' : 'http';
          const port = integer(row.source_port), portPart = port > 0 && !((scheme === 'https' && port === 443) || (scheme === 'http' && port === 80)) ? ':' + port : '';
          records.push({ url: `${scheme}://${host}${portPart}/`, name: row.name, value, path: row.path,
            ...(hostOnly ? {} : { domain: row.host_key }), secure, httpOnly: integer(row.is_httponly) === 1,
            sameSite: ({ '-1': 'unspecified', 0: 'no_restriction', 1: 'lax', 2: 'strict', 3: 'unspecified' })[integer(row.samesite)],
            ...(expiry === undefined ? {} : { expirationDate: expiry }), key: JSON.stringify([row.host_key, row.path, row.name]) });
          category.canonicalized++;
        } catch (error) { rowFailure(category, error); }
        finally { plaintext?.fill(0); row.value = ''; row.encrypted_value?.fill?.(0); }
      }
    });
    return records;
  } catch (error) {
    for (const record of records) record.value = '';
    category.remaining = Math.max(0, category.discovered - category.failed - category.skippedInvalid);
    throw error;
  }
}

export async function readProfilePasswords(permit, decryptor, name, category, directory) {
  const identity = source(permit, name);
  if (!identity?.exists) { category.status = 'missing'; return []; }
  category.status = 'reading'; const records = [];
  try {
    await withSourceDatabase(identity, { directory, identities: permit.identities, signal: permit.signal }, async database => {
      const schema = version(database);
      if (schema < 39 || schema > 43) throw importFailure('SOURCE_PASSWORD_SCHEMA_UNSUPPORTED');
      sourceTable(database, 'logins', ['origin_url', 'username_value', 'password_value', 'blacklisted_by_user', 'scheme', 'federation_url']);
      category.discovered = sourceRecordCount(database, 'logins', 250000);
      const query = database.prepare('SELECT origin_url,username_value,password_value,blacklisted_by_user,scheme,federation_url FROM logins ORDER BY rowid');
      query.setReadBigInts(true); let index = 0;
      for (const row of query.iterate()) {
        if (++index % 128 === 0) await yieldRead();
        assertCurrent(permit); let plaintext;
        try {
          let address;
          try { address = new URL(row.origin_url); } catch { category.skippedInvalid++; continue; }
          if (!['http:', 'https:'].includes(address.protocol) || address.username || address.password || integer(row.scheme) !== 0
            || integer(row.blacklisted_by_user) !== 0 || row.federation_url && row.federation_url !== 'null'
            || typeof row.username_value !== 'string' || row.username_value.length > 1000
            || !(row.password_value instanceof Uint8Array) || !row.password_value.length) { category.skippedInvalid++; continue; }
          plaintext = await decryptor.decrypt(row.password_value);
          let password;
          try { password = utf8.decode(plaintext); } catch { throw importFailure('SOURCE_PASSWORD_ENCODING_INVALID'); }
          if (!password || password.length > 1000 || /\x00/u.test(password + row.username_value)) { category.skippedInvalid++; continue; }
          records.push({ origin: address.origin, username: row.username_value, password }); category.canonicalized++;
        } catch (error) { rowFailure(category, error); }
        finally { plaintext?.fill(0); row.password_value?.fill?.(0); row.username_value = ''; }
      }
    });
    return records;
  } catch (error) {
    for (const record of records) { record.username = ''; record.password = ''; }
    category.remaining = Math.max(0, category.discovered - category.failed - category.skippedInvalid);
    throw error;
  }
}

export async function readProfileHistory(permit, category, directory) {
  const identity = source(permit, 'History');
  if (!identity?.exists) { category.status = 'missing'; category.error = 'SOURCE_HISTORY_DATABASE_MISSING'; return []; }
  category.status = 'reading'; const records = [];
  try {
    await withSourceDatabase(identity, { directory, identities: permit.identities, signal: permit.signal }, async database => {
      sourceTable(database, 'urls', ['id', 'url', 'title', 'hidden']);
      const columns = sourceTable(database, 'visits', ['id', 'url', 'visit_time']);
      category.discovered = sourceRecordCount(database, 'visits', 500000);
      const fields = Object.entries({ from_visit: 'referringVisitId', opener_visit: 'openerVisitId', transition: 'transition', visit_duration: 'visitDuration', incremented_omnibox_typed_score: 'incrementedOmniboxTypedScore' }).filter(([column]) => columns.has(column));
      const sourceTableExists = database.prepare("SELECT type FROM sqlite_schema WHERE name='visit_source'").get();
      if (sourceTableExists) sourceTable(database, 'visit_source', ['id', 'source']);
      const query = database.prepare('SELECT v.id AS sourceVisitId,v.url AS sourceUrlId,v.visit_time,u.url,u.title,u.hidden'
        + fields.map(([column, field]) => `,v.${column} AS ${field}`).join('') + (sourceTableExists ? ',COALESCE(s.source,1) AS visitSource' : '')
        + ' FROM visits v LEFT JOIN urls u ON u.id=v.url' + (sourceTableExists ? ' LEFT JOIN visit_source s ON s.id=v.id' : '') + ' ORDER BY v.id');
      query.setReadBigInts(true); let index = 0; const seen = new Set();
      for (const row of query.iterate()) {
        if (++index % 256 === 0) await yieldRead();
        assertCurrent(permit);
        if (typeof row.sourceVisitId !== 'bigint' || typeof row.sourceUrlId !== 'bigint' || seen.has(String(row.sourceVisitId))) throw importFailure('SOURCE_HISTORY_RECORD_INVALID');
        seen.add(String(row.sourceVisitId));
        let address;
        try { address = new URL(row.url); } catch { category.skippedInvalid++; continue; }
        const visitedAt = time(row.visit_time);
        if (row.sourceVisitId <= 0n || row.sourceUrlId <= 0n || !Number.isFinite(visitedAt) || Math.abs(visitedAt) > 8640000000000000
          || typeof row.title !== 'string' || row.title.length > 1048576 || address.href.length > 65536 || ![0n, 1n].includes(row.hidden)) {
          category.skippedInvalid++; continue;
        }
        const record = { sourceVisitId: String(row.sourceVisitId), sourceUrlId: String(row.sourceUrlId), url: address.href,
          title: row.title, visitedAt, hidden: row.hidden === 1n };
        for (const [, field] of fields) {
          if (row[field] === null) continue;
          if (typeof row[field] !== 'bigint') throw importFailure('SOURCE_HISTORY_RECORD_INVALID');
          if (field === 'referringVisitId' || field === 'openerVisitId') record[field] = String(row[field]);
          else if (field === 'incrementedOmniboxTypedScore') {
            if (![0n, 1n].includes(row[field])) throw importFailure('SOURCE_HISTORY_RECORD_INVALID');
            record[field] = row[field] === 1n;
          } else {
            if (field === 'visitDuration' && row[field] < 0n || field === 'transition' && (row[field] < -2147483648n || row[field] > 4294967295n)) throw importFailure('SOURCE_HISTORY_RECORD_INVALID');
            record[field] = field === 'visitDuration' ? Number(row[field]) / 1000 : Number(row[field]);
          }
        }
        if (sourceTableExists) {
          if (typeof row.visitSource !== 'bigint' || row.visitSource < 0n || row.visitSource > 7n) throw importFailure('SOURCE_HISTORY_RECORD_INVALID');
          record.visitSource = Number(row.visitSource);
        }
        records.push(record); category.canonicalized++;
      }
      if (seen.size !== category.discovered) throw importFailure('SOURCE_HISTORY_RECORD_INVALID');
    });
    return records;
  } catch (error) { records.length = 0; category.remaining = Math.max(0, category.discovered - category.failed - category.skippedInvalid); throw error; }
}
