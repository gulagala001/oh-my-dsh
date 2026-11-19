import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcile} from '../scripts/sync-release-feed.mjs';
import {validateManifest,versionStatus} from '../src/version.mjs';

const digest='a'.repeat(64);
const base='https://github.com/gulagala001/oh-my-dsh/releases/download/';
const bridgeVersions=[3,4,5].map(rc=>'0.2.2-rc.'+rc+'.omd.1.9.0');
function release(version){
  const tag='v'+version;
  const assets=['metadata.json','SHA256SUMS','oh-my-dsh-'+version+'.tgz'].map(name=>({
    name,state:'uploaded',digest:'sha256:'+digest,browser_download_url:base+tag+'/'+name
  }));
  return {tag_name:tag,assets};
}
async function asset(url){
  const version=url.slice(base.length+1).split('/')[0], file='oh-my-dsh-'+version+'.tgz';
  return url.endsWith('SHA256SUMS')?digest+'  '+file+'\n':JSON.stringify({
    schema:1,name:'oh-my-dsh',version,file,filename:file,sha256:digest,sourceCommit:'a'.repeat(40)
  });
}
const empty={schema:1,versionPolicy:'dsh-aligned',releases:[]};

test('published packages repair missing entries, promote candidates and reach older hosts through the migration release',async()=>{
  const next='0.2.2-rc.6.omd.1.10.0';
  const releases=[...bridgeVersions,next].map(release);
  const first=await reconcile(empty,releases,asset);
  const candidate=first.releases.find(row=>row.version===next);
  candidate.unpublished=true;candidate.severity='required';
  const fixed=await reconcile(first,releases,asset);
  const checked=validateManifest(fixed);
  for(const version of bridgeVersions){
    const status=versionStatus(version,checked,{hostVersion:version.split('.omd.')[0]});
    assert.equal(status.latestVersion,next);assert.equal(status.severity,'required');
  }
  assert.deepEqual(await reconcile(fixed,releases,asset),fixed);
});

test('withdrawn and incomplete updates leave the remaining releases usable',async()=>{
  const version='0.2.2-rc.5.omd.1.9.1';
  const bridges=bridgeVersions.map(release);
  const complete=await reconcile(empty,[...bridges,release(version)],asset);
  for (const unavailable of [[],[{...release(version),draft:true}],[{...release(version),assets:[]}]]) {
    const issues=[];
    const result=await reconcile(complete,[...bridges,...unavailable],asset,'',issue=>issues.push(issue));
    assert.equal(result.releases.find(row=>row.version===version).unpublished,true);
    assert.equal(versionStatus(bridgeVersions[0],validateManifest(result)).status,'current');
    assert.equal(issues.length,unavailable[0]?.assets.length===0?1:0);
  }
});
