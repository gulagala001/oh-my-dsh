export function annotationSiteControlDefaultValue(control){
  return control.defaultValue??control.currentValue??(control.type==='color'?'#ffffff':control.type==='select'?control.options[0].value:control.type==='range'?control.min:false);
}

export function annotationSiteControlValue(control,changes=[]){
  return changes.find(change=>change.callback===control.callback)?.value??control.currentValue??annotationSiteControlDefaultValue(control);
}

export function annotationSiteControlResetValue(control,change){return change?.previousValue??annotationSiteControlDefaultValue(control);}

// Card Yr: saving compares the original previousValue directly. It does not
// replace an absent previousValue with the preview engine's default fallback.
export function annotationSiteControlDraftChanges(group,baselineGroup=null){
  const previous=new Map((baselineGroup?.annotationControlChanges??[]).map(change=>[change.callback,change]));
  return(group.annotationControlChanges??[]).flatMap(change=>{const baseline=previous.get(change.callback),previousValue=baseline==null?change.previousValue:baseline.previousValue;return change.value===previousValue?[]:[{callback:change.callback,previousValue,value:change.value}];});
}

export function hasAnnotationSiteControlChanges(group,baselineGroup=null){return annotationSiteControlDraftChanges(group,baselineGroup).length>0;}

export function hasAnnotationSiteControlPreviewChanges(group){
  return(group.annotationControlChanges??[]).some(change=>{const control=group.annotationControls?.controls.find(item=>item.callback===change.callback);return control!=null&&change.value!==annotationSiteControlResetValue(control,change);});
}

// design-editor-state Se (Xt in the card): actual registration currentValue,
// not defaultValue or a renderer-provided old value, freezes the baseline.
export function updateAnnotationSiteControlChanges(group,callback,value){
  const control=group.annotationControls?.controls.find(item=>item.callback===callback);if(!control)return group;
  const changes=group.annotationControlChanges??[],existing=changes.find(item=>item.callback===callback),previousValue=existing==null?control.currentValue:existing.previousValue;
  const next={callback,previousValue,value:value??previousValue??annotationSiteControlDefaultValue(control)};
  return{...group,annotationControlChanges:existing==null?[...changes,next]:changes.map(change=>change.callback===callback?next:change)};
}


export function sanitizeAnnotationSiteControls(value){
  const cleanString=value=>typeof value==='string'&&value.length<=512&&/^[^\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]*$/u.test(value);
  const label=value=>{if(!cleanString(value))throw TypeError('Invalid control label');const result=value.trim();if(!result.length||result.length>80)throw TypeError('Invalid control label');return result;};
  const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=-10000&&value<=10000;
  const scalar=value=>cleanString(value)||number(value)||typeof value==='boolean';
  const optional=(source,result,key,valid)=>{if(source[key]!==undefined){if(!valid(source[key]))throw TypeError('Invalid control '+key);result[key]=source[key];}};
  const parseControl=value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw TypeError('Invalid annotation control');
    if(typeof value.callback!=='string')throw TypeError('Invalid control callback');const callback=value.callback.trim();
    if(!callback.length||callback.length>80||!/^[A-Za-z][A-Za-z0-9_-]*$/.test(callback))throw TypeError('Invalid control callback');
    const result={callback,label:label(value.label),type:value.type};
    optional(value,result,'reference',item=>typeof item==='string'&&item.length>0&&item.length<=80&&/^[A-Za-z0-9_./:@$#-]+$/.test(item));
    let valid;
    switch(value.type){
      case'color':valid=item=>cleanString(item)&&/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(item);break;
      case'toggle':valid=item=>typeof item==='boolean';break;
      case'range':
        if(!number(value.min)||!number(value.max)||typeof value.step!=='number'||!Number.isFinite(value.step)||value.step<.001||value.step>10000||value.min>=value.max||value.step>value.max-value.min)throw TypeError('Invalid control range');
        Object.assign(result,{min:value.min,max:value.max,step:value.step});valid=item=>number(item)&&item>=value.min&&item<=value.max;break;
      case'select':{
        if(!Array.isArray(value.options)||!value.options.length||value.options.length>12)throw TypeError('Invalid control options');
        result.options=value.options.map(item=>{if(!item||typeof item!=='object'||!cleanString(item.value))throw TypeError('Invalid control option');return{label:label(item.label),value:item.value};});
        const values=new Set(result.options.map(item=>item.value));if(values.size!==result.options.length)throw TypeError('Duplicate control options');valid=item=>cleanString(item)&&values.has(item);break;
      }
      default:throw TypeError('Invalid annotation control type');
    }
    optional(value,result,'currentValue',valid);optional(value,result,'defaultValue',valid);return result;
  };
  const parseRegistration=(value,partial=false)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw TypeError('Invalid annotation controls');const result={};
    if(value.controls!==undefined){
      if(!Array.isArray(value.controls)||value.controls.length>12)throw TypeError('Invalid annotation controls');result.controls=value.controls.map(parseControl);
      if(new Set(result.controls.map(item=>item.callback)).size!==result.controls.length)throw TypeError('Duplicate control callbacks');
    }else if(!partial)throw TypeError('Missing annotation controls');
    if(value.controlsHeading!==undefined)result.controlsHeading=label(value.controlsHeading);
    if(value.controlsMode!==undefined){if(!['extend','replace'].includes(value.controlsMode))throw TypeError('Invalid annotation controls mode');result.controlsMode=value.controlsMode;}
    return result;
  };
  return parseRegistration(value);
}

// Kd: a main-world factory. All dependencies are arguments so Electron can
// serialize the function without exposing the preload's private state.
export function installAnnotationSiteAPI(hooks={}){
  let nextId=0,disposed=false;
  const activeGesture=()=>navigator.userActivation?.isActive===true;
  const own=(value,key)=>{try{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;}catch{return undefined;}};
  const controlsAction=(type,detail)=>{
    if(disposed||!['register','update','dispose'].includes(type))return false;
    const accepted=!window.dispatchEvent(new CustomEvent('codex:'+type+'-annotation-controls',{cancelable:true,detail}));
    if(accepted&&type!=='dispose')hooks.recordControls?.();return accepted;
  };
  const serializeControls=value=>{
    if(typeof value!=='object'||!value)throw TypeError('Invalid annotation controls');
    const json=JSON.stringify({controls:value.controls,controlsHeading:value.controlsHeading,controlsMode:value.controlsMode},(key,item)=>{
      if(['function','symbol','bigint'].includes(typeof item))throw TypeError('Annotation controls must contain only data');return item;
    });
    if(json.length>16384)throw RangeError('Annotation controls exceed the maximum size');return json;
  };
  const targets=value=>{
    if(!(value instanceof Element)&&(value==null||typeof value[Symbol.iterator]!=='function'))throw TypeError('Annotation controls require element targets');
    const found=new Set();let count=0;
    for(const node of value instanceof Element?[value]:value){
      if(++count>128)throw RangeError('Too many annotation control targets');
      if(!(node instanceof Element)||node.ownerDocument!==document)throw TypeError('Annotation control targets must belong to this document');found.add(node);
    }return[...found];
  };
  const path=(node,ancestor)=>{const indices=[];for(let current=node;current!==ancestor;){const parent=current.parentNode;if(parent==null||indices.length>=128)return null;indices.unshift(Array.from(parent.childNodes).findIndex(child=>child===current));current=parent;}return indices;};
  const api={
    toggle(value){
      if(disposed||value!==undefined&&typeof value!=='boolean'||!activeGesture()||typeof hooks.toggle!=='function')return{accepted:false};
      const accepted=hooks.toggle(value)===true;hooks.recordFeature?.('mode-toggle',accepted);return{accepted};
    },
    isActive(){return!disposed&&typeof hooks.isActive==='function'&&hooks.isActive()===true;},
    request(target,options={}){
      if(typeof options!=='object'||!options||disposed||!activeGesture()||!(target instanceof Element)&&!(target instanceof Range))return{accepted:false};
      const range=target instanceof Range?target:undefined,ancestor=range?range.commonAncestorContainer:target,node=ancestor instanceof Element?ancestor:ancestor.parentElement;
      if(node==null||node.ownerDocument!==document||!node.isConnected||range?.collapsed)return{accepted:false};
      const root=node.getRootNode();if(range&&root instanceof ShadowRoot&&root.mode==='closed')return{accepted:false};
      const startPath=range?path(range.startContainer,node):undefined,endPath=range?path(range.endContainer,node):undefined,rangeText=range?.toString();
      if(range&&(startPath==null||endPath==null||rangeText==null||!rangeText.trim().length||rangeText.length>20000))return{accepted:false};
      const comment=own(options,'initialComment'),initialComment=typeof comment==='string'&&comment.length<=240?comment:undefined;
      const mode=own(options,'mode')==='advanced'?'advanced':'default',enterAnnotationMode=own(options,'enterAnnotationMode')===true;
      let metadata;
      try{
        const value=own(options,'metadata');if(value&&typeof value==='object'){
          const prototype=Object.getPrototypeOf(value),properties=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(properties),items=[];
          if((prototype===Object.prototype||prototype===null)&&keys.length<=6){
            let valid=true;for(const key of keys){const property=properties[key],item=property.value;
              if(typeof key!=='string'||key.length>64||!/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z0-9_-]+)*$/.test(key)||['__proto__','constructor','prototype'].includes(key)||!property.enumerable||!Object.hasOwn(property,'value')||item===undefined||item!=null&&typeof item!=='string'&&typeof item!=='boolean'&&(typeof item!=='number'||!Number.isFinite(item))||typeof item==='string'&&(item.length>256||!/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(item))){valid=false;break;}items.push([key,item]);
            }if(valid&&items.length){const result=Object.fromEntries(items),json=JSON.stringify(result);if(json.length<=2048&&new TextEncoder().encode(json).byteLength<=2048)metadata=result;}
          }
        }
      }catch{}
      if(range||root!==document)metadata=undefined;
      const accepted=!node.dispatchEvent(new CustomEvent('codex:open-annotation',{bubbles:true,cancelable:true,composed:true,detail:{mode,enterAnnotationMode,metadata,initialComment,range:range?{startPath,endPath,startOffset:range.startOffset,endOffset:range.endOffset,rangeText}:undefined}}));
      hooks.recordFeature?.(initialComment?.trim()?'requests-with-prompts':'requests',accepted);
      if(metadata)hooks.recordFeature?.('metadata',accepted);
      hooks.recordRequest?.(metadata,initialComment,accepted);return{accepted};
    },
    registerControls(value){
      if(typeof value!=='object'||!value)throw TypeError('Invalid annotation controls registration');
      const nodes=targets(value.targets);if(!nodes.length)throw TypeError('Annotation controls require element targets');
      const payload=serializeControls(value),id=String(++nextId);if(!controlsAction('register',{id,payload,targets:nodes}))throw TypeError('Invalid annotation controls registration');
      let closed=false;return Object.freeze({
        update(next){if(closed)throw TypeError('Annotation controls have been disposed');const payload=serializeControls(next),nodes=next.targets;if(!controlsAction('update',{id,payload,targets:nodes===undefined?undefined:targets(nodes)}))throw TypeError('Invalid annotation controls update');},
        dispose(){if(!closed){closed=true;controlsAction('dispose',{id});}}
      });
    }
  };
  const restore=(object,key,value,descriptor)=>{if(Reflect.getOwnPropertyDescriptor(object,key)?.value===value){if(descriptor==null)Reflect.deleteProperty(object,key);else Reflect.defineProperty(object,key,descriptor);}};
  try{
    const previousOai=Reflect.get(document,'oai');if(previousOai!=null&&!['object','function'].includes(typeof previousOai))return null;
    const oai=previousOai??{},previousAnnotation=Reflect.get(oai,'annotation');if(previousAnnotation!=null&&!['object','function'].includes(typeof previousAnnotation))return null;
    const annotation=previousAnnotation??{},oaiDescriptor=Reflect.getOwnPropertyDescriptor(document,'oai'),annotationDescriptor=Reflect.getOwnPropertyDescriptor(oai,'annotation'),owned=[];
    // OpenCU installs registerSurface first. Keep that object and every
    // pre-existing member; cleanup only removes methods still owned by us.
    for(const [key,value]of Object.entries(api))if(!Reflect.has(annotation,key)){
      const descriptor=Reflect.getOwnPropertyDescriptor(annotation,key);if(Reflect.defineProperty(annotation,key,{configurable:true,enumerable:false,value}))owned.push({key,value,descriptor});
    }
    if(previousAnnotation==null&&!Reflect.defineProperty(oai,'annotation',{configurable:true,enumerable:false,value:annotation})||previousOai==null&&!Reflect.defineProperty(document,'oai',{configurable:true,enumerable:false,value:oai})){
      for(const item of owned)restore(annotation,item.key,item.value,item.descriptor);return null;
    }
    return()=>{disposed=true;try{for(const item of owned)restore(annotation,item.key,item.value,item.descriptor);if(previousAnnotation==null&&!Reflect.ownKeys(annotation).length)restore(oai,'annotation',annotation,annotationDescriptor);if(previousOai==null&&!Reflect.ownKeys(oai).length)restore(document,'oai',oai,oaiDescriptor);}catch{}};
  }catch{return null;}
}
// Electron does not preserve CustomEvent.detail between its DOM worlds.
// hf lives in main world; jg lives in private preload world. Only minimal
// callback events cross the server bridge, never user groups or comments.
export function installAnnotationSiteControlsReceiver({token,registrationToken,role='projection'}={}){
  if(typeof token!=='string'||!token)throw TypeError('Missing private annotation preload identity');
  if(!['projection','registration'].includes(role)||role==='projection'&&(typeof registrationToken!=='string'||!registrationToken||registrationToken===token))throw TypeError('Missing annotation registration identity');
  const symbol=Symbol.for('opencu.annotation.site-controls.preload');
  if(Object.hasOwn(globalThis,symbol))throw TypeError('Annotation controls receiver is already installed');
  const doc=document,win=window,registrations=new Map(),remembered=new Map(),featureUses=new Set(),pendingActions=new Map();let byNode=new WeakMap(),targetCount=0,order=0,disposed=false,lastRemembered=null,applied=new Map(),nextAction=0,hostAnnotationState={canUseSiteAnnotationApi:false,isAgentControllingBrowser:false,interactionMode:'browse',connected:false};
  const own=(value,key)=>{const property=Object.getOwnPropertyDescriptor(value,key);return property&&Object.hasOwn(property,'value')?property.value:undefined;};
  const eventDetail=event=>event instanceof CustomEvent&&event.detail&&typeof event.detail==='object'?event.detail:undefined;
  const cleanString=value=>typeof value==='string'&&value.length<=512&&/^[^\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]*$/u.test(value);
  const label=value=>{if(!cleanString(value))throw TypeError('Invalid control label');const result=value.trim();if(!result.length||result.length>80)throw TypeError('Invalid control label');return result;};
  const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=-10000&&value<=10000;
  const scalar=value=>cleanString(value)||number(value)||typeof value==='boolean';
  const optional=(source,result,key,valid)=>{if(source[key]!==undefined){if(!valid(source[key]))throw TypeError('Invalid control '+key);result[key]=source[key];}};
  const parseControl=value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw TypeError('Invalid annotation control');
    if(typeof value.callback!=='string')throw TypeError('Invalid control callback');const callback=value.callback.trim();
    if(!callback.length||callback.length>80||!/^[A-Za-z][A-Za-z0-9_-]*$/.test(callback))throw TypeError('Invalid control callback');
    const result={callback,label:label(value.label),type:value.type};
    optional(value,result,'reference',item=>typeof item==='string'&&item.length>0&&item.length<=80&&/^[A-Za-z0-9_./:@$#-]+$/.test(item));
    let valid;
    switch(value.type){
      case'color':valid=item=>cleanString(item)&&/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(item);break;
      case'toggle':valid=item=>typeof item==='boolean';break;
      case'range':
        if(!number(value.min)||!number(value.max)||typeof value.step!=='number'||!Number.isFinite(value.step)||value.step<.001||value.step>10000||value.min>=value.max||value.step>value.max-value.min)throw TypeError('Invalid control range');
        Object.assign(result,{min:value.min,max:value.max,step:value.step});valid=item=>number(item)&&item>=value.min&&item<=value.max;break;
      case'select':{
        if(!Array.isArray(value.options)||!value.options.length||value.options.length>12)throw TypeError('Invalid control options');
        result.options=value.options.map(item=>{if(!item||typeof item!=='object'||!cleanString(item.value))throw TypeError('Invalid control option');return{label:label(item.label),value:item.value};});
        const values=new Set(result.options.map(item=>item.value));if(values.size!==result.options.length)throw TypeError('Duplicate control options');valid=item=>cleanString(item)&&values.has(item);break;
      }
      default:throw TypeError('Invalid annotation control type');
    }
    optional(value,result,'currentValue',valid);optional(value,result,'defaultValue',valid);return result;
  };
  const parseRegistration=(value,partial=false)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw TypeError('Invalid annotation controls');const result={};
    if(value.controls!==undefined){
      if(!Array.isArray(value.controls)||value.controls.length>12)throw TypeError('Invalid annotation controls');result.controls=value.controls.map(parseControl);
      if(new Set(result.controls.map(item=>item.callback)).size!==result.controls.length)throw TypeError('Duplicate control callbacks');
    }else if(!partial)throw TypeError('Missing annotation controls');
    if(value.controlsHeading!==undefined)result.controlsHeading=label(value.controlsHeading);
    if(value.controlsMode!==undefined){if(!['extend','replace'].includes(value.controlsMode))throw TypeError('Invalid annotation controls mode');result.controlsMode=value.controlsMode;}
    return result;
  };
  const payload=(json,previous)=>{
    if(typeof json!=='string'||json.length>16384)return undefined;
    try{const value=JSON.parse(json);return parseRegistration(previous?{...previous,...parseRegistration(value,true)}:value);}catch{return undefined;}
  };
  const inComments=node=>{const root=doc.getElementById('codex-browser-sidebar-comments-root');return root!=null&&(root===node||root.contains(node)||root.shadowRoot?.contains(node)===true);};
  const targets=value=>{
    if(!Array.isArray(value)||!Number.isSafeInteger(value.length)||value.length>128)return undefined;const found=new Set();
    for(let index=0;index<value.length;index++){const node=own(value,String(index));if(!(node instanceof Element)||node.ownerDocument!==doc||inComments(node))return undefined;found.add(node);}return found;
  };
  const add=(registration,nodes)=>{registration.targets=Array.from(nodes,node=>new WeakRef(node));targetCount+=nodes.size;for(const node of nodes){let values=byNode.get(node);if(!values)byNode.set(node,[registration]);else{values.push(registration);values.sort((a,b)=>a.order-b.order);}}};
  const remove=registration=>{targetCount-=registration.targets.length;for(const reference of registration.targets){const node=reference.deref(),values=node&&byNode.get(node);if(!values)continue;const index=values.indexOf(registration);if(index!==-1)values.splice(index,1);if(!values.length)byNode.delete(node);}};
  const register=event=>{try{
    if(disposed)return;const detail=eventDetail(event);if(!detail)return;
    const id=own(detail,'id');if(typeof id!=='string'||!id.length||id.length>80||registrations.has(id)||registrations.size>=64)return;
    const controls=payload(own(detail,'payload')),nodes=targets(own(detail,'targets'));if(!controls||!nodes?.size||registrations.has(id)||registrations.size>=64||targetCount+nodes.size>1024)return;
    const registration={id,controls,order:order++,targets:[]};registrations.set(id,registration);add(registration,nodes);featureUses.add('controls');event.preventDefault();
  }catch{}};
  const update=event=>{try{
    if(disposed)return;const detail=eventDetail(event);if(!detail)return;const id=own(detail,'id'),registration=typeof id==='string'&&registrations.get(id);if(!registration)return;
    const supplied=own(detail,'targets'),nodes=supplied===undefined?undefined:targets(supplied);if(supplied!==undefined&&!nodes||registrations.get(id)!==registration)return;
    const controls=payload(own(detail,'payload'),registration.controls);if(!controls||nodes&&targetCount-registration.targets.length+nodes.size>1024)return;
    registration.controls=controls;if(nodes){remove(registration);add(registration,nodes);}featureUses.add('controls');event.preventDefault();
  }catch{}};
  const unregister=event=>{try{if(disposed)return;const detail=eventDetail(event);if(!detail)return;const id=own(detail,'id'),registration=typeof id==='string'&&registrations.get(id);if(!registration)return;registrations.delete(id);remove(registration);event.preventDefault();}catch{}};
  const featureUse=event=>{if(!disposed&&typeof event.detail==='string'&&['mode-toggle','requests','requests-with-prompts','metadata'].includes(event.detail))featureUses.add(event.detail);};
  const fallback=control=>control.defaultValue??control.currentValue??(control.type==='color'?'#ffffff':control.type==='select'?control.options[0].value:control.type==='range'?control.min:false);
  const samePage=(left,right)=>{let a,b;try{a=new URL(left);b=new URL(right);}catch{return left===right;}return['http:','https:'].includes(a.protocol)&&['http:','https:'].includes(b.protocol)?a.origin===b.origin&&a.pathname===b.pathname&&a.search===b.search:a.protocol==='file:'&&b.protocol==='file:'?a.pathname===b.pathname&&a.search===b.search:left===right;};
  const frameDocument=path=>{let current=doc;try{for(const selector of path){const parts=selector.startsWith('shadow:')?selector.slice(7).split('>>>'):[selector];let root=current,node;for(let index=0;index<parts.length;index++){node=root.querySelector(parts[index]);if(!(node instanceof current.defaultView.HTMLElement))return null;if(index<parts.length-1){if(!node.shadowRoot)return null;root=node.shadowRoot;}}if(!(node instanceof current.defaultView.HTMLIFrameElement)||!node.contentWindow)return null;current=node.contentWindow.document;}return current;}catch{return null;}};
  const dispatch=(node,value,groupId,results)=>{
    if(!node.isConnected&&value.action!=='reset'){results.push({groupId,callback:value.callback,action:value.action,dispatched:false,conflict:'target-disconnected'});return;}
    const actionId=++nextAction;pendingActions.set(actionId,{node,value});results.push({groupId,callback:value.callback,action:value.action,value:value.value,...value.virtualTarget?{virtualTarget:{...value.virtualTarget}}:{},actionId,dispatched:false,pending:true});
  };
  const clearProjection=()=>{const results=[],previous=applied;applied=new Map();remembered.clear();lastRemembered=null;for(const [node,changes]of previous)for(const value of changes.values())dispatch(node,{...value,value:value.resetValue,action:'reset'},value.groupId,results);return results;};
  const controller={
    setHostAnnotationState(value){
      if(role!=='projection'||disposed||!value||!['canUseSiteAnnotationApi','isAgentControllingBrowser','connected'].every(key=>typeof value[key]==='boolean')||!['browse','comment'].includes(value.interactionMode))return false;
      hostAnnotationState={canUseSiteAnnotationApi:value.canUseSiteAnnotationApi,isAgentControllingBrowser:value.isAgentControllingBrowser,interactionMode:value.interactionMode,connected:value.connected};return true;
    },
    isHostAnnotationActive(){return role==='projection'&&!disposed&&hostAnnotationState.canUseSiteAnnotationApi===true&&hostAnnotationState.interactionMode==='comment';},
    requestModeToggle(force){
      if(role!=='projection'||disposed||force!==undefined&&typeof force!=='boolean'||!hostAnnotationState.connected||!hostAnnotationState.canUseSiteAnnotationApi||hostAnnotationState.isAgentControllingBrowser||navigator.userActivation?.isActive!==true||globalThis.isSecureContext!==true||win.top!==win)return false;
      return!win.dispatchEvent(new CustomEvent('opencu:annotation-mode-request',{cancelable:true,detail:JSON.stringify(force===undefined?{}:{force})}));
    },
    recordSiteUse(feature,accepted){
      if(role!=='projection'||disposed||!['mode-toggle','requests','requests-with-prompts','metadata'].includes(feature)||typeof accepted!=='boolean'||!accepted&&hostAnnotationState.canUseSiteAnnotationApi||navigator.userActivation?.isActive!==true||globalThis.isSecureContext!==true||win.top!==win)return false;
      win.dispatchEvent(new CustomEvent('opencu:annotation-feature-use',{detail:feature}));return true;
    },
    getFeatureUses(){return disposed?[]:[...featureUses];},
    recordUse(feature){if(!disposed&&['mode-toggle','requests','requests-with-prompts','metadata'].includes(feature))featureUses.add(feature);},
    getTargets(){const result=new Set();if(!disposed)for(const registration of registrations.values())for(const reference of registration.targets){const node=reference.deref();if(node instanceof HTMLElement&&node.isConnected&&node.ownerDocument===doc)result.add(node);}return[...result];},
    getControls(node){return!disposed&&node.ownerDocument===doc?byNode.get(node)?.at(-1)?.controls:undefined;},
    getControlsJSON(node){const controls=controller.getControls(node);return controls===undefined?null:JSON.stringify(controls);},
    dispatchControlChange(node,value){
      if(disposed||!(node instanceof Element)||node.ownerDocument!==doc||!value||!['preview','preview-original','reset'].includes(value.action)||typeof value.callback!=='string'||value.callback.length>80||!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value.callback)||!scalar(value.value)||!node.isConnected&&value.action!=='reset')return false;
      const virtualTarget=value.virtualTarget;if(virtualTarget&&['surfaceId','targetId'].some(key=>typeof virtualTarget[key]!=='string'||!virtualTarget[key].length||virtualTarget[key].length>128))return false;
      node.dispatchEvent(new CustomEvent('oaiannotationcontrolchange',{bubbles:true,detail:{callback:value.callback,value:value.value,action:value.action,...virtualTarget?{virtualTarget:{surfaceId:virtualTarget.surfaceId,targetId:virtualTarget.targetId}}:{}}}));return true;
    },
    getDispatchTarget(actionId){return pendingActions.get(actionId)?.node??null;},
    completeDispatch(actionId){return pendingActions.delete(actionId);},
    rememberTarget(id,node){if(disposed||typeof id!=='string'||!id||!(node instanceof Element)||node.ownerDocument!==doc||!node.isConnected)return false;if(!remembered.has(id))remembered.set(id,new WeakRef(node));lastRemembered=id;return true;},
    syncProjection(groups,{canUseSiteAnnotationApi,isAgentControllingBrowser=false,enabled=true,showOriginal=false}={}){
      if(disposed||canUseSiteAnnotationApi!==true||isAgentControllingBrowser)return{dispatched:clearProjection(),conflicts:[]};
      const desired=new Map(),results=[],conflicts=[],ids=new Set(groups.map(group=>group.id));
      for(const id of remembered.keys())if(id!==lastRemembered&&!ids.has(id))remembered.delete(id);
      for(const group of groups){
        const node=remembered.get(group.id)?.deref(),anchor=group.anchor;
        if(!node?.isConnected||!anchor||!samePage(anchor.pageUrl,win.location.href)||!Array.isArray(anchor.framePath)||frameDocument(anchor.framePath)!==node.ownerDocument||anchor.frameUrl!=null&&!samePage(anchor.frameUrl,node.ownerDocument.location.href)){if(group.annotationControlChanges?.length)conflicts.push({groupId:group.id,conflict:'remembered-target-unavailable'});continue;}
        const virtualTarget=anchor.kind==='virtual'?{surfaceId:anchor.surfaceId,targetId:anchor.targetId}:undefined;
        for(const change of group.annotationControlChanges??[]){
          const control=group.annotationControls?.controls.find(item=>item.callback===change.callback);if(!control)continue;
          const resetCandidate=change.previousValue??fallback(control);if(!scalar(change.value)||!scalar(resetCandidate)||typeof change.value!==typeof resetCandidate){conflicts.push({groupId:group.id,callback:change.callback,conflict:'control-value-type-changed'});continue;}if(change.value===resetCandidate)continue;
          const values=desired.get(node)??new Map(),key=virtualTarget?JSON.stringify([virtualTarget.surfaceId,virtualTarget.targetId,change.callback]):change.callback;
          const resetValue=applied.get(node)?.get(key)?.resetValue??values.get(key)?.resetValue??resetCandidate;
          values.set(key,{groupId:group.id,callback:change.callback,resetValue,value:showOriginal||!enabled?resetValue:change.value,action:showOriginal||!enabled?'preview-original':'preview',virtualTarget});desired.set(node,values);
        }
      }
      const previous=applied;applied=desired;
      for(const [node,values]of previous)for(const [key,value]of values)if(!desired.get(node)?.has(key))dispatch(node,{...value,value:value.resetValue,action:'reset'},value.groupId,results);
      for(const [node,values]of desired)for(const [key,value]of values){const old=previous.get(node)?.get(key);if(old?.value!==value.value||old.action!==value.action)dispatch(node,value,value.groupId,results);}
      return{dispatched:results,conflicts};
    },
    clearProjection,
    dispose(){if(disposed)return;clearProjection();disposed=true;registrations.clear();featureUses.clear();pendingActions.clear();byNode=new WeakMap();targetCount=0;win.removeEventListener('codex:register-annotation-controls',register);win.removeEventListener('codex:update-annotation-controls',update);win.removeEventListener('codex:dispose-annotation-controls',unregister);win.removeEventListener('opencu:annotation-feature-use',featureUse);win.removeEventListener('pagehide',pagehide);if(role==='projection'&&globalThis[symbol]===handle)Reflect.deleteProperty(globalThis,symbol);}
  };
  const exposed=Object.freeze(role==='registration'?{getTargets:controller.getTargets,getControls:controller.getControls,getControlsJSON:controller.getControlsJSON,getFeatureUses:controller.getFeatureUses,recordUse:controller.recordUse,dispatchControlChange:controller.dispatchControlChange,dispose:controller.dispose}:{setHostAnnotationState:controller.setHostAnnotationState,isHostAnnotationActive:controller.isHostAnnotationActive,requestModeToggle:controller.requestModeToggle,recordSiteUse:controller.recordSiteUse,rememberTarget:controller.rememberTarget,syncProjection:controller.syncProjection,clearProjection:controller.clearProjection,getDispatchTarget:controller.getDispatchTarget,completeDispatch:controller.completeDispatch,dispose:controller.dispose});
  const pagehide=event=>{if(event.isTrusted&&!event.persisted)controller.dispose();};
  const handle=Object.freeze({token,registrationToken:role==='projection'?registrationToken:undefined,controller:exposed,document:doc,role});
  Object.defineProperty(globalThis,symbol,{configurable:role==='projection',enumerable:false,writable:false,value:handle});
  if(role==='registration'){win.addEventListener('codex:register-annotation-controls',register);win.addEventListener('codex:update-annotation-controls',update);win.addEventListener('codex:dispose-annotation-controls',unregister);win.addEventListener('opencu:annotation-feature-use',featureUse);}win.addEventListener('pagehide',pagehide);return exposed;
}
