import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { summarizeWithLlm, COMPACTION_INSTRUCTION } from './native/summarizer.ts';
import { measureRequest, inputBudget, requestPricing } from './estimate.mjs';
import { materialText } from '../context/materials.mjs';

const message = text => createUserMessage({source:{kind:'plugin:oh-my-dsh:summary-material'},content:[{type:'text',text}]});

/** Native compaction transactions, retry ownership, tool pairing and recovery
 * stay in BasicCompactionEngine. Only its documented summarizer hook changes:
 * it submits bounded complete requests, using the same measurement as OMD.
 */
export default class Compaction extends BasicCompactionEngine {
  constructor(ctx,config={}) {
    // The native threshold ratio already reserves context growth. An absolute
    // 64K default would consume an entire small model's window a second time.
    // Explicit user headroom and per-model policies still retain their meaning.
    super(ctx,{headroomTokens:0,maxTokens:65536,...Object.fromEntries(Object.entries(config).filter(([,value])=>value!==undefined))});
  }
  async summarize(input,agent,signal) {
    const latest=agent.session.requestHeader()?.config ?? agent.options;
    const override=this.config.modelPolicies.find(p=>p.provider===latest.provider&&p.model===latest.model);
    const config={...this.config,...override};
    const route=config.summarizationProvider?{provider:config.summarizationProvider,model:config.summarizationModel}:latest;
    const info=await this.ctx.llm.resolveModelInfo(route.provider,route.model,signal);
    const capacity=info.context?.contextWindow;
    if(!capacity)throw Error('摘要模型没有可核验的上下文窗口');
    const pricing=requestPricing(this.ctx.llm,route);
    const instruction=message(COMPACTION_INSTRUCTION);
    const measure=(messages,tools)=>measureRequest({...route,messages:[...messages,instruction],tools},pricing).tokens;
    // Reserve output separately, without assuming the native default can fit
    // every model. maxTokens is a ceiling; it is never added to input counts.
    const reserve=Math.max(1,Math.min(config.maxTokens,Math.floor(capacity/8)));
    const limit=inputBudget({contextWindow:capacity,maxTokens:reserve});
    const run=async (messages,tools)=>{
      signal?.throwIfAborted();
      if(measure(messages,tools)>limit)throw Error('摘要完整请求超过模型输入预算');
      return summarizeWithLlm(this.ctx,{...config,maxTokens:reserve},{...input,messages,tools},agent,signal);
    };
    if(measure(input.messages,input.tools)<=limit)return run(input.messages,input.tools);

    // Over-window histories are summarized as explicit source records, never
    // executed tool messages. Original events and media stay in the native log.
    let records=input.messages.map((m,index)=>`[Conversation record ${index}; role ${m.role}]\n${materialText(m.content,index)}`);
    let before=Infinity;
    for(;;){
      const batches=[];let batch=[];
      for(const record of records){
        let rest=record;
        while(rest){
          if(measure([...batch,message(rest)])<=limit){batch.push(message(rest));break;}
          if(batch.length){batches.push(batch);batch=[];continue;}
          let low=0,high=rest.length;
          while(low<high){const mid=Math.ceil((low+high)/2);if(measure([message(rest.slice(0,mid))])<=limit)low=mid;else high=mid-1;}
          if(low>0&&/[\uD800-\uDBFF]/.test(rest[low-1]))low--;
          if(!low)throw Error('摘要指令本身超过模型输入预算');
          batches.push([message(rest.slice(0,low))]);rest=rest.slice(low);
        }
      }
      if(batch.length)batches.push(batch);
      const summaries=[];
      for(const batch of batches){const result=await run(batch);summaries.push(result.summary.map(b=>b.text??'').join('\n'));}
      const combined=summaries.map((text,i)=>message(`[Partial checkpoint ${i+1}/${summaries.length}]\n${text}`));
      const size=measure(combined);
      if(size<=limit)return run(combined);
      if(size>=before)throw Error('分段摘要未收敛，保留原文');
      before=size;records=combined.map(m=>m.content[0].text);
    }
  }
}
