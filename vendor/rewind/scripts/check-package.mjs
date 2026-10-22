import {execFileSync} from 'node:child_process';
import {readFile,access} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const forbiddenPath=path=>/(^|\/)(?:node_modules|\.local|dist|data|work|test-results|playwright-report|AGENTS\.md|CLAUDE\.md|AI_README\.md|PLAN\.md)(\/|$)|\.log$|\.tgz$|\.env(?:\.|$)/.test(path);
const publicPath=path=>/^(?:\.gitignore|\.github\/workflows\/[^/]+\.ya?ml|LICENSE(?:\.[\w-]+)?|THIRD_PARTY_NOTICES\.md|CHANGELOG\.md|README(?:\.(?:zh|en)|_EN)?\.md|package(?:-lock)?\.json|cordis\.patch\.yml|(?:src|lib|scripts|test)\/.+\.(?:mjs|js|jsx|cjs|json)|docs\/(?:[^/]+\.md|images\/[^/]+\.(?:png|jpe?g|webp|svg)))$/.test(path);
const check=(paths,label)=>{const bad=paths.filter(path=>forbiddenPath(path)||!publicPath(path));if(bad.length)throw Error(label+': '+bad.join(', '));};
const checkContent=(path,data)=>{
  if(!/\.(?:mjs|js|jsx|cjs|json|md|yml|yaml)$/.test(path))return;
  if(/\/Users\/[^/]+\/|\/home\/[^/]+\/|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(data))
    throw Error('Private content in '+path);
};
try{
  await access(new URL('.git',root));
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
  const paths=git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
  check(paths,'Private files in Git');
  for(const path of paths)checkContent(path,await readFile(new URL(path,root),'utf8'));
  const seen=new Set();
  for(const ref of git(['rev-list','--all']).trim().split('\n').filter(Boolean)){
    const entries=git(['ls-tree','-r','-z',ref]).split('\0').filter(Boolean).map(row=>{const [mode,type,hash,...name]=row.replace('\t',' ').split(' ');return {mode,type,hash,path:name.join(' ')};});
    check(entries.map(e=>e.path),'Private files in history '+ref);
    for(const e of entries){
      if(e.type!=='blob'||e.mode==='120000')throw Error('Non-owned file in history: '+e.path);
      if(!seen.has(e.hash)){checkContent(e.path,git(['cat-file','blob',e.hash]));seen.add(e.hash);}
    }
  }
}catch(error){if(error.code!=='ENOENT')throw error;}
for(const file of ['lib/client.js','lib/format.mjs','src/index.mjs','LICENSE','LICENSE.DSH','THIRD_PARTY_NOTICES.md','README.md'])await access(new URL(file,root));
const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--dry-run','--json'],{cwd:root,encoding:'utf8'}))[0];
check(packed.files.map(f=>f.path),'Internal files in package');
for(const {path}of packed.files)checkContent(path,await readFile(new URL(path,root),'utf8'));
for(const file of ['lib/client.js','lib/format.mjs'])if(/\/Users\/|\/home\/[^/]+\/|\.local\/(?:review|rewind|research)/.test(await readFile(new URL(file,root),'utf8')))throw Error('Local build paths leaked into '+file);
console.log(`Installable package checked: ${packed.files.length} files`);
