export const FREQUENCY_PRESETS = {
  always: { digestEvery: 16, stateEvery: 30, supplementMinSteps: 20, surgeryCooldownSteps: 10, minRegionTokens: 20000 },
  medium: { digestEvery: 32, stateEvery: 60, supplementMinSteps: 30, surgeryCooldownSteps: 20, minRegionTokens: 40000 },
  slow: { digestEvery: 48, stateEvery: 90, supplementMinSteps: 45, surgeryCooldownSteps: 30, minRegionTokens: 80000 },
};

// Shared by host defaults, the context pipeline and settings UI.
export const CONTEXT_FREQUENCY_PRESETS = Object.freeze({
  always: Object.freeze({ digestEvery: 32, digestWindow: 32, coordinatorEvery: 2, coordinatorMinGapMs: 30000, surgeryCooldownSteps: 20 }),
  medium: Object.freeze({ digestEvery: 48, digestWindow: 48, coordinatorEvery: 3, coordinatorMinGapMs: 60000, surgeryCooldownSteps: 30 }),
  slow: Object.freeze({ digestEvery: 64, digestWindow: 64, coordinatorEvery: 4, coordinatorMinGapMs: 120000, surgeryCooldownSteps: 40 }),
});
