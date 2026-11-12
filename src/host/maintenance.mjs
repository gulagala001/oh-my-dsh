// The native Agent reports idle during maintenance. Reservation rejects a busy
// slot synchronously, while the admitted callback settles asynchronously.
export function reserveMaintenance(agent, run) {
  if (!agent?.runMaintenance) return { work: Promise.resolve().then(() => run()) };
  try { return { work: agent.runMaintenance(run) }; }
  catch (error) {
    if (!String(error?.message).endsWith('already has active work')) throw error;
    return null;
  }
}
