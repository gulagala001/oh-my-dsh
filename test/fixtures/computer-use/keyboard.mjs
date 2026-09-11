import {mkdtemp,mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

export async function keyboardFixture({web=false}={}){
  const root=await mkdtemp(join(tmpdir(),'trisoul-cu-keyboard-')),app=join(root,'Fixture.app'),report=join(root,'truth.json'),command=join(root,'command.json'),bundle='ai.trisoul.keyboard.'+randomUUID();
  await mkdir(join(app,'Contents/MacOS'),{recursive:true});
  execFileSync('clang',['-fobjc-arc','-framework','Cocoa',new URL('./NativeKeyboardFixture.m',import.meta.url).pathname,'-o',join(app,'Contents/MacOS/Fixture')]);
  await writeFile(join(app,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}</string><key>CFBundleName</key><string>Trisoul Keyboard Fixture</string><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
  execFileSync('open',['-n','-g',app,'--args','--report',report,'--command',command,...(web?['--web-ax']:[])]);
  const truth=async()=>JSON.parse(await readFile(report,'utf8'));
  const until=async(fn,timeout=3000)=>{const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await delay(15);}throw Error('Keyboard fixture did not reach the expected state');};
  const pid=await until(async()=>{try{return(await truth()).pid;}catch{}});
  return {root,app,bundle,pid,truth,until,command:async(action,args={})=>{const id=randomUUID();await writeFile(command+'.tmp',JSON.stringify({id,action,...args}));await rename(command+'.tmp',command);return until(async()=>{const value=await truth();return value.commandId===id&&value;});},close:async()=>{try{process.kill(pid,'SIGTERM');}catch{}}};
}
