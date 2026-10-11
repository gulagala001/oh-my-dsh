import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {CodexDetachedWindow} from './codex-detached-window.jsx';
import tokenCss from './codex-cu-tokens.css';
import primitiveCss from './codex-cu-primitives.css';
import overlayCss from './codex-cu-overlay.css';
import typographyCss from './codex-cu-typography.css';
import detachedCss from './codex-detached-window.css';

// entry-379a0807e3f8 B/F. This root belongs to the plugin browser companion;
// browser pixels remain in its actual WebContentsView, never in a capture image.
export async function initializeCodexDetachedBrowserWindow({
  service=window.opencuBrowserDetached,root=document.getElementById('root'),
}={}) {
  if(!root||!service)throw new Error('Detached browser service is unavailable');
  for(const method of ['getContentKind','getRequest','focusSource','setAlwaysOnTop','restore','subscribeChromeState','setContentBounds']) {
    if(typeof service[method]!=='function')throw new Error(`Detached browser service lacks ${method}`);
  }
  const kind=await service.getContentKind(),request=await service.getRequest();
  if(kind!=='browser'||request?.content?.kind!==kind||request?.detached?.contentKind!=='browser'
    ||typeof request.detached.id!=='string'||!request.detached.id
    ||!Number.isSafeInteger(request.detached.windowId)||request.detached.windowId<=0
    ||!Number.isSafeInteger(request.detached.sourceWindowId)||request.detached.sourceWindowId<=0) {
    throw new Error('Detached browser renderer does not own its content');
  }
  const detachedId=request.detached.id;
  const style=document.createElement('style');style.dataset.opencuDetachedBrowser='';
  style.textContent=[tokenCss,primitiveCss,overlayCss,typographyCss,detachedCss].join('\n');document.head.append(style);
  document.documentElement.dataset.codexWindowType='electron';
  const renderer=createRoot(root);
  const content={current:null};
  let chromeState=request,disposed=false,resizeFrame,unsubscribe,appearanceKeys=[];
  let lastBounds='',pendingBounds=Promise.resolve();
  const recordAction=action=>{try{Promise.resolve(service.recordTitleBarAction?.(action)).catch(()=>{});}catch{}};
  const render=()=>{
    if(disposed)return;
    const chrome=chromeState.chrome??request.chrome??{},appearance=chrome.appearance;
    document.documentElement.lang=chrome.locale??'zh-CN';document.documentElement.dir=chrome.direction??'ltr';
    for(const key of appearanceKeys)document.documentElement.style.removeProperty(key);
    appearanceKeys=[];
    if(appearance?.variables)for(const [key,value] of Object.entries(appearance.variables)) {
      if(key.startsWith('--')&&typeof value==='string'){document.documentElement.style.setProperty(key,value);appearanceKeys.push(key);}
    }
    if(appearance?.variant)document.documentElement.dataset.theme=appearance.variant;
    flushSync(()=>renderer.render(<CodexDetachedWindow title={chromeState.title??request.title} chrome={chrome}
      contentRef={content} platform={request.platform??'unknown'} locale={chrome.locale??'zh-CN'}
      referenceWindowType="electron" theme={appearance?.variant} windowZoom={chromeState.windowZoom}
      typographyPreset={appearance?.typographyPreset} alwaysOnTop={chromeState.alwaysOnTop??null}
      onFocusSource={async()=>{
        const result=await service.focusSource();
        if(typeof result!=='boolean')throw new Error('Invalid detached browser focus result');
        return result;
      }} onSetAlwaysOnTop={async value=>{
        const result=await service.setAlwaysOnTop(value);
        if(typeof result!=='boolean')throw new Error('Invalid detached browser window-order result');
        return result;
      }}
      onRestore={async()=>{
        const result=await service.restore();
        if(!['moved','closed','not-moved'].includes(result))throw new Error('Invalid detached browser restore result');
        return result!=='not-moved';
      }} onAction={recordAction}/>));
  };
  const publishBounds=()=>{
    if(disposed||!content.current)return pendingBounds;
    const rect=content.current.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return pendingBounds;
    const bounds={x:rect.x,y:rect.y,width:rect.width,height:rect.height},key=JSON.stringify(bounds);
    if(key===lastBounds)return pendingBounds;
    lastBounds=key;
    // Main converts these real CSS pixels using this renderer's actual zoom.
    pendingBounds=pendingBounds.catch(()=>{}).then(async()=>{
      if(disposed)return;
      if(await service.setContentBounds(bounds)!==true){lastBounds='';throw new Error('Detached browser content could not be attached');}
    });
    return pendingBounds;
  };
  const scheduleBounds=()=>{
    cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>{void publishBounds().catch(()=>window.close());});
  };
  const observer=new ResizeObserver(scheduleBounds);
  const dispose=()=>{
    if(disposed)return;disposed=true;
    cancelAnimationFrame(resizeFrame);observer.disconnect();unsubscribe?.();
    window.removeEventListener('resize',scheduleBounds);window.removeEventListener('pagehide',dispose);
    renderer.unmount();style.remove();
  };
  try {
    render();observer.observe(content.current);window.addEventListener('resize',scheduleBounds);
    unsubscribe=service.subscribeChromeState(value=>{
      if(disposed)return;
      if(value?.detached&&value.detached.id!==detachedId){dispose();window.close();return;}
      chromeState={...chromeState,...value};render();scheduleBounds();
    });
    if(typeof unsubscribe!=='function')throw new Error('Detached browser subscription did not return a disposer');
    await publishBounds();window.addEventListener('pagehide',dispose,{once:true});return dispose;
  } catch(error) {dispose();throw error;}
}

// The original detached bootstrap closes a window whose renderer cannot initialize.
void initializeCodexDetachedBrowserWindow().catch(()=>window.close());
