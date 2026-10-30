import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import { decodeDocument } from '../src/result-reduction/documents.mjs';
import { registerContextViews } from '../src/result-reduction/views.mjs';
const require = createRequire(import.meta.url), JSZip = createRequire(require.resolve('mammoth/package.json'))('jszip');

function pdf() {
  const stream = 'BT /F1 12 Tf 40 180 Td (Invoice total 120) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> >>'];
  let body = '%PDF-1.7\n', offsets = [0];
  objects.forEach((value, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  return Buffer.from(body + `xref\n0 ${offsets.length}\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

test('document parsers preserve cells, paragraph/table positions and PDF page coverage', async () => {
  const csv = await decodeDocument(Buffer.from('id,note\r\n001,"first, second\n第三行"\r\n'), 'csv');
  assert.deepEqual(csv.data.rows[1], ['001', 'first, second\n第三行']);
  const tsv = await decodeDocument(Buffer.concat([Buffer.from([255, 254]), Buffer.from('编号\t金额\n001\t20\n', 'utf16le')]), 'tsv');
  assert.deepEqual(tsv.data.rows[1], ['001', '20']);
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>发票正文</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>金额</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>120</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  const word = await decodeDocument(await zip.generateAsync({ type: 'nodebuffer' }), 'docx');
  assert.equal(word.data.blocks[0].text, '发票正文'); assert.deepEqual(word.data.blocks[1].rows, [['金额', '120']]);
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('费用');
  sheet.addRow(['编号', '金额']); sheet.addRow(['001', 120]); sheet.getCell('B3').value = { formula: 'B2*2', result: 240 };
  const excel = await decodeDocument(await workbook.xlsx.writeBuffer(), 'xlsx');
  assert.equal(excel.data.sheets[0].rows[1].cells.A2, '001');
  assert.deepEqual(excel.data.sheets[0].rows[2].cells.B3, { formula: 'B2*2', cachedResult: 240 });
  const document = await decodeDocument(pdf(), 'pdf');
  assert.match(document.data.pages[0].text, /Invoice total 120/); assert.equal(document.data.pages[1].page, 2);
  assert.match(document.data.warnings.join(' '), /Page 2.*no extractable text/);
});

test('context_view uses the scoped byte provider, preserves extraction boundaries and never retries denied reads', async () => {
  let reads = 0, denied = false, changed = false, stats = 0, archived;
  const bytes = Buffer.from('name,value\ninvoice,001\n'), definitions = [];
  const fs = { async resolve(path, options) { assert.equal(options.cwd, '/approved'); return { targetKey: path }; },
    async stat() { return { type: 'file', size: bytes.length, version: changed ? ++stats : 1 }; },
    async readBytes(_target, signal, max) { reads++; signal.throwIfAborted(); assert.equal(max, 32 * 1024 * 1024); if (denied) throw Error('provider denied'); return bytes; }, processPath: () => '/approved/a.csv' };
  const ctx = { tools: { get: () => ({}), register: tool => definitions.push(tool) }, get: name => name === 'fs' ? fs : { ensure: async () => '/approved' } };
  const hub = { optimization: { enabled: () => true, limit: (_s, n) => n ?? 48000,
    archive: async (_exec, text, _rule, complete) => { archived = { text, complete }; return { ref: 'omd-raw:fixture', sourceHash: 'hash', complete }; }, finish: async (_exec, value) => value } };
  registerContextViews(ctx, hub);
  const call = args => definitions[0].execute(args, { agent: { session: {} }, signal: new AbortController().signal });
  const value = JSON.parse(await call({ file: 'a.csv', view: 'article' }));
  assert.match(value.text, /row 2.*invoice.*001/); assert.equal(value.document.format, 'csv'); assert.equal(value.rawComplete, false);
  assert.equal(archived.complete, false); assert.deepEqual(JSON.parse(archived.text).rows[1], ['invoice', '001']);
  denied = true; await assert.rejects(call({ file: 'a.csv', view: 'data' }), /provider denied/); assert.equal(reads, 2);
  denied = false; changed = true; await assert.rejects(call({ file: 'a.csv', view: 'data' }), /读取期间变化/);
});

test('invalid and cancelled document requests fail without returning a fabricated empty document', async () => {
  await assert.rejects(decodeDocument(Buffer.from('not a pdf'), 'pdf'));
  await assert.rejects(decodeDocument(Buffer.from('broken zip'), 'docx'));
  const cancel = new AbortController(); cancel.abort(Error('cancelled'));
  await assert.rejects(decodeDocument(Buffer.from('a,b'), 'csv', cancel.signal), /cancelled/);
});
