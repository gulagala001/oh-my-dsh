/** Keep CU calls in normal tool groups without changing their REA renderer. */
export async function applyToolVisibility(patch, base, target) {
  const computerCalls = `const computerCalls = new WeakMap<ToolCallBlock, boolean>()
function containsComputerCall(block: ToolCallBlock): boolean {
  const cached = computerCalls.get(block)
  if (cached !== undefined) return cached
  const name = 'kind' in block ? block.call?.name ?? '' : block.name
  const result = /^(?:computer_use(?:_|$)|opencu_)/.test(name.split(/[./]/).at(-1) ?? '')
    || block.subCalls.some(containsComputerCall)
  computerCalls.set(block, result)
  return result
}

`;
  if (target === 'rc2') {
    await patch(base + 'process-groups.ts', [[
      computerCalls + `function independent(node: ChatNode): boolean {
  return INDEPENDENT.has(node.kind) || node.kind === 'tool-call' && containsComputerCall(node.data.root)
}

`, ''
    ], [
      '  ConversationGroupDefinition, ConversationGroupInput, GroupKey, GroupSnapshot, ToolCallBlock,',
      '  ConversationGroupDefinition, ConversationGroupInput, GroupKey, GroupSnapshot,'
    ], [
      '\n    || independent(previous) !== independent(current)', ''
    ], [
      '      if (independent(node)) {', '      if (INDEPENDENT.has(node.kind)) {'
    ]], '      if (INDEPENDENT.has(node.kind)) {');
  } else await patch(base + 'tool.ts', [[
    computerCalls, ''
  ], [
    "    const groupTree = containsComputerCall(projected) ? 'turn' : undefined\n", ''
  ], [
    ' && current.groupTree === groupTree', ''
  ], [
    "return chatNode(context, 'tool-call', anchor, data, { visibility, location, groupTree })",
    "return chatNode(context, 'tool-call', anchor, data, { visibility, location })"
  ]], "return chatNode(context, 'tool-call', anchor, data, { visibility, location })");
}
