import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttributeMarkers } from '../src/client/attribute-markers.mjs';

// A minimal attribute store isolates the ownership protocol; real native DOM
// selection, keyboard and lifecycle are covered by sidebar/appearance tests.
const element = previous => {
  let value = previous;
  return { getAttribute: () => value, setAttribute: (_name, next) => { value = next; }, removeAttribute: () => { value = null; } };
};
for (const attribute of ['data-omd-nav-part','data-omd-surface']) {
  test(attribute + ' only reports a currently held marker as owned', () => {
    const node = element(null), markers = createAttributeMarkers(attribute);
    assert.equal(markers.owns(node,'title'),false);
    markers.update(new Map([[node,'title']]));
    assert.equal(markers.owns(node,'title'),true);
    assert.equal(markers.owns(node,'header'),false);
    node.setAttribute(attribute,'foreign-new');
    assert.equal(markers.owns(node,'title'),false);
    markers.update(new Map([[node,'title']])); node.setAttribute(attribute,'title');
    assert.equal(markers.owns(node,'title'),false);
    markers.dispose();
  });
  test(attribute + ' preserves a later owner through refresh, scope changes and disposal', () => {
    const node = element('foreign-old'), markers = createAttributeMarkers(attribute);
    markers.update(new Map([[node,'title']]));
    node.setAttribute(attribute,'foreign-new');
    markers.update(new Map([[node,'title']]));
    assert.equal(node.getAttribute(attribute),'foreign-new');
    markers.update(new Map()); markers.update(new Map([[node,'header']]));
    assert.equal(node.getAttribute(attribute),'foreign-new');
    markers.dispose(); assert.equal(node.getAttribute(attribute),'foreign-new');
  });
  test(attribute + ' restores an unchanged prior value and leaves a new node eligible', () => {
    const original = element('foreign-old'), fresh = element(null), markers = createAttributeMarkers(attribute);
    markers.update(new Map([[original,'title']]));
    markers.update(new Map([[fresh,'header']]));
    assert.equal(original.getAttribute(attribute),'foreign-old');
    assert.equal(fresh.getAttribute(attribute),'header');
    markers.dispose(); assert.equal(fresh.getAttribute(attribute),null);
  });
  test(attribute + ' retains deliberate external removal', () => {
    const node = element(null), markers = createAttributeMarkers(attribute);
    markers.update(new Map([[node,'title']])); node.removeAttribute(attribute);
    markers.update(new Map([[node,'title']])); markers.dispose();
    assert.equal(node.getAttribute(attribute),null);
  });
  test(attribute + ' yields when external takeover and scope removal happen in the same refresh', () => {
    const node = element('foreign-old'), markers = createAttributeMarkers(attribute);
    markers.update(new Map([[node,'title']])); node.setAttribute(attribute,'foreign-new');
    markers.update(new Map()); markers.update(new Map([[node,'header']])); markers.dispose();
    assert.equal(node.getAttribute(attribute),'foreign-new');
  });
}
