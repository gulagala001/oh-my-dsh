import { createServer } from 'node:http';

export async function webMcpFixture() {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><title>WebMCP 实测</title><h1>页面工具</h1><output id="note">未修改</output><output id="status">正在注册</output><button id="replace">替换工具</button><script>
      var registration = new AbortController(), version = 1;
      const context = document.modelContext;
      const schema = {type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false};
      async function register() {
        await context.registerTool({name:'set_note',description:'将页面备注设置为指定文字',inputSchema:schema,execute:async input=>{document.querySelector('#note').textContent=version+':'+input.text;return {saved:input.text,version};}}, {signal:registration.signal});
      }
      async function init() {
        if(!context) { document.querySelector('#status').textContent='浏览器缺少 WebMCP'; return; }
        await register();
        await context.registerTool({name:'throw_error',description:'返回测试错误',execute:()=>{throw new Error('Fixture WebMCP failure');}});
        await context.registerTool({name:'slow_note',description:'延迟写入备注，允许取消',inputSchema:schema,execute:(input,{signal})=>new Promise((resolve,reject)=>{
          document.querySelector('#status').textContent='延迟工具执行中';
          const timer=setTimeout(()=>{document.querySelector('#note').textContent='LATE:'+input.text;resolve({saved:true});},1500);
          signal.addEventListener('abort',()=>{clearTimeout(timer);document.querySelector('#status').textContent='延迟工具已取消';reject(signal.reason);},{once:true});
        })});
        document.querySelector('#status').textContent='工具已注册';
      }
      document.querySelector('#replace').onclick=async()=>{registration.abort();registration=new AbortController();version++;await register();document.querySelector('#status').textContent='工具已替换';};
      init().catch(error=>document.querySelector('#status').textContent=error.message);
    </script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
