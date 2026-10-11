import React, {useEffect, useRef, useState} from 'react';
import {createCodexNativePngSink, createCodexNativeVideoSink, subscribeCodexNativeVideo} from './codex-native-video.mjs';
import {windowsNativePresentationKey} from './codex-native-layout.mjs';

export function CodexNativeVideo({sessionId, presentationID, presentationSource, visible, enabled, url, style, onError, onFrameSize, onConnection}) {
  const video = useRef(null), canvas = useRef(null), callbacks = useRef({onError, onFrameSize, onConnection});
  callbacks.current = {onError, onFrameSize, onConnection};
  const [ready, setReady] = useState(false);
  const [producerKind, setProducerKind] = useState(null);
  const sourceKey = windowsNativePresentationKey(presentationSource);
  const windowsSource = presentationSource?.producerKind === 'windows-wgc-png';
  useEffect(() => {
    setReady(false); setProducerKind(null);
    if (!visible || !enabled) { callbacks.current.onConnection?.('disabled'); return; }
    if (!presentationID) { callbacks.current.onConnection?.('connecting'); return; }
    if (windowsSource && !sourceKey) { callbacks.current.onConnection?.('error'); callbacks.current.onError?.('Windows native presentation identity is unavailable'); return; }
    let live = true, sink, sinkKind, unsubscribe, frameSize;
    const reset = () => { frameSize = undefined; sink?.close(); sink = undefined; sinkKind = undefined; };
    const fail = error => { if (live) { reset(); setReady(false); callbacks.current.onConnection?.('error'); callbacks.current.onError?.(error.message); } };
    const loaded = () => {
      if (!live || sinkKind !== 'encoded-video' || !frameSize || video.current.readyState < 2) return;
      setReady(true); callbacks.current.onConnection?.('live'); callbacks.current.onFrameSize?.(frameSize);
    };
    const node = video.current; node.addEventListener('loadeddata', loaded);
    try {
      unsubscribe = subscribeCodexNativeVideo({endpoint: url('native-video', sessionId), threadID: sessionId, presentationID,
        onFrame: frame => {
          if (!live) { frame.close?.(); return; }
          const kind = frame.producerKind === 'windows-wgc-png' ? frame.producerKind : 'encoded-video';
          if (kind === 'windows-wgc-png' && (!windowsSource || windowsNativePresentationKey(frame) !== sourceKey)
            || windowsSource && kind !== 'windows-wgc-png') {
            frame.close?.(); fail(new Error('Native preview frame belongs to another presentation source')); return;
          }
          if (sinkKind && sinkKind !== kind) { frame.close?.(); fail(new Error('Native preview producer changed')); return; }
          if (!sink) {
            sinkKind = kind; setProducerKind(kind);
            if (kind === 'windows-wgc-png') sink = createCodexNativePngSink(canvas.current, {onFrame: size => {
              if (!live || !sink || sinkKind !== kind) return;
              frameSize = size; setReady(true); callbacks.current.onConnection?.('live', {sourceKey}); callbacks.current.onFrameSize?.(size, {sourceKey});
            }, onError: fail});
            else sink = createCodexNativeVideoSink(node, {onFrame: size => { frameSize = size; loaded(); }, onError: fail});
          }
          sink.write(frame);
        }, onError: fail,
        onStatus: value => { if (live) { if (value !== 'live') { reset(); setReady(false); } callbacks.current.onConnection?.(value); } },
      });
    } catch (error) { fail(error); }
    return () => { live = false; node.removeEventListener('loadeddata', loaded); unsubscribe?.(); reset(); };
  }, [sessionId, presentationID, sourceKey, windowsSource, visible, enabled, url]);
  return <><video ref={video} className="codex-cu-native-image" style={{...style,...(producerKind === 'windows-wgc-png' ? {display: 'none'} : {})}} aria-label="Computer Use preview"
    data-pip-native-video-presentation={presentationID} data-native-ready={ready} autoPlay muted playsInline disablePictureInPicture
    onError={() => {if (producerKind !== 'windows-wgc-png') {setReady(false); callbacks.current.onConnection?.('error'); callbacks.current.onError?.('Native video playback failed');}}}/>
    <canvas ref={canvas} className="codex-cu-native-image" style={{...style,...(producerKind !== 'windows-wgc-png' ? {display: 'none'} : {})}} aria-label="Computer Use preview"
      data-pip-native-video-presentation={presentationID} data-native-producer-kind="windows-wgc-png" data-native-ready={ready && producerKind === 'windows-wgc-png'}/></>;
}
