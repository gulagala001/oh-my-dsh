import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
export function externalWebUrl(value){
  if(typeof value!=='string')throw new Error('当前网页地址无效');
  let url;try{url=new URL(value);}catch{throw new Error('当前网页地址无效');}
  if(!['http:','https:'].includes(url.protocol))throw new Error('只能在外部浏览器中打开 HTTP(S) 网页');
  return url.href;
}
export async function openExternalUrl(value,{signal,platform=process.platform,env=process.env,run=execute}={}){
  const url=externalWebUrl(value);signal?.throwIfAborted();
  let command,args;
  if(platform==='darwin'){command='/usr/bin/open';args=[url];}
  else if(platform==='win32'||platform==='linux'&&(env.WSL_INTEROP||env.WSL_DISTRO_NAME)){
    command='powershell.exe';
    const script="$ErrorActionPreference='Stop';Start-Process -FilePath '"+url.replaceAll("'","''")+"'";
    args=['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
  }else if(platform==='linux'){command='xdg-open';args=[url];}
  else throw new Error('当前宿主不支持打开系统浏览器');
  try{await run(command,args,{signal,timeout:8000,windowsHide:true,encoding:'utf8'});}
  catch(error){signal?.throwIfAborted();throw new Error('无法打开系统浏览器，请检查宿主的默认浏览器设置'+(error.code?'（'+error.code+'）':''),{cause:error});}
}
