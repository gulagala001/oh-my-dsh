// Local native home branch: local-conversation-thread Iw/Bw/Yw.
// These are layout inputs from the native presentation host, not capture bounds.
// Source anchors and unresolved host adapters: work/rea-reconstruction/native.
export const NATIVE_PRESENTATION_LIMIT = 5;
const WINDOWS_PNG = 'windows-wgc-png';
const positive = value => Number.isSafeInteger(value) && value > 0;
const text = value => typeof value === 'string' && value.length > 0;

export function windowsNativePresentationKey(record) {
  if (!record || record.producerKind !== WINDOWS_PNG || record.format !== 'image/png'
    || ![record.presentationID, record.threadID, record.turnID, record.targetId, record.viewId,
      record.captureId, record.bridgeSessionId, record.processIdentity].every(text)
    || ![record.pid, record.windowId, record.sourceGeneration].every(positive)) return null;
  return JSON.stringify([record.threadID, record.presentationID, record.turnID, record.targetId, record.viewId,
    record.captureId, record.pid, record.windowId, record.processIdentity, record.bridgeSessionId, record.sourceGeneration]);
}

function windowsPublishedRecord(record) {
  return windowsNativePresentationKey(record) !== null && record.nativeProducer?.format === 'image/png'
    && record.nativeProducer.hardwareSharedSurface === false
    && positive(record.nativeProducer.sourceWidth) && positive(record.nativeProducer.sourceHeight);
}

export function nativePresentationForTarget(state, threadID, targetId, presentationID) {
  return state?.nativePresentation?.presentations?.find(record => record.threadID === threadID
    && record.published === true && record.cleanupPending !== true
    && (record.producerKind !== WINDOWS_PNG || windowsPublishedRecord(record))
    && (presentationID ? record.presentationID === presentationID : record.viewId === targetId || record.targetId === targetId));
}

export function nativePresentationOwnerInput(owner, threadID, active) {
  if (owner?.ownerKind === 'windows-native') {
    if (!text(owner.epoch) || !text(threadID) || owner.producerKind !== WINDOWS_PNG || owner.format !== 'image/png'
      || !Array.isArray(owner.owners) || owner.owners.some(record => !record || !text(record.threadID) || !text(record.presentationID))) return null;
    const records = owner.owners.filter(record => record.threadID === threadID && record.published === true && record.cleanupPending !== true);
    if (records.some(record => !windowsPublishedRecord(record)) || new Set(records.map(record => record.presentationID)).size !== records.length) return null;
    return {host: null, layout: {activeThreadID: active ? threadID : null,
      orderedPresentationIDs: records.map(record => record.presentationID), placement: 'home', maxDisplaySize: 200}};
  }
  if (owner?.available !== true || owner.ownerKind !== 'plugin-companion' || typeof owner.ownerID !== 'string'
    || owner.host?.ownerID !== owner.ownerID || owner.host?.hostID !== owner.hostID
    || !Number.isSafeInteger(owner.ownerWindowID) || owner.ownerWindowID <= 0 || !owner.layout) return null;
  return {host: {...owner.host}, layout: {...owner.layout, activeThreadID: active ? threadID : null}};
}

export function nativeHomeMetrics({layout,domHome,conversationId,containerWidth,windowZoom=1,loadedIds=[],errorIds=[],enteringIds=[]}){
  if(!layout||layout.activeThreadID!==conversationId||!Array.isArray(layout.orderedPresentationIDs))return null;
  const orderedIds=layout.orderedPresentationIDs.slice(0,NATIVE_PRESENTATION_LIMIT);
  const loaded=new Set(loadedIds),errors=new Set(errorIds),entering=new Set(enteringIds);
  const moving=layout.isMovingToAnchor===true;
  const domAvailable=domHome?.ownerKind==='dsh-dom'&&domHome.available===true&&domHome.active===true;
  const ready=!moving&&orderedIds.length>0&&orderedIds.every(id=>loaded.has(id));
  const withoutEntering=!ready&&!orderedIds.some(id=>entering.has(id));
  const surfaceHeight=layout.stackDisplayHeight>0?layout.stackDisplayHeight/windowZoom:200;
  const maxDisplaySize=containerWidth==null?null:Math.min(400,Math.max(1,containerWidth*windowZoom-Math.max(0,orderedIds.length-1)*28))/windowZoom;
  return {
    orderedIds,ready,maxDisplaySize,
    reserveHeight:ready?undefined:withoutEntering&&!moving?0:surfaceHeight,
    invisible:moving||withoutEntering||orderedIds.some(id=>errors.has(id)),
    hidden:!domAvailable&&layout.placement==='pinned'&&moving,
    canRenderHome:domAvailable||layout.placement==null||layout.placement==='home'||layout.placement==='pinned'&&moving,
    surfaceInset:containerWidth==null||maxDisplaySize==null?undefined:(containerWidth-maxDisplaySize)/2,
    frame(index){return {
      x:((layout.stackDisplayWidth??0)/windowZoom-containerWidth)/2-index*28/windowZoom,
      marginTop:index*22/windowZoom,
      zIndex:orderedIds.length-index,
    };},
  };
}
