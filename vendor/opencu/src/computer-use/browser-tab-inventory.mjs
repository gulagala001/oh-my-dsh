const unavailable=()=>Object.assign(new Error('浏览器连接已改变，标签页清单读取未完成'),{code:'BROWSER_INVENTORY_UNAVAILABLE'});
const epoch=browser=>browser.info?.epoch??browser.run?.id;
const failure=(browserId,error,browserEpoch)=>({browserId,...(browserEpoch!==undefined?{browserEpoch}:{}),code:typeof error?.code==='string'?error.code:'BROWSER_INVENTORY_FAILED',message:typeof error?.message==='string'?error.message:String(error??'浏览器标签页读取失败')});

// Preparation belongs here so both the manager UI and host-tab bridge see
// the same live inventory. An unsuccessful browser is never an empty list.
export async function readBrowserTabInventory(manager,sessionId,{signal}={}){
  signal?.throwIfAborted();
  if(manager.closed||!manager.enabled)throw new Error('Computer Use 已关闭');
  await manager.extensionReady;
  signal?.throwIfAborted();
  const pluginBrowser=await manager.ensurePluginBrowser({required:false});
  signal?.throwIfAborted();
  if(manager.closed||!manager.enabled)throw new Error('Computer Use 已关闭');
  const browsers=manager.browsers(),bindings=browsers.map(browser=>({browser,browserId:browser.id,browserEpoch:epoch(browser)}));
  const assertCurrent=binding=>{
    const {browser,browserEpoch}=binding;
    if(manager.closed||!manager.enabled||browser.run?.lost||browser.closing||!manager.browsers().includes(browser)||browserEpoch!==undefined&&epoch(browser)!==browserEpoch)throw unavailable();
  };
  const results=await Promise.allSettled(bindings.map(async binding=>{
    assertCurrent(binding);
    const tabs=await binding.browser.list('ui-tabs',{signal});
    signal?.throwIfAborted();assertCurrent(binding);
    if(!Array.isArray(tabs))throw Object.assign(new Error('浏览器没有返回实际标签页清单'),{code:'INVALID_BROWSER_INVENTORY'});
    return tabs;
  }));
  signal?.throwIfAborted();
  if(manager.closed||!manager.enabled)throw new Error('Computer Use 已关闭');
  const observedAt=performance.now(),tabs=[],successfulBrowserIds=[],failedBrowsers=[];
  for(const [index,result]of results.entries()){
    const binding=bindings[index],{browser,browserId}=binding;
    if(result.status==='rejected'){failedBrowsers.push(failure(browserId,result.reason,binding.browserEpoch));continue;}
    try{
      assertCurrent(binding);
      const mapped=result.value.map(({owner,...tab})=>{
        // Resolve through the manager's existing ownership namespace. A
        // replacement provider cannot inherit a retired provider's result.
        const current=manager.browserForTab(tab.id,tab.browserId);
        if(current!==browser)throw unavailable();
        const available=!owner||owner===sessionId;
        return{...tab,active:manager.sessions.get(sessionId)?.target?.id===tab.id,available,observedAt,
          browserEpoch:epoch(current),canTransfer:available&&current.hub===manager.pluginBrowserBinding?.hub
            &&current.info?.capabilities?.includes('browser-detached-window')===true&&!tab.detached};
      });
      assertCurrent(binding);tabs.push(...mapped);successfulBrowserIds.push(browserId);
    }catch(error){failedBrowsers.push(failure(browserId,error,binding.browserEpoch));}
  }
  if(manager.pluginBrowserEnabled&&!pluginBrowser&&!bindings.some(binding=>binding.browserId==='desktop-browser')){
    failedBrowsers.push(failure('desktop-browser',manager.pluginBrowserError??unavailable()));
  }
  return{tabs,successfulBrowserIds,failedBrowsers};
}
