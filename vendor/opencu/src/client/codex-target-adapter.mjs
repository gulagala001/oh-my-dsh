// Codex 26.1007.21159: hZc/uci/aYc/oYc, ST -> ANi, K7t -> HSt.
// Original coordinates, full functions and portable matcher references:
// work/rea-reconstruction/target-picker/{manifest,matcher-port,host-contract}.json.

const text = value => typeof value === 'string' ? value : '';
const validId = value => typeof value === 'string' && value.length > 0;
const localHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1']);

/** Source ANi: HTTP(S) host display; local HTTP(S) retains its real path. */
export function formatCodexTargetUrl(value, { stripHttp = true, stripQueryAndHash = true } = {}) {
  const original = text(value).trim();
  if (!original) return '';
  try {
    const url = new URL(original);
    if (url.protocol === 'file:') {
      const decoded = decodeURIComponent(url.pathname);
      const pathname = /^\/[A-Za-z]:[\\/]/.test(decoded) ? decoded.slice(1) : decoded;
      return url.host.length === 0 ? pathname : `//${url.host}${pathname}`;
    }
    const http = url.protocol === 'http:' || url.protocol === 'https:';
    const hostname = url.hostname.toLowerCase();
    if (http && (hostname.endsWith('.localhost') || localHosts.has(hostname))) {
      if (stripQueryAndHash) { url.search = ''; url.hash = ''; }
      const result = url.toString().replace(/^https?:\/\//i, '');
      return url.pathname === '/' && !url.search && !url.hash ? result.slice(0, -1) : result;
    }
    if (url.protocol === 'https:') return url.host.replace(/^www\./i, '');
    if (url.protocol === 'http:') return stripHttp ? url.host : `http://${url.host}`;
  } catch {}
  return original;
}

/** The source's HSt normalizes line breaks in both the title and URL fallback. */
export function codexTargetTabTitle({ title, url }) {
  const label = text(title).replace(/[\r\n]+/g, ' ').trim();
  return label || text(url).replace(/[\r\n]+/g, ' ').trim();
}

/** Original Lodash symbol segmentation, fixed source length=60 and omission=… . */
export function truncateCodexTargetLabel(value) {
  const label = text(value), symbols = qwr()(label);
  return symbols.length <= 60 ? label : symbols.slice(0, 59).join('') + '…';
}

/** Adapt display only; the serialized legacy reference object is never changed. */
export function codexTargetReference(reference, artwork = {}) {
  const browserTab = reference.kind === 'tab';
  const fullTitle = browserTab ? codexTargetTabTitle({ title: reference.title ?? reference.label, url: reference.url })
    : text(reference.label) || text(reference.title) || (reference.kind === 'browser' ? 'Browser' : text(reference.id));
  return {
    kind: reference.kind, id: reference.id, title: fullTitle, url: text(reference.url),
    label: browserTab ? truncateCodexTargetLabel(fullTitle) : fullTitle,
    ariaLabel: browserTab ? `${fullTitle} ${text(reference.url)}`.trim() : undefined,
    tooltipText: text(reference.url) || text(reference.id),
    fallbackIconName: browserTab ? 'shared:Dtt' : 'shared:kw',
    // Artwork is a separate trusted host input, not arbitrary fields in user JSON.
    ...artwork,
  };
}

/**
 * Build DSH's public InputTriggerCandidate display data from the existing inventory.
 * Source native app rules: nonempty query, word prefix, original A2 score, at most 8.
 * Browser tab lookup retains this host's existing substring search and inventory order;
 * inventory does not expose the original Pd.browserTabs.search ranking service.
 */
export function buildCodexTargetCandidates(inventory, query, { iconFor, labels = {}, excludedNativeAppIds = [] } = {}) {
  const needle = text(query).trim().toLowerCase(), score = A2(needle);
  const detail = labels.computerUse ?? 'Computer use', browserSuffix = labels.browser ?? 'Browser';
  const excluded = new Set(excludedNativeAppIds), seenApps = new Set();
  const browsers = Array.isArray(inventory?.browsers) ? inventory.browsers : [];
  const apps = Array.isArray(inventory?.apps) ? inventory.apps : [];
  const native = [], tabs = [];
  for (const browser of browsers) {
    if (!validId(browser.id)) continue;
    const name = browser.type === 'managed' ? 'Browser' : text(browser.name);
    if (needle && name && score(name) > 0) native.push({
      item: { key: `browser:${browser.id}`, kind: 'browser', label: name, detail, fallbackIconName: 'shared:kw' },
      ref: { kind: 'browser', id: browser.id, label: name }, score: score(name),
    });
    for (const tab of Array.isArray(browser.tabs) ? browser.tabs : []) {
      if (!validId(tab.id)) continue;
      const originalTitle = codexTargetTabTitle({ title: tab.title, url: tab.url });
      if (needle && !`${originalTitle} ${text(tab.url)}`.toLowerCase().includes(needle)) continue;
      const urlDetail = formatCodexTargetUrl(tab.url);
      const label = truncateCodexTargetLabel(codexTargetTabTitle({ title: tab.title, url: urlDetail }));
      const suffix = browser.type === 'managed' ? undefined : `· ${text(browser.shortDisplayName) || browserSuffix}`;
      tabs.push({
        item: { key: `tab:${browser.id}:${tab.id}`, kind: 'tab', label, detail: urlDetail,
          detailSuffix: suffix, allowLabelAndDetailToShrink: true, fallbackIconName: 'shared:OD' },
        ref: { kind: 'tab', id: tab.id, browser: browser.id, url: tab.url, title: tab.title, label }, score: 1,
      });
    }
  }
  if (needle) for (const app of apps) {
    if (!validId(app.id) || seenApps.has(app.id) || excluded.has(app.id)) continue;
    seenApps.add(app.id);
    const name = text(app.displayName) || app.id;
    if (!name.toLocaleLowerCase().split(/\s+/).some(word => word.startsWith(needle))) continue;
    native.push({
      item: { key: `app:${app.id}`, kind: 'app', label: name, detail, fallbackIconName: 'shared:kw' },
      ref: { kind: 'app', id: app.id, label: name }, score: score(name),
    });
  }
  const rankedNative = native.map((entry, index) => ({ ...entry, index }))
    .sort((left, right) => right.score - left.score || left.index - right.index).slice(0, 8);
  let rows = [...rankedNative, ...tabs];
  // Retain this host's existing empty-query ceiling while its inventory supplies
  // the browser candidates; the original source-ranked search is unavailable.
  if (!needle) rows = rows.slice(0, 30);
  if (needle) rows = rows.map((entry, index) => ({ ...entry, index,
    priority: entry.item.kind !== 'tab' && entry.item.label.toLowerCase().startsWith(needle) ? 1 : 2 }))
    .sort((left, right) => left.priority - right.priority || right.score - left.score || left.index - right.index).slice(0, 8);
  return rows.map(({ item, ref }) => ({
    name: item.label,
    description: [item.detail, item.detailSuffix].filter(Boolean).join(' '),
    ...(iconFor ? { icon: iconFor(item) } : {}),
    value: JSON.stringify(ref),
  }));
}

// The following private matcher and symbol helpers are source-preserved, not
// a substitute algorithm. Their original names keep the source mapping exact.

function k2(e,t){let n=t.trim();return n.length===0?0:R2o(e,z2o(n),U2o(n))}function A2(e){let t=e.trim();if(t.length===0)return()=>0;let n=z2o(t),r=U2o(t);return e=>R2o(e,n,r)}function L2o(e,t){let n=t.trim();return n.length===0?null:z2o(n).matchingFragments(U2o(n)?H2o(e):e)}function R2o(e,t,n){let r=n?H2o(e):e,i=t.matchingDegree(r);if(i===c4o)return 0;let a=i*10-e.length;return a<=0?1:a}function z2o(e){let t=Array.from(e,e=>{let t=e.toLowerCase();return t.length===e.length?t:e}).join(``),n=U2o(t),r=n?B2o(t):`*${t}`,i=V2o(t),a=new p4o(r,`IGNORE_CASE`,u4o.join(``)),o=n&&t!==i?new p4o(i,`IGNORE_CASE`,u4o.join(``)):null;return new f4o(a,o)}function B2o(e){let t=`*${e}`;for(let e of u4o)t=t.split(e).join(`*${l4o}*`);return t}function V2o(e){let t=-1;for(let n of u4o){let r=e.lastIndexOf(n);r>=0&&r<e.length-1&&(t=Math.max(t,r))}return e.slice(t+1)}function H2o(e){let t=e;for(let e of u4o)t=t.split(e).join(l4o);return t}function U2o(e){for(let t of u4o)if(e.includes(t))return!0;return!1}function W2o(e,t){return t.length===0?e:t[0].startOffset===0?e+d4o:e}function G2o(e){return e.trim().length===0||e===`_`||e===`-`||e===`:`||e===`+`||e===`.`||e===`/`||e===`\\`}function K2o(e,t){return t<e.length&&a4o(e[t])?t+1:q2o(e,t)}function q2o(e,t){for(let n=t+1;n<=e.length;n+=1){if(n>=e.length)return e.length+1;if(J2o(e,n))return n}return e.length+1}function J2o(e,t){if(t<0||t>=e.length)return!1;let n=e[t];if(!o4o(n))return!1;if(t===0)return!0;let r=e[t-1];return!!(!o4o(r)||r4o(n)&&i4o(r)||a4o(n)&&!a4o(r))}function Y2o(e,t,n,r,i){if(!i){for(let i=n;i<r;i+=1)if(e[i]===t)return i;return-1}let a=t.toLowerCase(),o=t.toUpperCase();for(let t=n;t<r;t+=1){let n=e[t];if(n===a||n===o)return t}return-1}function X2o(e){return e===` `||e===`*`}function Z2o(e,t,n,r){for(let i=n;i<r;i+=1)if(t.includes(e[i]))return i;return-1}function Q2o(e,t,n,r){for(let i=n;i<r;i+=1)if(e[i]===t)return i;return-1}function $2o(e,t,n,r){let i=e.toLowerCase(),a=t.toLowerCase(),o=i.indexOf(a,n);return o<0||o+t.length>r?-1:o}function e4o(e,t,n,r){return t+n>e.length?!1:e.slice(t,t+n).toLowerCase()===r.toLowerCase()}function t4o(e){let t=``;for(let n of e)n!==`*`&&(t+=n);return t}function n4o(e,t,n){if(e.length===0)return[{startOffset:t,endOffset:t+n}];let r=e[e.length-1];return r.startOffset===t+n?e[e.length-1]={startOffset:t,endOffset:r.endOffset}:e.push({startOffset:t,endOffset:t+n}),e}function r4o(e){return e.toUpperCase()===e&&e.toLowerCase()!==e}function i4o(e){return e.toLowerCase()===e&&e.toUpperCase()!==e}function a4o(e){return e>=`0`&&e<=`9`}function o4o(e){return/[a-z0-9]/i.test(e)}var s4o,c4o,l4o,u4o,d4o,f4o,p4o;
s4o=100,c4o=-2147483648,l4o=`\0`,u4o=[`/`,`\\`],d4o=1e4,f4o=class{mainMatcher;fallbackMatcher;constructor(e,t){this.mainMatcher=e,this.fallbackMatcher=t}matchingDegree(e){let t=this.mainMatcher.match(e);if(t!=null)return W2o(this.mainMatcher.matchingDegree(e,!1,t),t);if(this.fallbackMatcher==null)return c4o;let n=this.fallbackMatcher.match(e);return n==null?c4o:W2o(this.fallbackMatcher.matchingDegree(e,!1,n),n)}matchingFragments(e){return this.mainMatcher.match(e)??this.fallbackMatcher?.match(e)??null}},p4o=class{myPattern;isLowerCase;isUpperCase;isWordSeparator;toUpperCase;toLowerCase;hardSeparators;matchingMode;mixedCase;hasDots;meaningfulCharacters;minNameLength;failedMatchStates;constructor(e,t,n){let r=e.endsWith(`* `)?e.slice(0,-2):e;this.myPattern=r.split(``),this.isLowerCase=Array.from({length:this.myPattern.length},()=>!1),this.isUpperCase=Array.from({length:this.myPattern.length},()=>!1),this.isWordSeparator=Array.from({length:this.myPattern.length},()=>!1),this.toUpperCase=Array.from({length:this.myPattern.length},()=>``),this.toLowerCase=Array.from({length:this.myPattern.length},()=>``),this.hardSeparators=Array.from(n),this.matchingMode=t;let i=[],a=!1,o=!1,s=!1,c=!1;for(let e=0;e<this.myPattern.length;e+=1){let t=this.myPattern[e],n=G2o(t),r=r4o(t),l=i4o(t),u=t.toUpperCase(),d=t.toLowerCase();l&&(o=!0),t===`.`&&(c=!0),a&&r&&(s=!0),X2o(t)||(a=!0,i.push(d),i.push(u)),this.isWordSeparator[e]=n,this.isUpperCase[e]=r,this.isLowerCase[e]=l,this.toUpperCase[e]=u,this.toLowerCase[e]=d}this.hasDots=c,this.mixedCase=o&&s,this.meaningfulCharacters=i,this.minNameLength=i.length/2}get pattern(){return this.myPattern.join(``)}matchingDegree(e,t=!1,n=this.match(e)){if(n==null)return c4o;if(n.length===0)return 0;let r=n[0],i=r.startOffset===0,a=i&&t,o=0,s=-1,c=0,l=0,u=!1;for(let t of n)for(let n=t.startOffset;n<t.endOffset;n+=1){let i=n===t.startOffset&&t!==r,d=!1;for(;l<=n;)l===n?d=!0:i&&(c+=1),l=K2o(e,l);let f=e[n];if(s=Y2o(this.myPattern,f,s+1,this.myPattern.length,!0),s<0)break;d&&(u=f===this.myPattern[s]&&this.isUpperCase[s]),o+=this.evaluateCaseMatching(a,s,u,n,i,d,f)}let d=r.startOffset,f=Z2o(e,this.hardSeparators,0,d)>=0,p=d===0||J2o(e,d)&&!J2o(e,d-1),m=n[n.length-1].endOffset===e.length;return(p?1e3:0)+o-n.length+-c*10+(f?0:2)+ +!!i+ +!!m}match(e){if(e.length<this.minNameLength)return null;if(this.myPattern.length>s4o)return this.matchBySubstring(e);let t=0;for(let n=0;n<e.length&&t<this.meaningfulCharacters.length;n+=1){let r=e[n];if(r===this.meaningfulCharacters[t]||r===this.meaningfulCharacters[t+1]){let r=this.myPattern.length-2;if(t===this.meaningfulCharacters.length-2&&r>=0&&o4o(this.myPattern[r+1])&&!this.isWildcard(r)&&(n===0||!this.charEquals(this.myPattern[r],r,e[n-1],this.matchingMode!==`MATCH_CASE`))&&!J2o(e,n))continue;t+=2}}if(t<this.minNameLength*2)return null;this.failedMatchStates?.clear();let n=this.matchWildcards(e,0,0);return n==null?null:n.reverse()}evaluateCaseMatching(e,t,n,r,i,a,o){return i&&a&&this.isLowerCase[t]?-10:o===this.myPattern[t]?this.isUpperCase[t]?50:r===0&&e?150:+!!a:a||this.isLowerCase[t]&&n?-1:0}matchBySubstring(e){let t=this.isPatternChar(0,`*`),n=t4o(this.myPattern);if(e.length<n.length)return null;if(t){let t=$2o(e,n,0,e.length);return t>=0?[{startOffset:t,endOffset:t+n.length}]:null}return e4o(e,0,n.length,n)?[{startOffset:0,endOffset:n.length}]:null}matchWildcards(e,t,n){let r=t;if(n<0)return null;if(!this.isWildcard(r))return r===this.myPattern.length?[]:this.matchFragment(e,r,n);do r+=1;while(this.isWildcard(r));if(r===this.myPattern.length){if(this.isTrailingSpacePattern()&&n!==e.length&&(r<2||!this.isUpperCaseOrDigit(r-2))){let t=e.indexOf(` `,n);return t>=0?[{startOffset:t,endOffset:t+1}]:null}return[]}return this.matchSkippingWords(e,r,this.findNextPatternCharOccurrence(e,n,r),!0)}isTrailingSpacePattern(){return this.isPatternChar(this.myPattern.length-1,` `)}isUpperCaseOrDigit(e){return this.isUpperCase[e]||a4o(this.myPattern[e])}matchSkippingWords(e,t,n,r){if(n<0)return null;let i=(t*(e.length+1)+n)*2+ +!!r;if(this.failedMatchStates?.has(i))return null;let a=n,o=0;for(;a>=0;){let n=this.seemsLikeFragmentStart(e,t,a)?this.maxMatchingFragment(e,t,a):0;if(n>o||a+n===e.length&&this.isTrailingSpacePattern()){this.isMiddleMatch(e,t,a)||(o=n);let r=this.matchInsideFragment(e,t,a,n);if(r!=null)return r}let i=this.findNextPatternCharOccurrence(e,a+1,t);a=r?i:this.checkForSpecialChars(e,a+1,i,t)}return(this.failedMatchStates??=new Set).add(i),null}findNextPatternCharOccurrence(e,t,n){return!this.isPatternChar(n-1,`*`)&&!this.isWordSeparator[n]?this.indexOfWordStart(e,n,t):this.indexOfIgnoreCase(e,t,n)}checkForSpecialChars(e,t,n,r){return n<0||this.hasDots&&!this.isPatternChar(r-1,`.`)&&Q2o(e,`.`,t,n)!==-1?-1:n}seemsLikeFragmentStart(e,t,n){return!this.isUpperCase[t]||r4o(e[n])||J2o(e,n)?!0:!this.mixedCase&&this.matchingMode!==`MATCH_CASE`}charEquals(e,t,n,r){return e===n?!0:r?this.toLowerCase[t]===n||this.toUpperCase[t]===n:!1}matchFragment(e,t,n){let r=this.maxMatchingFragment(e,t,n);return r===0?null:this.matchInsideFragment(e,t,n,r)}maxMatchingFragment(e,t,n){if(!this.isFirstCharMatching(e,n,t))return 0;let r=1,i=this.matchingMode!==`MATCH_CASE`;for(;n+r<e.length&&t+r<this.myPattern.length;){let a=e[n+r];if(!this.charEquals(this.myPattern[t+r],t+r,a,i)){if(this.isSkippingDigitBetweenPatternDigits(t+r,a))return 0;break}r+=1}return r}isSkippingDigitBetweenPatternDigits(e,t){return a4o(this.myPattern[e])&&a4o(this.myPattern[e-1])&&a4o(t)}matchInsideFragment(e,t,n,r){let i=this.isMiddleMatch(e,t,n)?3:1;return this.improveCamelHumps(e,t,n,r,i)??this.findLongestMatchingPrefix(e,t,n,r,i)}isMiddleMatch(e,t,n){return!this.isPatternChar(t-1,`*`)||this.isWildcard(t+1)||!o4o(e[n])?!1:!J2o(e,n)}findLongestMatchingPrefix(e,t,n,r,i){if(t+r>=this.myPattern.length)return[{startOffset:n,endOffset:n+r}];let a=r;for(;a>=i||a>0&&this.isWildcard(t+a);){let r=null;if(this.isWildcard(t+a))r=this.matchWildcards(e,t+a,n+a);else{let i=this.findNextPatternCharOccurrence(e,n+a+1,t+a);i=this.checkForSpecialChars(e,n+a,i,t+a),i>=0&&(r=this.matchSkippingWords(e,t+a,i,!1))}if(r!=null)return n4o(r,n,a);--a}return null}improveCamelHumps(e,t,n,r,i){for(let a=i;a<r;a+=1)if(this.isUppercasePatternVsLowercaseNameChar(e,t+a,n+a)){let r=this.findUppercaseMatchFurther(e,t+a,n+a);if(r!=null)return n4o(r,n,a)}return null}isUppercasePatternVsLowercaseNameChar(e,t,n){return this.isUpperCase[t]&&this.myPattern[t]!==e[n]}findUppercaseMatchFurther(e,t,n){let r=this.indexOfWordStart(e,t,n);return this.matchWildcards(e,t,r)}isFirstCharMatching(e,t,n){if(t>=e.length)return!1;let r=this.matchingMode!==`MATCH_CASE`,i=this.myPattern[n];return this.charEquals(i,n,e[t],r)?this.matchingMode===`FIRST_LETTER`&&(n===0||n===1&&this.isWildcard(0))&&this.hasCase(n)?this.isUpperCase[n]===r4o(e[0]):!0:!1}hasCase(e){return this.isUpperCase[e]||this.isLowerCase[e]}isWildcard(e){return e>=0&&e<this.myPattern.length&&X2o(this.myPattern[e])}isPatternChar(e,t){return e<0||e>=this.myPattern.length?!1:this.myPattern[e]===t}indexOfWordStart(e,t,n){let r=this.myPattern[t];if(n>=e.length||this.mixedCase&&this.isLowerCase[t]&&!(t>0&&this.isWordSeparator[t-1]))return-1;let i=n,a=!o4o(r);for(;;){if(i=this.indexOfIgnoreCase(e,i,t),i<0)return-1;if(a||J2o(e,i))return i;i+=1}}indexOfIgnoreCase(e,t,n){let r=this.toUpperCase[n],i=this.toLowerCase[n];for(let n=t;n<e.length;n+=1){let t=e[n];if(t===r||t===i)return n}return-1}};

function codexSnapshotModule(factory) { let module; return () => { if (!module) { module = { exports: {} }; factory(module.exports, module); } return module.exports; }; }
const Gwr=codexSnapshotModule(((e,t)=>{function n(e){return e.split(``)}t.exports=n}));
const Wwr=codexSnapshotModule(((e,t)=>{var n=RegExp(`[\\u200d\\ud800-\\udfff\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff\\ufe0e\\ufe0f]`);function r(e){return n.test(e)}t.exports=r}));
const Kwr=codexSnapshotModule(((e,t)=>{var n=`\\ud800-\\udfff`,r=`\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff`,i=`\\ufe0e\\ufe0f`,a=`[`+n+`]`,o=`[`+r+`]`,s=`\\ud83c[\\udffb-\\udfff]`,c=`(?:`+o+`|`+s+`)`,l=`[^`+n+`]`,u=`(?:\\ud83c[\\udde6-\\uddff]){2}`,d=`[\\ud800-\\udbff][\\udc00-\\udfff]`,f=`\\u200d`,p=c+`?`,m=`[`+i+`]?`,h=`(?:`+f+`(?:`+[l,u,d].join(`|`)+`)`+m+p+`)*`,g=m+p+h,_=`(?:`+[l+o+`?`,o,u,d,a].join(`|`)+`)`,v=RegExp(s+`(?=`+s+`)|`+_+g,`g`);function y(e){return e.match(v)||[]}t.exports=y}));
const qwr=codexSnapshotModule(((e,t)=>{var n=Gwr(),r=Wwr(),i=Kwr();function a(e){return r(e)?i(e):n(e)}t.exports=a}));
