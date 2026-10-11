import {domainToUnicode} from 'node:url';

const segmenter = new Intl.Segmenter(undefined, {granularity: 'word'});
const quotes = new Set(['"', '\u00ab', '\u00bb', '\u201c', '\u201d', '\u201e']);

function words(text) {
  return [...segmenter.segment(text.toLowerCase())].filter(part => part.isWordLike).map(part => part.segment);
}

// Word/phrase matching follows the collected QueryParser contract with runtime ICU.
// IDN display policy remains the plugin's Node URL policy.
export function compileHistoryQuery(text, algorithm = 'default') {
  if (typeof text !== 'string') throw new TypeError('History query text must be a string');
  if (!['default', 'alwaysPrefix'].includes(algorithm)) throw new TypeError('Invalid history matching algorithm');
  if (text === '') return () => true;
  const nodes = [];
  let phrase = null;
  for (const part of segmenter.segment(text.toLowerCase())) {
    if (part.isWordLike) {
      if (phrase) phrase.push(part.segment);
      else nodes.push({word: part.segment});
    } else if (quotes.has(part.segment[0])) {
      if (phrase) phrase = null;
      else {
        phrase = [];
        nodes.push({phrase});
      }
    }
  }
  const terms = nodes.filter(node => !node.phrase || node.phrase.length > 0);
  if (!terms.length) return () => false;
  return (url, title) => {
    const haystack = words(url);
    const host = new URL(url).hostname;
    const unicode = domainToUnicode(host);
    if (unicode && unicode !== host) haystack.push(...words(unicode));
    haystack.push(...words(title));
    return terms.every(node => {
      if (node.phrase) {
        for (let index = 0; index <= haystack.length - node.phrase.length; index++) {
          if (node.phrase.every((word, offset) => haystack[index + offset] === word)) return true;
        }
        return false;
      }
      const first = node.word.charCodeAt(0);
      const minimum = first >= 0xac00 && first <= 0xd7a3 ? 2 : 3;
      const prefix = algorithm === 'alwaysPrefix' || node.word.length >= minimum;
      return haystack.some(word => prefix ? word.startsWith(node.word) : word === node.word);
    });
  };
}

export function localDayKey(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new RangeError('History visit is outside a representable local day');
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localDayRange(timestamp) {
  const start = new Date(timestamp);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new RangeError('History visit is outside a representable local day');
  }
  return {start: start.getTime(), end: end.getTime()};
}
