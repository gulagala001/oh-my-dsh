// Keep the root entry while its effects retire. Concurrent owners join the
// same cleanup; after an error retry only the first unconfirmed effect.
export function retireEntry(roots, root, entry, steps) {
  let index = 0;
  entry.retryRetirement = () => {
    if (!entry.retiring) {
      entry.retiring = Promise.resolve().then(async () => {
        while (index < steps.length) { await steps[index](); index++; }
        if (roots.get(root) === entry) roots.delete(root);
      }).catch(error => { entry.retiring = null; throw error; });
    }
    return entry.retiring;
  };
  return entry.retryRetirement();
}
