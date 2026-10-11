import React,{useId} from 'react';
import {CodexCuScope} from './codex-cu-scope.jsx';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {CodexCuButton} from './codex-cu-primitives.jsx';
import {CODEX_CU_COPY} from './codex-cu-copy.mjs';
const copy=id=>CODEX_CU_COPY[id]?.simplifiedChinese??CODEX_CU_COPY[id]?.english??'';

// app-shared s0i + UYi/RYi/zYi/BYi/VYi. The host owns placement and results.
// Boolean found/wrapped from OpenCU must never fabricate a match count.
export function BrowserFindBar({inputRef,query,onQueryChange,onNext,onPrevious,onClose,onCompositionStart,onCompositionEnd,ready,composing,isLoading,failed,matches,activeMatchOrdinal}){
  const id=useId(),hasQuery=!!query.trim(),countKnown=Number.isFinite(matches),missing=countKnown&&matches===0;
  let result=failed?copy('codex.threadFindBar.unavailable'):missing?copy('codex.threadFindBar.noResults'):countKnown&&hasQuery&&Number.isFinite(activeMatchOrdinal)?copy('codex.threadFindBar.results').replace('{active}',String(activeMatchOrdinal)).replace('{matches}',String(matches)):null;
  return <CodexCuScope as="div" className="tx-cu-browser-find" role="search" aria-label={copy('codex.threadFindBar.label.browser')}>
    <div className="tx-cu-browser-find-input"><CodexCuIcon name="shared:Jx"/><input ref={inputRef} id={id} type="text" data-codex-find-input="true" autoFocus value={query} aria-label={copy('codex.threadFindBar.label.browser')} placeholder={copy('codex.threadFindBar.placeholder.browser')} aria-busy={isLoading||undefined} onChange={event=>onQueryChange(event.target.value)} onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}else if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();event.shiftKey?onPrevious():onNext();}}}/></div>
    <div className="tx-cu-browser-find-close"><span aria-hidden="true"/><CodexCuButton size="icon" uniform color="ghost" className="tx-cu-browser-find-close-button" aria-label={copy('codex.threadFindBar.close')} onClick={onClose}><CodexCuIcon name="shared:Vot"/></CodexCuButton></div>
    <div className={'tx-cu-browser-find-navigation'+(hasQuery?' is-visible':'')}><div><CodexCuButton size="icon" uniform color="ghost" className="tx-cu-browser-find-step" aria-label={copy('codex.threadFindBar.previousResult')} disabled={!ready||!hasQuery||composing||missing} onClick={onPrevious}><CodexCuIcon name="shared:eht"/></CodexCuButton><CodexCuButton size="icon" uniform color="ghost" className="tx-cu-browser-find-step" aria-label={copy('codex.threadFindBar.nextResult')} disabled={!ready||!hasQuery||composing||missing} onClick={onNext}><CodexCuIcon name="shared:eht" style={{transform:'rotate(180deg)'}}/></CodexCuButton></div></div>
    <span className={'tx-cu-browser-find-result'+(hasQuery||failed?' is-visible':'')} role="status">{result}</span>
  </CodexCuScope>;
}
