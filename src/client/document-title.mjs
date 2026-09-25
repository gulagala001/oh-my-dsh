// Transform the fixed product suffix before the host writes the DOM.
// No observer writes it back: the host remains the sole session-title owner.
export function brandDocumentTitle(doc) {
  const own = Object.getOwnPropertyDescriptor(doc, 'title');
  let object = doc, descriptor = own;
  while (!descriptor && (object = Object.getPrototypeOf(object))) descriptor = Object.getOwnPropertyDescriptor(object, 'title');
  if (!descriptor?.get || !descriptor?.set || own?.configurable === false) return () => {};
  let active = true, raw, branded;
  const get = () => descriptor.get.call(doc);
  const set = value => {
    if (!active) { descriptor.set.call(doc, value); return; }
    raw = String(value);
    branded = raw === 'DeepSeek Harness' || raw.endsWith(' — DeepSeek Harness') ? raw.replace(/DeepSeek Harness$/, 'Oh My DSH') : raw;
    if (get() !== branded) descriptor.set.call(doc, branded);
  };
  Object.defineProperty(doc, 'title', { configurable: true, enumerable: descriptor.enumerable, get, set });
  set(get());
  return () => {
    active = false;
    if (Object.getOwnPropertyDescriptor(doc, 'title')?.set !== set) return;
    if (own) Object.defineProperty(doc, 'title', own); else delete doc.title;
    if (descriptor.get.call(doc) === branded && raw !== branded) descriptor.set.call(doc, raw);
  };
}
