// Chromium's rendered-text search handles whitespace, split text nodes and
// visibility. Iterate the actual frame tree because window.find does not
// search child documents, even when its legacy searchInFrames flag is true.
export async function findInView(view,{query,backward=false},signal){
  const frames=view.record.page.frames(),previous=view.findCursor;
  const continuing=previous?.query===query&&previous.loaderId===view.loaderId&&frames.includes(previous.frame);
  const start=continuing?frames.indexOf(previous.frame):backward?frames.length-1:0;
  for(let offset=0;offset<=frames.length;offset++){
    signal.throwIfAborted();
    const index=(start+(backward?-offset:offset)+frames.length)%frames.length,frame=frames[index];
    if(!frame||frame.isDetached())continue;
    if(frame.parentFrame()){
      const element=await frame.frameElement();
      try{if(!await element.isVisible())continue;}finally{await element.dispose();}
    }
    signal.throwIfAborted();
    const found=await frame.evaluate(({query,backward,reset})=>{
      if(typeof window.find!=='function')throw new Error('当前浏览器不支持网页文字查找');
      if(reset){const range=document.createRange();range.selectNodeContents(document.body??document.documentElement);range.collapse(!backward);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}
      return window.find(query,false,backward,false,false,false,false);
    },{query,backward,reset:!continuing||offset>0});
    signal.throwIfAborted();
    if(!found)continue;
    for(let child=frame;child.parentFrame();child=child.parentFrame()){
      const element=await child.frameElement();
      try{await element.scrollIntoViewIfNeeded({timeout:3000});}finally{await element.dispose();}
      signal.throwIfAborted();
    }
    view.findCursor={query,frame,loaderId:view.loaderId};
    return{query,found:true,wrapped:offset>0&&(backward?index>=start:index<=start)};
  }
  view.findCursor=null;
  return{query,found:false,wrapped:false};
}
