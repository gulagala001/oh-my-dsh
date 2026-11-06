export const PTC_CONTROL_NAMES = Object.freeze(['job_output', 'job_list', 'job_kill', 'runtime_status']);
export const REWIND_WORKSPACE_INDEPENDENT = 'dsh-rewind-plus.workspace-independent';
const controls = new Set(PTC_CONTROL_NAMES);
export const isPtcControl = name => controls.has(name);
