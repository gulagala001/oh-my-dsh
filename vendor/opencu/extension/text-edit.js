const failure = (code, message) => { throw Object.assign(new Error(message), {code, details:{inputDispatched:false}}); };

export function validateTextEditRequest(operation, args) {
  if (typeof args.text !== 'string') failure('INVALID_ARGUMENT', `${operation} requires text`);
  if (operation === 'selectText') {
    if (args.elementId == null || !args.text) failure('INVALID_ARGUMENT', 'selectText requires an element ID and non-empty text');
    if (![undefined,'text','cursor_before','cursor_after'].includes(args.selectionType)) failure('INVALID_ARGUMENT', 'Invalid selectionType');
    for (const key of ['prefix','suffix']) if (args[key] !== undefined && typeof args[key] !== 'string') failure('INVALID_ARGUMENT', `${key} must be a string`);
  } else if (operation === 'paste') {
    if (args.format !== undefined && typeof args.format !== 'string') failure('INVALID_ARGUMENT', 'paste format must be a string');
    if (!['text','md'].includes(args.format ?? 'text')) failure('UNSUPPORTED_PASTE_FORMAT', 'Only text and md source insertion are supported; HTML/rich-text paste is unavailable');
  } else failure('UNSUPPORTED_ACTION', 'Unsupported text editing operation');
}

// Serialized into the verified element's own execution context. Offsets are UTF-16,
// matching DOM Range and setSelectionRange; no Unicode/whitespace normalization.
export function textEditDOM(request, phase, plan) {
  try {
    const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
    const element = this, doc = element?.ownerDocument;
    const inspect = () => {
      if (!element || element.nodeType !== 1 || !element.isConnected || !doc?.defaultView) fail('STALE_ELEMENT','The selected editable element is detached');
      if (element.matches(':disabled') || element.readOnly || element.closest('[inert], [aria-disabled="true"], [aria-readonly="true"]')) fail('ELEMENT_NOT_EDITABLE','The selected element is disabled or read-only');
      const control = element.tagName === 'TEXTAREA' || element.tagName === 'INPUT' && ['text','search','url','tel','password'].includes(element.type);
      if (!control && !element.isContentEditable) fail('ELEMENT_NOT_EDITABLE','Select an input, textarea, or contenteditable element');
      if (control && (typeof element.selectionStart !== 'number' || typeof element.selectionEnd !== 'number')) fail('ELEMENT_NOT_EDITABLE','This input type does not support text selection');
      let host = element;
      if (!control) while (host.parentElement?.isContentEditable) host = host.parentElement;
      const source = control ? element.value : element.textContent ?? '';
      return {control, host, source};
    };
    const active = () => {
      let node = element.getRootNode().activeElement ?? doc.activeElement;
      while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
      return node;
    };
    const selection = () => element.getRootNode().getSelection?.() ?? doc.defaultView.getSelection();
    const contains = node => node === element || element.contains(node);
    const readSelection = state => {
      if (state.control) return {start:element.selectionStart,end:element.selectionEnd};
      const selected = selection();
      if (!selected?.rangeCount) return null;
      const range = selected.getRangeAt(0);
      if (!contains(range.startContainer) || !contains(range.endContainer)) return null;
      const prefix = doc.createRange();prefix.selectNodeContents(element);prefix.setEnd(range.startContainer,range.startOffset);
      const start = prefix.toString().length;
      prefix.setEnd(range.endContainer,range.endOffset);
      return {start,end:prefix.toString().length};
    };
    const contentRange = (start,end) => {
      const nodes = [], walker = doc.createTreeWalker(element,4);
      let textNode;while ((textNode=walker.nextNode())) nodes.push(textNode);
      const endpoint = offset => {
        let remaining=offset;
        for (const node of nodes) {if (remaining<=node.length) return [node,remaining];remaining-=node.length;}
        if (!nodes.length && offset===0) return [element,0];
        fail('STALE_ELEMENT','Editable text changed before selection');
      };
      const range=doc.createRange();range.setStart(...endpoint(start));range.setEnd(...endpoint(end));
      for (const blocked of element.querySelectorAll('[contenteditable="false"], [inert], [aria-readonly="true"], [aria-disabled="true"], script, style')) {
        if (range.intersectsNode(blocked)) fail('ELEMENT_NOT_EDITABLE','The requested selection crosses non-editable content');
      }
      return range;
    };
    const setSelection = (state,start,end) => {
      if (state.control) {element.setSelectionRange(start,end);return;}
      const range=contentRange(start,end);
      const selected=selection();if (!selected) fail('ELEMENT_NOT_EDITABLE','No selection is available in this document');
      selected.removeAllRanges();selected.addRange(range);
    };
    let state=inspect();
    if (phase==='inspect') {
      if (request.operation==='paste') return {source:state.source};
      const matches=[];let from=0;
      while (from<=state.source.length) {
        const index=state.source.indexOf(request.text,from);if (index<0) break;
        const end=index+request.text.length;
        if ((request.prefix===undefined || state.source.slice(0,index).endsWith(request.prefix)) &&
            (request.suffix===undefined || state.source.slice(end).startsWith(request.suffix))) matches.push(index);
        if (matches.length>1) fail('AMBIGUOUS_TEXT','Text occurs more than once; provide a unique prefix or suffix');
        from=index+1;
      }
      if (!matches.length) fail('TEXT_NOT_FOUND','The requested text and context were not found in the selected element');
      const type=request.selectionType??'text',start=matches[0],end=start+request.text.length;
      const selectedStart=type==='cursor_after'?end:start,selectedEnd=type==='cursor_before'?start:end;
      if (!state.control) contentRange(selectedStart,selectedEnd);
      return {source:state.source,selectionType:type,start:selectedStart,end:selectedEnd};
    }
    if (state.source!==plan.source) fail('STALE_ELEMENT','Editable text changed before input; select again');
    if (phase==='focus') {
      state.host.focus({preventScroll:true});
      state=inspect();
      if (state.source!==plan.source || active()!==state.host) fail('STALE_ELEMENT','Focus or editable text changed before input');
      if (request.operation==='selectText') setSelection(state,plan.start,plan.end);
      else if (!readSelection(state)) setSelection(state,state.source.length,state.source.length);
      return readSelection(state);
    }
    if (phase!=='verify') fail('INVALID_ARGUMENT','Invalid text editing phase');
    if (active()!==state.host) fail('STALE_ELEMENT','The selected element lost focus before input');
    const selected=readSelection(state);
    if (!selected || selected.start!==plan.selection.start || selected.end!==plan.selection.end) fail('STALE_ELEMENT','The text selection changed before input');
    return {valid:true};
  } catch(error) {return {__opencuTextEditError:{code:error.code??'ELEMENT_NOT_EDITABLE',message:error.message}};}
}

/** Focus and select only the resolved node, with a validation fence at every await. */
export async function runTextEdit(send, operation, args, options={}) {
  validateTextEditRequest(operation,args);
  const request={operation,text:args.text,prefix:args.prefix,suffix:args.suffix,selectionType:args.selectionType};
  let objectId, focusAttempted=false;
  const unwrap = reply => {
    if (reply.exceptionDetails) failure('STALE_ELEMENT',reply.exceptionDetails.exception?.description??reply.exceptionDetails.text);
    const value=reply.result.value, error=value?.__opencuTextEditError;
    if (error) failure(error.code,error.message);
    return value;
  };
  const call = async (phase,plan) => {
    await options.validate?.();
    return unwrap(await send('Runtime.callFunctionOn',{objectId,functionDeclaration:textEditDOM.toString(),arguments:[{value:request},{value:phase},{value:plan??null}],returnByValue:true}));
  };
  try {
    await options.validate?.();
    if (options.backendNodeId!=null) ({object:{objectId}}=await send('DOM.resolveNode',{backendNodeId:options.backendNodeId,...options.contextId?{executionContextId:options.contextId}:{}}));
    else {
      const reply=await send('Runtime.evaluate',{expression:'(() => { let node=document.activeElement; while(node?.shadowRoot?.activeElement) node=node.shadowRoot.activeElement; return node; })()',...options.contextId?{contextId:options.contextId}:{}});
      if (reply.exceptionDetails) failure('STALE_ELEMENT','The active editable element is unavailable');
      objectId=reply.result.objectId;
    }
    if (!objectId) failure('ELEMENT_NOT_EDITABLE','Focus an editable element or provide its current element ID');
    const plan=await call('inspect');
    await options.validate?.();options.onFocus?.();focusAttempted=true;
    await options.beforeFocus?.();
    plan.selection=await call('focus',plan);
    if (!plan.selection) failure('ELEMENT_NOT_EDITABLE','The editable element has no text selection');
    const verify=()=>call('verify',plan);
    await verify();
    if (operation==='paste') {
      if (!options.insertText) failure('UNSUPPORTED_ACTION','This backend cannot insert text');
      await options.insertText(args.text,verify);
      return {pasted:true,format:args.format??'text'};
    }
    return {selected:true,selectionType:plan.selectionType,...plan.selection};
  } catch(error) {
    error.code??='STALE_ELEMENT';
    error.details={...error.details,inputDispatched:focusAttempted||error.details?.inputDispatched===true};
    throw error;
  } finally {if(objectId)await send('Runtime.releaseObject',{objectId}).catch(()=>{});}
}
