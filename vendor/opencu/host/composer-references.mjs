/** Add an in-place reference refresh without moving the editor selection or focus. */
export async function applyComposerReferences(patch, base) {
  await patch(base + 'contract/input.ts', [[
    'export interface SessionInput extends InputTarget {',
    `export interface SessionInput extends InputTarget {
  /** Refresh one existing chip at a revision-guarded span without moving selection or focus. */
  updateReference(ref: ReferenceInsert, span: TokenSpan): boolean`
  ]], 'updateReference(ref: ReferenceInsert');
  await patch(base + 'input/facade.ts', [[
    '  insertReference(ref: ReferenceInsert, span: TokenSpan): boolean {',
    `  /** Refresh one existing reference; stale drafts and busy submission refuse. */
  updateReference(ref: ReferenceInsert, span: TokenSpan): boolean {
    if (this.disposed || this.core.state.phase !== 'plain' || span.draftRev !== this.rev) return false
    return this.draftEditor.updateReference(span, ref)
  }

  insertReference(ref: ReferenceInsert, span: TokenSpan): boolean {`
  ]], 'updateReference(ref: ReferenceInsert');
  await patch(base + 'input/editor/runtime.ts', [[
    '  insertReference(span: DetectSpan, ref: ReferenceInsert, tail: string): boolean {',
    `  /** Refresh exactly one chip; preserve its node identity and the current selection. */
  updateReference(span: DetectSpan, ref: ReferenceInsert): boolean {
    let applied = false
    this.applyEdit(() => {
      const segment = $composerLayout().segments.find(item => item.kind === 'chip' && item.detectStart === span.start && span.end === span.start + 1)
      if (segment?.node instanceof ReferenceChipNode) { segment.node.updateReference(ref); applied = true }
    }, SKIP_DOM_SELECTION_TAG)
    return applied
  }

  insertReference(span: DetectSpan, ref: ReferenceInsert, tail: string): boolean {`
  ]], 'updateReference(span: DetectSpan');
  await patch(base + 'input/editor/chip-node.tsx', [[
    '  setInvalid(invalid: boolean): void {',
    `  /** Replace the reference fields while preserving this occurrence's node key. */
  updateReference(ref: ReferenceInsert): void {
    const writable = this.getWritable()
    writable.__source = ref.source; writable.__ref = ref.ref; writable.__label = ref.label
    writable.__appearance = ref.appearance; writable.__clipboardText = ref.clipboardText; writable.__invalid = false
  }

  setInvalid(invalid: boolean): void {`
  ]], 'updateReference(ref: ReferenceInsert');
}
