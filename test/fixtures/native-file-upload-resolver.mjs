import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

// Read the pinned official SDK, rather than recreating the production signature.
const require=createRequire(import.meta.url),sdk=createRequire(require.resolve('@deepseek-ai/dsh/package.json'));
export const nativeResolverSdkPath=sdk.resolve('@deepseek-ai/dsh-api-session-controller');
const source=readFileSync(nativeResolverSdkPath,'utf8');
const startMarker='ctx.effect(() => ctx.fileUploads.registerAgentResolver(';
const endMarker='), "session-controller: file-upload Agent resolver");';
const start=source.indexOf(startMarker),end=source.indexOf(endMarker,start);
assert.ok(start>=0&&end>start,'the installed official SessionController must expose its native resolver definition');
assert.equal(source.indexOf(startMarker,start+startMarker.length),-1,'extract exactly one native resolver registration');
export const nativeResolverDefinition=source.slice(start+startMarker.length,end);
const create=runInNewContext(`(function createNativeResolver(){return ${nativeResolverDefinition};})`,Object.create(null),{timeout:1000,filename:nativeResolverSdkPath});
export function nativeFileUploadResolver(owner){return create.call(owner);}
