// Tool results from context maintenance are references, not new project facts.
export const BC_VERSION = '0.1.202';
export const BC_TOOL_NAMES = Object.freeze(['compress', 'decompress', 'search_context', 'acp_status', 'acp_cache', 'acp_rule', 'absorb', 'acp_retrieve', 'acp_read_original_image']);
// Only writers of the proxy's compressed representation compete with OMD.
// Search, recall, rules and diagnostics remain available in either mode.
export const BC_EXCLUSIVE_TOOLS = Object.freeze(['compress', 'absorb']);
export const BC_REFERENCE_TOOLS = Object.freeze(BC_TOOL_NAMES.filter(name => name !== 'acp_rule'));
