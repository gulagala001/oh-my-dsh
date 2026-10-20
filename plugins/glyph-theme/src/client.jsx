import React, { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import { glyphOwnership } from './shared/ownership.mjs';
import { createSurfaceMarkers } from './shared/surfaces.mjs';
import { createAttributeMarkers } from './shared/attribute-markers.mjs';
import { mountGlyphRenderer } from './theme/renderer.mjs';
import { GlyphBrand } from './theme/brand.jsx';
import layout from './theme/layout.css';
import skin from './theme/theme.json';

export const inject = ['slots', 'theme', 'configForms'];
const KEY = 'dsh.glyph.preferences.v1';
const aliases = { 'bg-base':'bg', 'bg-layer-1':'surface', 'bg-layer-2':'surface-solid', 'bg-layer-3':'surface-solid', 'label-primary':'text', 'label-primary-bluish':'text', 'label-secondary':'muted', 'label-tertiary':'muted', 'label-caption':'muted', 'brand-primary':'accent', 'brand-text':'accent', link:'accent', 'border-l1':'border', 'border-l2':'border', 'border-l3':'border', 'interactive-bg-hover':'hover', 'interactive-bg-active':'selected', 'button-primary-fill':'accent', 'button-primary-hover':'text', 'label-primary-foreground':'on-accent', 'markdown-code-block':'code-bg', 'markdown-inline-code':'code-bg', 'toast-bg':'surface-solid', 'tooltip-bg':'surface-solid' };
const paletteCss = ['common','light','dark'].map(mode => `html[data-glyph-owner="standalone"]${mode==='common'?'':`[data-appearance="${mode}"]`}{${Object.entries(skin.tokens[mode]).map(([key,value])=>`--omd-${key}:${value}`).join(';')}}`).join('\n');
const nativeCss = `html[data-glyph-owner="standalone"] body{--dsw-specific-sidebar-fill:var(--omd-bg);--dsw-specific-input-major:var(--omd-bg);--dsw-specific-menu:var(--omd-bg);--dsw-specific-selector:var(--omd-bg);--dsw-specific-bubble:transparent;--dsw-specific-sidebar-nav-item-active:transparent;font-family:var(--omd-font-ui);font-size:13px;color:var(--omd-text);background:var(--omd-bg)}html[data-glyph-owner="standalone"] [data-omd-surface="conversation"]{overflow:clip}html[data-glyph-owner="standalone"] [class*="_header"]{border-bottom-color:transparent}`;
export function apply(ctx) {
  const ownership=glyphOwnership(), listeners=new Set();
  let preferences={enabled:true,reduced:false}, state, release;
  const read=()=>{try {const s=JSON.parse(localStorage.getItem(KEY)||'{}');preferences={enabled:s.enabled!==false,reduced:s.reduced===true};}catch{preferences={enabled:true,reduced:false};}};
  const emit=()=>{state={...preferences,omd:ownership.hasOmd(),active:preferences.enabled&&!ownership.hasOmd()};for(const fn of listeners)fn();};
  const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
  function mount() {
    const root=document.documentElement;
    const names=['data-omd-layout','data-omd-skin','data-appearance','data-glyph-owner'];
    const previous=names.map(name=>[name,root.getAttribute(name)]);
    root.setAttribute('data-glyph-owner','standalone');root.setAttribute('data-omd-layout','glyph-motion');root.setAttribute('data-omd-skin','glyph-motion');
    const sync=()=>{root.dataset.appearance=ctx.theme.getTheme().active.colorScheme;};sync();
    const style=document.createElement('style');style.dataset.glyphStyles='standalone';style.textContent=paletteCss+'\n'+nativeCss+'\n'+layout;document.head.append(style);
    const disposeTokens=ctx.theme.overrideTokens('dsh-glyph-theme',Object.fromEntries(Object.entries(aliases).map(([alias,key])=>[`--dsw-alias-${alias}`,{light:`var(--omd-${key})`,dark:`var(--omd-${key})`}])));
    const offTheme=ctx.on('theme/change',sync),surfaces=createSurfaceMarkers(),nav=createAttributeMarkers('data-omd-nav-part');
    let pending;
    const refresh=()=>{pending=undefined;const {sidebar}=surfaces.refresh();const parts={logoRow:'brand',newSession:'create',panelList:'panels',panelRow:'panel',sectionLabel:'section-label',footArea:'footer'};const next=new Map();for(const el of sidebar?.querySelectorAll('[class]')||[]){const part=[...el.classList].map(c=>parts[c.slice(c.lastIndexOf('_')+1)]).find(Boolean);if(part)next.set(el,part);}nav.update(next);};
    const observer=new MutationObserver(()=>{if(pending===undefined)pending=requestAnimationFrame(refresh);});observer.observe(document.body,{childList:true,subtree:true});refresh();
    return()=>{observer.disconnect();cancelAnimationFrame(pending);nav.dispose();surfaces.dispose();offTheme();style.remove();disposeTokens();for(const[name,value]of previous){if(value===null)root.removeAttribute(name);else root.setAttribute(name,value);}};
  }
  function reconcile() {const active=preferences.enabled&&!ownership.hasOmd();if(active&&!release)release=mount();else if(!active&&release){release();release=undefined;}emit();}
  const save=next=>{localStorage.setItem(KEY,JSON.stringify(next));preferences=next;reconcile();};
  read();emit();
  ctx.effect(()=>{const off=ownership.subscribe(reconcile);const storage=e=>{if(e.key===KEY||e.key===null){read();reconcile();}};window.addEventListener('storage',storage);reconcile();return()=>{off();window.removeEventListener('storage',storage);release?.();release=undefined;};});
  function Layer(){const current=useSyncExternalStore(subscribe,()=>state),ref=useRef();useLayoutEffect(()=>{if(current.active&&ref.current)return mountGlyphRenderer(ref.current,{reduced:current.reduced});},[current.active,current.reduced]);return current.active?createPortal(<canvas className="omd-glyph-canvas" ref={ref} aria-hidden="true"/>,document.body):null;}
  ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'glyph-theme-renderer'},Layer));
  for(const name of ['conversation.hero.brand.mark','sidebar.brand.mark','sidebar.brand.name'])ctx.slots.inject(name,()=>{
    let dispose;const update=()=>{if(state.active&&!dispose)dispose=ctx.slots.register({name,id:'glyph-theme-whale',priority:-100},()=> name==='sidebar.brand.name'?<strong className="glyph-wordmark">DeepSeek Harness</strong>:<GlyphBrand small={name.startsWith('sidebar')}/>);else if(!state.active&&dispose){dispose();dispose=undefined;}};
    const off=subscribe(update);update();return()=>{off();dispose?.();};
  });
  function Settings(){const current=useSyncExternalStore(subscribe,()=>state),[error,setError]=useState('');if(current.omd)return <p>Glyph 已纳入外观管理，请在“外观”中切换主题和配色。</p>;
    const act=fn=>{try{fn();setError('');}catch(e){setError(e.message);}};
    return <section style={{padding:24,maxWidth:640}}><h2>Glyph · 动态字符</h2><p>黑白字符、DeepSeek 鲸鱼与交互波纹。明暗模式跟随 DSH 的通用设置。</p><p><Switch label="启用字符主题" checked={current.enabled} onChange={value=>act(()=>save({...preferences,enabled:value}))}/></p><p><Switch label="降低动态效果" checked={current.reduced} onChange={value=>act(()=>save({...preferences,reduced:value}))}/></p><p>关闭主题即可恢复 DSH 原生界面。HTML、图片、PDF 与代码文件内容保持原始呈现。</p>{error&&<p role="alert">{error}</p>}<Button variant="outline" size="sm" onClick={()=>act(()=>save({enabled:true,reduced:false}))}>恢复主题默认设置</Button></section>;
  }
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'glyph-theme',order:15,label:()=> 'Glyph 字符主题'},Settings));
}
