// Exact highlight.js 11.11.1 core and Codex packed JSON/plaintext grammar.
// Full provenance: results-annotation/json-highlighting-manifest.json.
import {t as loadCore} from './codex-tool-code/core-51383d4e7880.js';
const n=loadCore().default;
function ve(e){let t={className:`attr`,begin:/"(\\.|[^\\"\r\n])*"(?=\s*:)/,relevance:1.01},n={match:/[{}[\],:]/,className:`punctuation`,relevance:0},r=[`true`,`false`,`null`],i={scope:`literal`,beginKeywords:r.join(` `)};return{name:`JSON`,aliases:[`jsonc`],keywords:{literal:r},contains:[t,n,e.QUOTE_STRING_MODE,i,e.C_NUMBER_MODE,e.C_LINE_COMMENT_MODE,e.C_BLOCK_COMMENT_MODE],illegal:`\\S`}}
function Be(e){return{name:`Plain text`,aliases:[`text`,`txt`],disableAutodetect:!0}}
function It(e,t){let r=t?.trim().toLowerCase();if(r){let t=n.getLanguage(r)?r:`plaintext`,{value:i}=n.highlight(e,{language:t});return{code:e,html:i,language:t}}let{value:i,language:a}=n.highlightAuto(e);return{code:e,html:i,language:a}}
n.registerLanguage('json',ve);
n.registerLanguage('plaintext',Be);
export const codexToolJsonEngineVersion=n.versionString;
export function highlightToolJson(content,language='json'){
  const normalized=language?.trim().toLowerCase();
  if(normalized!=='json'&&normalized!=='jsonc')return null;
  return It(content,normalized);
}
