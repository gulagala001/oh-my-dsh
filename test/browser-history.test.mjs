import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BrowserHistory} from '../src/computer-use/browser-history.mjs';

test('browser history preserves visits across restart, isolates sessions and clears only records',async t=>{
  const root=await mkdtemp(join(tmpdir(),'trisoul-browser-history-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'history.json'),history=new BrowserHistory(path),base={sessionId:'one',browserId:'browser',tabId:'tab'};
  history.remember({...base,url:'https://user:password@example.com/a',title:'A'});
  history.remember({...base,url:'https://example.com/a',title:'A updated'});
  history.remember({...base,url:'https://example.com/b',title:'B'});
  history.remember({...base,url:'https://example.com/a',title:'A again'});
  history.remember({...base,sessionId:'two',url:'https://example.com/private',title:'Private'});
  history.remember({...base,url:'javascript:alert(1)',title:'Ignored'});
  const items=history.list('one').entries;assert.equal(items.length,3);assert.equal(items[2].title,'A updated');assert.equal(items[2].url,'https://example.com/a');assert.equal(items[0].sessionId,undefined);
  const reloaded=new BrowserHistory(path);assert.deepEqual(reloaded.list('one'),history.list('one'));assert.equal(reloaded.list('two').entries.length,1);
  reloaded.clear('one');assert.equal(new BrowserHistory(path).list('one').entries.length,0);assert.equal(new BrowserHistory(path).list('two').entries.length,1);
  reloaded.remember({...base,url:'https://example.com/a',title:'Late title'});assert.equal(reloaded.list('one').entries.length,0,'late metadata cannot restore a cleared visit');
  await writeFile(path,'corrupt');const broken=new BrowserHistory(path);broken.remember({...base,url:'https://example.com/new'});assert.ok(broken.list('one').warning);assert.equal(await readFile(path,'utf8'),'corrupt','unreadable stored history is not overwritten');
});
