import { semanticAX } from './observation-output.mjs';

/** Keep UI history available without replaying it in every model state query. */
export function modelResult(value, { includeHistory = false, format, details = false } = {}) {
  const { presentation, state, ...result } = value;
  if (result.observation) {
    const observation = { ...result.observation };
    const axText = typeof observation.ax === 'string' ? observation.ax : observation.ax?.text;
    if (format === 'screenshot') {
      delete observation.ax;
      if (typeof observation.text === 'string') delete observation.text;
      if (typeof observation.state === 'string') delete observation.state;
    } else {
      if (typeof observation.state === 'string' && (observation.state === axText || observation.state === observation.text)) delete observation.state;
      if (typeof observation.text === 'string' && (observation.text === axText || observation.ax?.source === 'chromium-accessibility-tree')) delete observation.text;
    }
    if (format !== 'screenshot' && observation.ax && !details) observation.ax = semanticAX(observation.ax).text;
    result.observation = observation;
  }
  if (!state) return result;
  if (includeHistory) return { ...result, state };
  const { lastObservation, annotations, selectedTarget, targets, ...control } = state;
  return { ...result, state: { ...control,
    ...(targets ? { targets: targets.map(target => Object.fromEntries(
      ['id', 'backend', 'provider', 'browserId', 'title', 'url', 'verified', 'cold'].filter(key => target[key] !== undefined).map(key => [key, target[key]]))) } : {}),
    ...(lastObservation ? { lastObservation: { targetId: lastObservation.targetId,
      observationId: lastObservation.observation?.id ?? lastObservation.observation?.observationId ?? lastObservation.observationId,
      notice: 'Stored observation; observe the target for current state. Use includeHistory:true to read saved content.' } } : {}),
    ...(annotations?.length ? { annotationCount: annotations.length } : {}),
  } };
}
