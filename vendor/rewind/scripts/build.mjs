import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('../src/client/index.jsx',import.meta.url))],outfile:fileURLToPath(new URL('../lib/client.js',import.meta.url)),minifyWhitespace:true,minifySyntax:true,bundle:true,platform:'browser',format:'cjs',target:'es2022',external:['react','react-dom','@deepseek-ai/cordis','@deepseek-ai/dsh-client-ui-primitives'],banner:{js:'window.__ModuleLoader__.load({id:"@gulagala001/dsh-undo-plugin",factory:(require)=>{var module={exports:{}};var exports=module.exports;'},footer:{js:'return module.exports;}});'}});

const req=createRequire(import.meta.url);let codec;try{codec=req.resolve('@deepseek-ai/dsh-session-format-catalog');}catch{codec=createRequire(req.resolve('@deepseek-ai/dsh-session-persistence-jsonl')).resolve('@deepseek-ai/dsh-session-format-catalog');}
await build({entryPoints:[codec],outfile:fileURLToPath(new URL('../lib/format.mjs',import.meta.url)),minifyWhitespace:true,minifySyntax:true,bundle:true,platform:'node',format:'esm',target:'node22',external:['@deepseek-ai/cordis']});
