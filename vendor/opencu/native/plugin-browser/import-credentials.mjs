import { assertImportSignal, importFailure } from './import-source.mjs';

export function passwordImportAvailable(store) {
  if (typeof store?.createImportReceipt !== 'function' || typeof store?.importCredentials !== 'function') return false;
  const available = typeof store.available === 'function' ? store.available() : store.available;
  const capabilities = typeof store.capabilities === 'function' ? store.capabilities() : store.capabilities;
  return available === true && capabilities?.persistentReady !== false;
}

export async function importCredentialRows(store, records, { sourceId, sourceFingerprint, signal, assertCurrent, onProgress } = {}) {
  const result = { added: 0, updated: 0, unchanged: 0, failed: 0, remaining: records.length, canceled: false, transactionStarted: false };
  for (let index = 0; index < records.length; index++) {
    try { assertImportSignal(signal); await assertCurrent?.(); }
    catch (error) {
      if (error.code === 'ABORTED') { result.canceled = true; break; }
      error.importResult = { ...result }; throw error;
    }
    let receipt;
    try { receipt = store.createImportReceipt({ sourceId, sourceFingerprint }); }
    catch (error) { error.importResult = { ...result }; throw error; }
    let row;
    try {
      row = await store.importCredentials([records[index]], { receipt, signal });
    } catch (error) {
      store.revokeReceipt?.(receipt);
      const outcome = importFailure('PASSWORD_IMPORT_OUTCOME_UNCONFIRMED'); outcome.importResult = { ...result }; throw outcome;
    }
    const keys = ['added', 'updated', 'unchanged', 'failed', 'remaining'];
    if (!row || !keys.every(key => Number.isSafeInteger(row[key]) && row[key] >= 0) || keys.reduce((sum, key) => sum + row[key], 0) !== 1
      || typeof row.canceled !== 'boolean' || typeof row.transactionStarted !== 'boolean'
      || !row.transactionStarted && row.added + row.updated + row.unchanged > 0) {
      const error = importFailure('PASSWORD_IMPORT_OUTCOME_UNCONFIRMED'); error.importResult = { ...result }; throw error;
    }
    for (const key of ['added', 'updated', 'unchanged', 'failed']) result[key] += row[key];
    result.transactionStarted ||= row.transactionStarted;
    result.remaining = records.length - result.added - result.updated - result.unchanged - result.failed;
    result.canceled ||= row.canceled;
    onProgress?.({ ...result });
    records[index].username = ''; records[index].password = '';
    if (row.remaining || row.canceled) break;
  }
  return result;
}
