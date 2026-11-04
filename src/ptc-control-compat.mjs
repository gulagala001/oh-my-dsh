export const PTC_CONTROL_NAMES = Object.freeze(['job_output', 'job_list', 'job_kill', 'runtime_status']);
const controls = new Set(PTC_CONTROL_NAMES);
export const isPtcControl = name => controls.has(name);
