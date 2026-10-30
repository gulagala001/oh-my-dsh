import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const MAX_TEXT = 8 * 1024 * 1024;
function result(data, lines, headings) {
  const text = lines.join('\n'), outline = headings.join('\n');
  if (Buffer.byteLength(text) > MAX_TEXT || Buffer.byteLength(JSON.stringify(data)) > MAX_TEXT) throw Error('文档提取结果超过 8 MiB；请拆分文档后读取');
  return { data, text, outline };
}
function budget(value, state) {
  state.bytes += Buffer.byteLength(JSON.stringify(value));
  if (state.bytes > MAX_TEXT) throw Error('文档提取结果超过 8 MiB；请拆分文档后读取');
  return value;
}
function decodeText(bytes) {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

async function table(bytes, format) {
  const { parse } = await import('csv-parse/sync');
  const state = { bytes: 0 };
  const rows = parse(decodeText(bytes), { delimiter: format === 'tsv' ? '\t' : ',', bom: true,
    relax_column_count: true, max_record_size: 1024 * 1024, on_record: row => budget(row, state) });
  const coverage = 'Parsed string cells, including the first row; row numbers are logical records. No inferred headers or numeric/date conversion.';
  return result({ format, representation: 'extracted', coverage, warnings: [], rows },
    [`# ${format.toUpperCase()} (${rows.length} rows)`, ...rows.map((row, i) => `[row ${i + 1}] ${JSON.stringify(row)}`)], [`# ${format.toUpperCase()} (${rows.length} rows)`]);
}

async function docx(bytes) {
  const { default: mammoth } = await import('mammoth');
  const { parseDocument } = await import('htmlparser2');
  let images = 0;
  const converted = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }, {
    externalFileAccess: false, convertImage: mammoth.images.imgElement(() => { images++; return { src: '', alt: '[image omitted]' }; }),
  });
  const root = parseDocument(converted.value), blocks = [], lines = [], headings = [], state = { bytes: 0 };
  let paragraph = 0, tables = 0;
  const content = node => node.type === 'text' ? node.data : node.name === 'br' ? '\n' : node.name === 'img' ? '[image omitted]' : (node.children ?? []).map(content).join('') + (node.name === 'p' ? '\n' : '');
  const rowsOf = node => node.name === 'tr' ? [node] : (node.children ?? []).flatMap(rowsOf);
  const visit = node => {
    if (node.name === 'table') {
      const number = ++tables, rows = rowsOf(node).map(row => row.children.filter(c => ['td', 'th'].includes(c.name)).map(c => content(c).trim()));
      blocks.push(budget({ kind: 'table', table: number, rows }, state));
      headings.push(`## Table ${number} (${rows.length} rows)`); lines.push(headings.at(-1), ...rows.map((row, i) => `[table ${number}, row ${i + 1}] ${JSON.stringify(row)}`));
    } else if (/^(?:p|h[1-6])$/.test(node.name ?? '')) {
      const text = content(node).trimEnd(), number = ++paragraph, heading = node.name !== 'p';
      blocks.push(budget({ kind: heading ? 'heading' : 'paragraph', paragraph: number, ...(heading ? { level: Number(node.name[1]) } : {}), text }, state));
      const line = `${heading ? '#'.repeat(Number(node.name[1])) + ' ' : ''}[paragraph ${number}] ${text}`;
      lines.push(line); if (heading) headings.push(line);
    } else for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  const warnings = converted.messages.map(m => m.message);
  if (images) warnings.push(`${images} image(s) omitted; no OCR performed.`);
  return result({ format: 'docx', representation: 'extracted', coverage: 'Document paragraphs and tables; original layout, embedded objects and images are not represented.', warnings, blocks }, lines, headings);
}

async function pdf(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const base = dirname(require.resolve('pdfjs-dist/package.json'));
  const task = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, useSystemFonts: false,
    disableFontFace: true, verbosity: 0, cMapUrl: join(base, 'cmaps') + '/', cMapPacked: true,
    standardFontDataUrl: join(base, 'standard_fonts') + '/', wasmUrl: join(base, 'wasm') + '/' });
  try {
    const document = await task.promise, pages = [], lines = [], headings = [], warnings = [], state = { bytes: 0 };
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber), layer = await page.getTextContent();
      let text = '', y;
      for (const item of layer.items) {
        if (typeof item.str !== 'string') continue;
        const nextY = item.transform?.[5];
        if (text && !text.endsWith('\n')) text += y !== undefined && nextY !== y ? '\n' : ' ';
        text += item.str; if (item.hasEOL) text += '\n'; y = nextY;
      }
      text = text.trim();
      pages.push(budget({ page: pageNumber, text }, state));
      headings.push(`## Page ${pageNumber}`); lines.push(headings.at(-1), text || '[No extractable text; this page may require OCR.]');
      if (!text) warnings.push(`Page ${pageNumber} has no extractable text; no OCR performed.`);
      page.cleanup();
    }
    return result({ format: 'pdf', representation: 'extracted', coverage: 'PDF text layer by page; reading order is approximate. Images, layout and OCR are not included.', warnings, pages }, lines, headings);
  } finally { await task.destroy(); }
}

async function xlsx(bytes) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(bytes));
  const sheets = [], lines = [], headings = [], state = { bytes: 0 };
  for (const sheet of workbook.worksheets) {
    const rows = [];
    sheet.eachRow(row => {
      const cells = {};
      row.eachCell(cell => {
        let value = cell.value;
        if (cell.isMerged && cell.master.address !== cell.address) value = { mergedInto: cell.master.address };
        else if (value instanceof Date) value = value.toISOString();
        else if (value?.richText) value = value.richText.map(run => run.text).join('');
        else if (value?.formula || value?.sharedFormula) value = { formula: cell.formula, ...(cell.result !== undefined ? { cachedResult: cell.result instanceof Date ? cell.result.toISOString() : cell.result } : {}) };
        cells[cell.address] = value;
      });
      rows.push(budget({ row: row.number, cells }, state));
    });
    sheets.push({ name: sheet.name, state: sheet.state, rows });
    headings.push(`## Sheet ${JSON.stringify(sheet.name)} (${rows.length} nonempty rows, ${sheet.state})`);
    lines.push(headings.at(-1), ...rows.map(row => `[row ${row.row}] ${JSON.stringify(row.cells)}`));
  }
  return result({ format: 'xlsx', representation: 'extracted', coverage: 'Nonempty cells with sheet and cell addresses. Formula values are cached values, never recalculated; formatting, charts and images are omitted.', warnings: [], sheets }, lines, headings);
}

export async function parseDocumentBytes({ bytes, format }) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 32 * 1024 * 1024) throw Error('无效或过大的文档输入');
  if (format === 'csv' || format === 'tsv') return table(bytes, format);
  if (format === 'docx') return docx(bytes);
  if (format === 'pdf') return pdf(bytes);
  if (format === 'xlsx') return xlsx(bytes);
  throw Error('不支持的文档格式');
}
