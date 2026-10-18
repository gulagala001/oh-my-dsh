// Persist the actual manager response before any receipt or hot-state assertion.
// Presence in this array is not validation; the original contract still decides.
export async function persistReceipt(report, value, save) {
  report.phase = value.operation + ':receipt-returned';
  report.targetStage = value.coldStage;
  value.validated = false;
  report.receipts.push(value);
  await save();
  return value;
}
