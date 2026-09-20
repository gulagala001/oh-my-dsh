// Shared by host defaults, the context pipeline and settings UI.
export const CONTEXT_FREQUENCY_PRESETS = Object.freeze({
  always: Object.freeze({ digestEvery: 32, digestWindow: 32, coordinatorEvery: 2, coordinatorMinGapMs: 30000, surgeryCooldownSteps: 20 }),
  medium: Object.freeze({ digestEvery: 48, digestWindow: 48, coordinatorEvery: 3, coordinatorMinGapMs: 60000, surgeryCooldownSteps: 30 }),
  slow: Object.freeze({ digestEvery: 64, digestWindow: 64, coordinatorEvery: 4, coordinatorMinGapMs: 120000, surgeryCooldownSteps: 40 }),
});
