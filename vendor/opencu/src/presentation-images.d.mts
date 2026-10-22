export declare function compactPresentationImages<T extends object>(previous: readonly object[], frames: readonly T[]):
  (T | (Omit<T, 'imageDataURL'> & { imageUnchanged: true }))[];
export declare function restorePresentationImages<T extends object>(previous: readonly object[], frames: readonly T[]):
  (Omit<T, 'imageUnchanged'> & { imageDataURL?: string })[];
