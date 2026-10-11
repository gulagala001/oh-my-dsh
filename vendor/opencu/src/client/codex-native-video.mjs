// Codex preload decoder + local-conversation-thread Mw. The HTTP layer only
// carries the real host's encoded payload; native producer ACKs stay server-side.
const streams = new Map();
const bytes = value => {
  if (value == null) return null;
  if (typeof value !== 'string') throw new TypeError('Invalid native video bytes');
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
};
const sameBytes = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const WINDOWS_PNG = 'windows-wgc-png';
const positive = value => Number.isSafeInteger(value) && value > 0;
const present = value => typeof value === 'string' && value.length > 0;
function pngIdentity(value) {
  if (!positive(value.sourceGeneration) || !positive(value.pid)
    || ![value.threadID, value.presentationID, value.turnID, value.targetId, value.viewId, value.captureId, value.bridgeSessionId, value.processIdentity].every(present)
    || value.windowId == null) throw new Error('Invalid Windows native source identity');
  return JSON.stringify([value.threadID, value.presentationID, value.turnID, value.targetId, value.viewId,
    value.captureId, value.pid, value.windowId, value.processIdentity, value.bridgeSessionId, value.sourceGeneration]);
}
function pngFrame(value) {
  if (value.format !== 'image/png' || value.mediaType !== 'image/png' || !positive(value.sequence)
    || ![value.pixelWidth, value.pixelHeight, value.sourceWidth, value.sourceHeight].every(positive)
    || value.pixelWidth * value.pixelHeight > 67108864 || typeof value.data !== 'string'
    || value.data.length > 44739244 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data)) {
    throw new Error('Invalid Windows native PNG frame');
  }
  const data = bytes(value.data), signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (data.length < 33 || !signature.every((byte, index) => data[index] === byte)
    || data[12] !== 73 || data[13] !== 72 || data[14] !== 68 || data[15] !== 82) throw new Error('Invalid Windows native PNG bytes');
  const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (header.getUint32(16) !== value.pixelWidth || header.getUint32(20) !== value.pixelHeight) throw new Error('Windows native PNG dimensions changed');
  return data;
}

class NativeVideoStream {
  constructor(endpoint, threadID) {
    this.endpoint = endpoint; this.threadID = threadID;
    this.listeners = new Map(); this.decoders = new Map(); this.pngSources = new Map(); this.closed = false;
    this.source = new EventSource(endpoint);
    this.source.addEventListener('native-video', event => {
      try { this.receive(JSON.parse(event.data)); } catch (error) { this.fail(error); }
    });
    for (const event of ['failure', 'closed']) this.source.addEventListener(event, message => {
      let value; try { value = JSON.parse(message.data); } catch {}
      this.fail(new Error(value?.message || 'Native video stream closed'));
      this.closed = true; this.source.close();
    });
    this.source.onerror = () => {
      if (this.closed) return;
      for (const entry of this.pngSources.values()) entry.revision++;
      this.closeDecoders(); this.status('connecting');
    };
  }
  status(value) { for (const listeners of this.listeners.values()) for (const listener of listeners.values()) listener.onStatus?.(value); }
  closeDecoders() {
    for (const entry of this.decoders.values()) if (entry.decoder.state !== 'closed') entry.decoder.close();
    this.decoders.clear();
  }
  fail(error, presentationID) {
    if (presentationID) {
      const entry = this.pngSources.get(presentationID); if (entry) { entry.stopped = true; entry.revision++; }
    } else for (const entry of this.pngSources.values()) { entry.stopped = true; entry.revision++; }
    if (presentationID) {
      const entry = this.decoders.get(presentationID);
      this.decoders.delete(presentationID);
      if (entry?.decoder.state !== 'closed') entry?.decoder.close();
    } else this.closeDecoders();
    const groups = presentationID ? [this.listeners.get(presentationID)] : this.listeners.values();
    for (const listeners of groups) for (const listener of listeners?.values() ?? []) {
      listener.onStatus?.('error'); listener.onError?.(error);
    }
  }
  receive(value) {
    if (this.closed || value?.threadID !== this.threadID) return;
    if (value.producerKind === WINDOWS_PNG) { this.receivePng(value); return; }
    if ('stopped' in value) {
      for (const entry of this.pngSources.values()) { entry.stopped = true; entry.revision++; }
      this.closeDecoders(); this.status('stopped'); return;
    }
    const presentationID = value.presentationID;
    if (!this.listeners.has(presentationID)) return;
    if (value.producerKind != null) { this.fail(new Error('Unsupported native video producer'), presentationID); return; }
    if (typeof value.codec !== 'string' || typeof value.isKeyFrame !== 'boolean' || !Number.isFinite(value.timestamp) || value.timestamp < 0) {
      this.fail(new Error('Invalid native video frame'), presentationID); return;
    }
    try {
      if (typeof VideoDecoder !== 'function' || typeof EncodedVideoChunk !== 'function') throw new Error('Native encoded video requires WebCodecs');
      const configuration = bytes(value.decoderConfiguration), data = bytes(value.videoData);
      let entry = this.decoders.get(presentationID);
      if (!entry) {
        if (!value.isKeyFrame || !configuration) return;
        const decoder = new VideoDecoder({
          output: frame => {
            const listeners = this.listeners.get(presentationID);
            if (this.decoders.get(presentationID)?.decoder !== decoder || !listeners?.size) { frame.close(); return; }
            if (listeners.size === 1) {
              try { listeners.values().next().value.onFrame(frame); } catch (error) { frame.close(); this.fail(error, presentationID); }
            } else {
              try { for (const listener of listeners.values()) {
                const copy = frame.clone();
                try { listener.onFrame(copy); } catch (error) { copy.close(); throw error; }
              } }
              catch (error) { this.fail(error, presentationID); }
              finally { frame.close(); }
            }
          },
          error: error => { if (this.decoders.get(presentationID)?.decoder === decoder) this.fail(error, presentationID); },
        });
        entry = {decoder, configuration, codec: value.codec}; this.decoders.set(presentationID, entry);
        decoder.configure({codec: value.codec, description: configuration, hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true});
      } else if (value.isKeyFrame && configuration && (!sameBytes(entry.configuration, configuration) || entry.codec !== value.codec)) {
        entry.decoder.reset();
        entry.decoder.configure({codec: value.codec, description: configuration, hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true});
        entry.configuration = configuration; entry.codec = value.codec;
      }
      if (entry.decoder.state === 'configured') entry.decoder.decode(new EncodedVideoChunk({data, timestamp: value.timestamp, type: value.isKeyFrame ? 'key' : 'delta'}));
    } catch (error) { this.fail(error, presentationID); }
  }
  receivePng(value) {
    const presentationID = value.presentationID, listeners = this.listeners.get(presentationID);
    if (!listeners?.size) return;
    try {
      const identity = pngIdentity(value);
      let entry = this.pngSources.get(presentationID);
      if (entry && value.sourceGeneration < entry.generation) return;
      if (entry && value.sourceGeneration === entry.generation && identity !== entry.identity) throw new Error('Windows native source identity changed within a generation');
      if (!entry || value.sourceGeneration > entry.generation) {
        entry = {identity, generation: value.sourceGeneration, sequence: -1, revision: 0, stopped: false};
        this.pngSources.set(presentationID, entry);
        for (const listener of listeners.values()) listener.onStatus?.('connecting');
      }
      if (value.stopped === true) {
        entry.stopped = true; entry.revision++;
        for (const listener of listeners.values()) listener.onStatus?.('stopped');
        return;
      }
      if (entry.stopped || value.sequence <= entry.sequence) return;
      const data = pngFrame(value), revision = entry.revision;
      entry.sequence = value.sequence;
      const isCurrent = () => !this.closed && !entry.stopped && entry.revision === revision
        && this.pngSources.get(presentationID) === entry && this.listeners.get(presentationID)?.size > 0;
      for (const listener of listeners.values()) listener.onFrame({...value, pngBytes: data, isCurrent});
    } catch (error) { this.fail(error, presentationID); }
  }
  subscribe(presentationID, listener) {
    let group = this.listeners.get(presentationID);
    if (!group) this.listeners.set(presentationID, group = new Map());
    const token = {}; group.set(token, listener); listener.onStatus?.('connecting');
    return () => {
      group.delete(token);
      if (!group.size) {
        this.listeners.delete(presentationID);
        const png = this.pngSources.get(presentationID); if (png) { png.stopped = true; png.revision++; }
        this.pngSources.delete(presentationID);
        const entry = this.decoders.get(presentationID); this.decoders.delete(presentationID);
        if (entry?.decoder.state !== 'closed') entry?.decoder.close();
      }
      if (!this.listeners.size) {
        this.closed = true; this.source.close(); this.closeDecoders(); this.pngSources.clear();
        if (streams.get(this.endpoint) === this) streams.delete(this.endpoint);
      }
    };
  }
}

export function subscribeCodexNativeVideo({endpoint, threadID, presentationID, ...listener}) {
  if (!threadID || !presentationID) throw new Error('Native video requires an actual thread and presentation');
  let stream = streams.get(endpoint);
  if (!stream) { stream = new NativeVideoStream(endpoint, threadID); streams.set(endpoint, stream); }
  if (stream.threadID !== threadID) throw new Error('Native video stream identity changed');
  return stream.subscribe(presentationID, listener);
}

export function createCodexNativePngSink(canvas, {onFrame, onError} = {}) {
  const context = canvas.getContext('2d', {alpha: true});
  if (!context) throw new Error('Windows native PNG preview requires a canvas');
  let closed = false, revision = 0, cancelImage, bitmapBusy = false, pendingFrame;
  const clear = () => { context.clearRect(0, 0, canvas.width, canvas.height); };
  const sink = {
    write(frame) {
      if (closed || !frame.isCurrent?.()) return;
      if (typeof createImageBitmap === 'function' && bitmapBusy) { pendingFrame = frame; return; }
      const current = ++revision;
      cancelImage?.(); cancelImage = undefined;
      const active = () => !closed && revision === current && frame.isCurrent();
      const draw = image => {
        if (!active()) return;
        if (image.width !== frame.pixelWidth || image.height !== frame.pixelHeight) throw new Error('Decoded Windows native PNG dimensions changed');
        if (canvas.width !== frame.pixelWidth || canvas.height !== frame.pixelHeight) { canvas.width = frame.pixelWidth; canvas.height = frame.pixelHeight; }
        clear(); context.drawImage(image, 0, 0, frame.pixelWidth, frame.pixelHeight);
        if (active()) onFrame?.({width: frame.sourceWidth, height: frame.sourceHeight, pixelWidth: frame.pixelWidth, pixelHeight: frame.pixelHeight});
      };
      const blob = new Blob([frame.pngBytes], {type: 'image/png'});
      if (typeof createImageBitmap === 'function') {
        bitmapBusy = true;
        void createImageBitmap(blob).then(image => {
          try { draw(image); } finally { image.close(); }
        }).catch(error => { if (active()) onError?.(error); }).finally(() => {
          bitmapBusy = false;
          if (!closed && pendingFrame) { const latest = pendingFrame; pendingFrame = undefined; sink.write(latest); }
        });
        return;
      }
      const image = new Image(), objectURL = URL.createObjectURL(blob);
      let released = false;
      const release = () => {
        if (released) return; released = true;
        image.onload = null; image.onerror = null; image.removeAttribute('src'); URL.revokeObjectURL(objectURL);
        if (cancelImage === release) cancelImage = undefined;
      };
      cancelImage = release;
      image.onload = () => {
        try { draw(image); } catch (error) { if (active()) onError?.(error); } finally { release(); }
      };
      image.onerror = () => { release(); if (active()) onError?.(new Error('Windows native PNG decoding failed')); };
      image.src = objectURL;
    },
    close() {
      if (closed) return; closed = true; revision++;
      pendingFrame = undefined; cancelImage?.(); cancelImage = undefined; clear(); canvas.width = 0; canvas.height = 0;
    },
  };
  return sink;
}

// remote-hosted-pip-frame-filter.worker-4b82a84542ac.js.
function filterWorker() {
  const context = new OffscreenCanvas(8, 8).getContext('2d', {alpha: true, willReadFrequently: true});
  let previousAlpha = 0, width = 0, height = 0;
  self.onmessage = ({data: frame}) => {
    if (context) {
      context.clearRect(0, 0, 8, 8); context.drawImage(frame, 0, 0, 8, 8);
      const {data} = context.getImageData(0, 0, 8, 8);
      let alpha = 0; for (let index = 3; index < data.length; index += 4) alpha += data[index];
      const previous = width === frame.displayWidth && height === frame.displayHeight ? previousAlpha : 0;
      if (alpha === 0 || previous > 0 && alpha < previous * .98) { frame.close(); self.postMessage(null); return; }
      previousAlpha = Math.max(previous, alpha); width = frame.displayWidth; height = frame.displayHeight;
    }
    self.postMessage(frame, {transfer: [frame]});
  };
}

export function createCodexNativeVideoSink(video, {onFrame, onError} = {}) {
  if (typeof MediaStreamTrackGenerator !== 'function' || typeof Worker !== 'function') throw new Error('Native video requires MediaStreamTrackGenerator');
  const track = new MediaStreamTrackGenerator({kind: 'video'}), writer = track.writable.getWriter();
  const workerURL = URL.createObjectURL(new Blob([`(${filterWorker.toString()})();`], {type: 'text/javascript'}));
  let filter;
  try { filter = new Worker(workerURL); } catch (error) { URL.revokeObjectURL(workerURL); track.stop(); void writer.close().catch(() => {}); throw error; }
  const sink = {closed: false, filtering: false};
  filter.onmessage = ({data: frame}) => {
    sink.filtering = false;
    if (sink.closed) { frame?.close(); return; }
    if (!frame) return;
    const size = {width: frame.displayWidth, height: frame.displayHeight};
    if (video.width !== size.width || video.height !== size.height) { video.width = size.width; video.height = size.height; }
    void writer.write(frame).then(() => { frame.close(); if (!sink.closed) onFrame?.(size); }, error => { frame.close(); if (!sink.closed) onError?.(error); });
  };
  filter.onerror = event => { event.preventDefault(); if (!sink.closed) onError?.(new Error(event.message || 'Native video filter failed')); };
  video.srcObject = new MediaStream([track]); void video.play().catch(() => {});
  return {
    write(frame) {
      if (sink.closed || sink.filtering || writer.desiredSize != null && writer.desiredSize <= 0) { frame.close(); return; }
      sink.filtering = true;
      try { filter.postMessage(frame, [frame]); } catch (error) { sink.filtering = false; frame.close(); onError?.(error); }
    },
    close() {
      if (sink.closed) return; sink.closed = true;
      filter.terminate(); URL.revokeObjectURL(workerURL); video.srcObject = null;
      void writer.close().catch(() => {}); track.stop();
    },
  };
}
