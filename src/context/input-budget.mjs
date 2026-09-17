// Keep the exact JSON representation and drop only the oldest lookback entries.
// Source segments, attachment references and prompt text are never truncated.
export function serializePreparationInput(input, maxCharacters) {
  const encoded = JSON.stringify(input);
  if (encoded.length <= maxCharacters) return encoded;
  const reference = input.reference;
  let size = encoded.length, removed = 0;
  while (size > maxCharacters && removed < reference.length) {
    size -= (JSON.stringify(reference[removed]) ?? 'null').length + (reference.length - removed > 1 ? 1 : 0);
    removed++;
  }
  if (size > maxCharacters) throw Error('整窗输入超过预算，原文保留；请调大预处理输入预算或缩小窗口');
  reference.splice(0, removed);
  return JSON.stringify(input);
}
