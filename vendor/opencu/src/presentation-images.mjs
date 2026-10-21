// A revision is usable only for the same target occurrence and pixel geometry.
// Missing/failed images never borrow pixels from an earlier occurrence.
const sameImage = (previous, frame) => typeof frame.imageRevision === 'string' && frame.imageRevision.length > 0
  && typeof frame.visibilityKey === 'string' && frame.visibilityKey.length > 0 && Number.isSafeInteger(frame.mediaGeneration)
  && previous?.imageDataURL && ['presentationID', 'threadID', 'visibilityKey', 'mediaGeneration', 'imageRevision', 'width', 'height', 'kind']
    .every(key => Object.is(previous[key], frame[key]));

export function compactPresentationImages(previous, frames) {
  return frames.map(frame => {
    const old = previous.find(item => sameImage(item, frame));
    if (!frame.imageDataURL || old?.imageDataURL !== frame.imageDataURL) return frame;
    const { imageDataURL, ...value } = frame;
    return { ...value, imageUnchanged: true };
  });
}

export function restorePresentationImages(previous, frames) {
  return frames.map(frame => {
    const { imageUnchanged, ...value } = frame;
    if (!imageUnchanged) return value;
    const old = previous.find(item => sameImage(item, frame));
    if (!old) throw Object.assign(new Error('The monitoring image baseline is unavailable'), { code: 'PRESENTATION_IMAGE_BASELINE_MISSING' });
    return { ...value, imageDataURL: old.imageDataURL };
  });
}
