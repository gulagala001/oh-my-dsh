import { parseDocument, DomUtils } from 'htmlparser2';

const configuration = {
  values: ['text', 'search', 'url', 'tel', 'email', 'number', 'date', 'datetime-local', 'month', 'time', 'week', 'color', 'range'],
  excluded: ['password', 'file', 'hidden', 'button', 'submit', 'reset', 'image'],
  secrets: ['current-password', 'new-password', 'one-time-code'],
};
const changed = () => new Error('Page form controls changed or could not be matched while exporting. Try again when the page is stable.');

// Read properties only. Never reflect them into the live DOM: attribute writes
// can trigger application observers even when input/change events are omitted.
function captureForms(config) {
  const result = [], known = [...config.values, ...config.excluded, 'checkbox', 'radio'];
  const visit = root => {
    for (const el of root.children ?? []) {
      const tag = el.localName, html = el.namespaceURI === 'http://www.w3.org/1999/xhtml', attributes = ['id', 'name', 'type'].map(name => el.getAttribute(name) ?? '');
      const raw = (el.getAttribute('type') || 'text').toLowerCase(), type = known.includes(raw) ? raw : 'text';
      const secret = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).some(token => config.secrets.includes(token));
      if (html && !secret && (tag === 'textarea' || tag === 'select' || tag === 'input' && !config.excluded.includes(type))) {
        const entry = { tag, attributes };
        if (tag === 'select') entry.selected = [...el.options].map(option => option.selected);
        else if (tag === 'input' && ['checkbox', 'radio'].includes(type)) entry.checked = el.checked;
        else entry.value = el.value;
        result.push(entry);
      }
      if (el.shadowRoot) visit(el.shadowRoot);
      visit(html && tag === 'template' ? el.content : el);
    }
  };
  visit(document); return { controls: result, charset: document.characterSet };
}

export async function readExportForms(bindings) {
  return Promise.all(bindings.map(async ({ frame, frameId }) => ({ frameId, ...await frame.evaluate(captureForms, configuration) })));
}

function patchHtml(html, controls) {
  const document = parseDocument(html), nodes = [], metas = [], known = [...configuration.values, ...configuration.excluded, 'checkbox', 'radio'];
  const visit = (root, readable = true, htmlNamespace = true) => {
    for (const node of root.children ?? []) {
      const tag = node.name, attrs = node.attribs ?? {}, isHtml = htmlNamespace && !['svg', 'math'].includes(tag);
      const raw = (attrs.type || 'text').toLowerCase(), type = known.includes(raw) ? raw : 'text';
      const secret = (attrs.autocomplete || '').toLowerCase().split(/\s+/).some(token => configuration.secrets.includes(token));
      if (isHtml && tag === 'input' && (['password', 'file', 'hidden'].includes(type) || secret)) delete attrs.value;
      if (isHtml && tag === 'textarea' && secret) node.children = [];
      if (isHtml && readable && !secret && (tag === 'textarea' || tag === 'select' || tag === 'input' && !configuration.excluded.includes(type))) nodes.push(node);
      // Browser raw-text fallback is not a subtree of live form controls.
      if (isHtml && ['iframe', 'noembed', 'noframes', 'plaintext'].includes(tag)) continue;
      if (isHtml && tag === 'meta') metas.push(node);
      const childrenHtml = isHtml || tag === 'foreignobject' || ['mi', 'mo', 'mn', 'ms', 'mtext'].includes(tag) || tag === 'annotation-xml' && ['text/html', 'application/xhtml+xml'].includes(attrs.encoding?.toLowerCase());
      visit(node, readable && !(tag === 'template' && attrs.shadowmode === 'closed'), childrenHtml);
    }
  };
  visit(document);
  for (const meta of metas) {
    if (meta.attribs.charset !== undefined) meta.attribs.charset = 'utf-8';
    if (meta.attribs['http-equiv']?.toLowerCase() === 'content-type') meta.attribs.content = 'text/html; charset=utf-8';
  }
  if (nodes.length !== controls.length) throw changed();
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index], control = controls[index];
    if (node.name !== control.tag || JSON.stringify(['id', 'name', 'type'].map(name => node.attribs[name] ?? '')) !== JSON.stringify(control.attributes)) throw changed();
    if (control.checked !== undefined) {
      if (control.checked) node.attribs.checked = ''; else delete node.attribs.checked;
    } else if (control.selected) {
      const options = DomUtils.findAll(node => node.name === 'option', node.children);
      if (options.length !== control.selected.length) throw changed();
      for (let index = 0; index < options.length; index++) {
        if (control.selected[index]) options[index].attribs.selected = ''; else delete options[index].attribs.selected;
      }
      // A single select with selectedIndex=-1 otherwise defaults to its first
      // option on reopen. An inert empty option preserves its blank appearance.
      if (!control.selected.some(Boolean) && node.attribs.multiple === undefined) node.children.push(parseDocument('<option hidden selected></option>').children[0]);
    } else if (node.name === 'textarea') {
      const value = control.value.startsWith('\n') ? '\n' + control.value : control.value;
      node.children = [{ type: 'text', data: value, parent: node, prev: null, next: null }];
    } else node.attribs.value = control.value;
  }
  return DomUtils.getOuterHTML(document, { encodeEntities: 'utf8' });
}

export function preserveExportForms(data, forms) {
  const boundary = data.slice(0, data.indexOf('\r\n\r\n')).match(/boundary="([^"]+)"/i)?.[1];
  if (!boundary) throw new Error('The browser returned an unsupported MHTML boundary.');
  const byFrame = new Map(forms.map(value => [value.frameId, value])), patched = new Set();
  const result = data.split('--' + boundary).map(part => {
    const separator = part.indexOf('\r\n\r\n');
    if (separator < 0) return part;
    let headers = part.slice(0, separator);
    if (!/Content-Type:\s*text\/html(?:\s|;|$)/i.test(headers)) return part;
    const frameId = headers.match(/Content-ID:\s*<frame-([^@>]+)@mhtml\.blink>/i)?.[1];
    const state = byFrame.get(frameId);
    if (!state) throw new Error('A snapshot frame could not be matched to its current form state.');
    const body = part.slice(separator + 4).replace(/\r\n$/, ''), encoding = headers.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1].trim().toLowerCase();
    let html;
    if (encoding === 'quoted-printable') html = Buffer.from(body.replace(/=\r\n/g, '').replace(/=([a-f\d]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
    else if (encoding === 'base64') html = Buffer.from(body, 'base64');
    else throw new Error('The browser returned an unsupported MHTML HTML encoding.');
    html = new TextDecoder(state.charset).decode(html);
    const encoded = Buffer.from(patchHtml(html, state.controls), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
    headers = headers.replace(/Content-Type:\s*text\/html(?:;[^\r\n]*)?/i, 'Content-Type: text/html; charset=utf-8');
    headers = headers.replace(/Content-Transfer-Encoding:[^\r\n]+/i, 'Content-Transfer-Encoding: base64');
    patched.add(frameId);
    return headers + '\r\n\r\n' + encoded + '\r\n';
  }).join('--' + boundary);
  if (forms.some(value => value.controls.length && !patched.has(value.frameId))) throw new Error('A page frame with form values was omitted by the browser snapshot.');
  return result;
}
