// Styling hooks yield when another owner changes an attribute. Keep that
// owner's latest value through refresh and disposal for this marker lifetime.
export function createAttributeMarkers(attribute) {
  const owned = new Map(), yielded = new WeakSet();
  const release = (element, record) => {
    if (element.getAttribute(attribute) !== record.value) return;
    if (record.previous === null) element.removeAttribute(attribute);
    else element.setAttribute(attribute, record.previous);
  };
  return {
    owns(element, value) {
      const record = owned.get(element);
      return Boolean(record && record.value === value && element.getAttribute(attribute) === value);
    },
    update(next) {
      for (const [element, record] of owned) if (!next.has(element)) {
        if (element.getAttribute(attribute) !== record.value) yielded.add(element);
        else release(element, record);
        owned.delete(element);
      }
      for (const [element, value] of next) {
        const record = owned.get(element);
        if (record && element.getAttribute(attribute) !== record.value) {
          owned.delete(element); yielded.add(element);
        }
        if (yielded.has(element)) continue;
        if (!owned.has(element)) owned.set(element, { previous: element.getAttribute(attribute), value });
        else owned.get(element).value = value;
        if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
      }
    },
    dispose() { for (const [element, record] of owned) release(element, record); owned.clear(); },
  };
}
