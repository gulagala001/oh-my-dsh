import { parse } from 'csv-parse';
import { importFailure, assertImportSignal, clearImportRecords } from './import-source.mjs';

export const PASSWORD_CSV_MAX_BYTES = 10 * 1024 * 1024;
export const PASSWORD_CSV_MAX_RECORDS = 3000;
const labels = new Map([
  ...['url', 'website', 'origin', 'hostname', 'login_uri'].map(value => [value, 'origin']),
  ...['username', 'user', 'login', 'account', 'login_username'].map(value => [value, 'username']),
  ...['password', 'login_password'].map(value => [value, 'password']),
]);

// The parser owns quoting, escaped delimiters, BOM and embedded newlines.
// Aliases and field limits follow Chromium's password CSV importer.
export async function parsePasswordCsv(bytes, signal) {
  assertImportSignal(signal);
  if (!bytes.length || bytes.length > PASSWORD_CSV_MAX_BYTES) throw importFailure('PASSWORD_FILE_IMPORT_TOO_LARGE');
  try { if (new TextDecoder('utf-8', { fatal: true }).decode(bytes).includes('\0')) throw new Error(); }
  catch { throw importFailure('PASSWORD_FILE_IMPORT_SOURCE_INVALID'); }
  const parser = parse({ bom: true, skip_empty_lines: true, relax_column_count: true, max_record_size: 65536 });
  const records = []; let header, columns, discovered = 0, skippedInvalid = 0;
  const abort = () => parser.destroy(importFailure('ABORTED'));
  signal?.addEventListener('abort', abort, { once: true });
  try {
    parser.end(bytes);
    for await (const row of parser) {
      assertImportSignal(signal);
      if (!header) {
        header = row; columns = new Map();
        if (header.length > 256) throw importFailure('PASSWORD_FILE_IMPORT_SOURCE_INVALID');
        for (let index = 0; index < header.length; index++) {
          const label = labels.get(header[index].trim().toLowerCase());
          if (!label) continue;
          if (columns.has(label)) throw importFailure('PASSWORD_FILE_IMPORT_SOURCE_INVALID');
          columns.set(label, index);
        }
        if (!['origin', 'username', 'password'].every(label => columns.has(label))) throw importFailure('PASSWORD_FILE_IMPORT_SOURCE_INVALID');
        continue;
      }
      if (row.length === 1 && row[0].trim() === '') continue;
      discovered++;
      if (discovered > PASSWORD_CSV_MAX_RECORDS) throw importFailure('PASSWORD_FILE_IMPORT_TOO_LARGE');
      let address;
      const origin = row[columns.get('origin')], username = row[columns.get('username')], password = row[columns.get('password')];
      try { address = new URL(origin); } catch { skippedInvalid++; row.fill(''); continue; }
      if (row.length !== header.length || typeof origin !== 'string' || origin.length > 2048
        || !['http:', 'https:'].includes(address.protocol) || address.username || address.password
        || typeof username !== 'string' || username.length > 1000 || typeof password !== 'string' || !password || password.length > 1000) {
        skippedInvalid++; row.fill(''); continue;
      }
      records.push({ origin: address.origin, username, password }); row.fill('');
    }
    assertImportSignal(signal);
    if (!header || !records.length) throw importFailure('PASSWORD_FILE_IMPORT_SOURCE_INVALID');
    return { records, discovered, skippedInvalid };
  } catch (error) {
    clearImportRecords(records);
    throw ['ABORTED', 'PASSWORD_FILE_IMPORT_SOURCE_INVALID', 'PASSWORD_FILE_IMPORT_TOO_LARGE'].includes(error.code) ? error : importFailure('PASSWORD_FILE_IMPORT_SOURCE_INVALID');
  } finally { header?.fill(''); parser.destroy(); signal?.removeEventListener('abort', abort); }
}
