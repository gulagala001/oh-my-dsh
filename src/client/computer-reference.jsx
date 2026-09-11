import React, { useState } from 'react';
import {ComputerIcon} from './computer-icons.jsx';
import { projectUserText, FileTypeIcon, JsonBlock } from '@deepseek-ai/dsh-client-ui-primitives';

function segments(text) {
  const result = []; let end = 0;
  for (const match of text.matchAll(/<computer-use-target>([^]*?)<\/computer-use-target>/g)) {
    let value;
    try { if (match[1].length <= 16384) value = JSON.parse(match[1]); } catch {}
    if (!value || !['browser', 'tab', 'app'].includes(value.kind) || typeof value.id !== 'string') continue;
    if (['label', 'title', 'url'].some(key => value[key] !== undefined && typeof value[key] !== 'string')) continue;
    if (match.index > end) result.push({ text: text.slice(end, match.index) });
    result.push({ reference: value }); end = match.index + match[0].length;
  }
  if (end < text.length) result.push({ text: text.slice(end) });
  return result;
}

function ReferenceMessage({ parts, node, renderMessageImages, t }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState('');
  const data = node.data, content = data.content ?? [];
  const original = content.filter(b => b.type === 'text').map(b => b.text).join('');
  const attachments = content.filter(b => (b.type === 'image' || b.type === 'file') && b.attachment);
  const extra = content.filter(b => b.type !== 'text' && !attachments.includes(b));
  return <div className="tx-cu-user-message">
    {!!attachments.length && <div className="tx-cu-user-attachments">{attachments.map((block, index) => block.type === 'image' ? <React.Fragment key={index}>{renderMessageImages({ images: [{ attachment: block.attachment }], align: 'end', compact: attachments.length > 1 })}</React.Fragment> : <span className="tx-cu-user-file" key={index}><FileTypeIcon path={block.attachment.name}/>{block.attachment.name}</span>)}</div>}
    <div className="tx-cu-user-bubble">{parts.map((part, index) => part.reference ? <span className="tx-cu-reference" key={index} title={part.reference.url ?? part.reference.id} data-computer-use-reference={part.reference.kind}><ComputerIcon size={14} name={part.reference.kind==='app'?'screen':'browser'}/><span>{part.reference.label ?? part.reference.title ?? (part.reference.kind === 'browser' ? 'Browser' : part.reference.id)}</span></span> : <React.Fragment key={index}>{projectUserText(part.text, data.referenceLabels ?? [], data.skillNames ?? [])}</React.Fragment>)}{extra.map((block, index) => <JsonBlock key={index} label={t('message.extraBlock')} payload={block} truncatedLabel={total => t('json.truncated', { total })}/>)}</div>
    <div className="tx-cu-user-actions"><button aria-label="复制原消息" onClick={async () => { try { await navigator.clipboard.writeText(original); setCopied(true); setError(''); } catch (e) { setError(e.message); } }}>{copied ? '已复制' : '复制'}</button>{data.time && <time dateTime={new Date(data.time).toISOString()}>{new Date(data.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}</div>
    {error && <span className="tx-cu-error" role="alert">{error}</span>}
  </div>;
}

export function installComputerReferenceMessages(ctx) {
  ctx.slots.inject('conversation.chat.node', () => {
    const installed = new Set(), disposers = [];
    const install = () => {
      for (const key of ['user', 'steering']) {
        if (installed.has(key)) continue;
        const original = ctx.slots.entriesOfSlot('conversation.chat.node').find(entry => entry.options.key === key);
        if (!original) continue;
        installed.add(key);
        const Original = original.component;
        function WithComputerReferences(props) {
          const text = (props.node.data.content ?? []).filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('');
          const parts = segments(text);
          return parts.some(p => p.reference) ? <ReferenceMessage {...props} parts={parts}/> : <Original {...props}/>;
        }
        disposers.push(ctx.slots.register({ name: 'conversation.chat.node', key, locale: 'chat', priority: (original.options.priority ?? 0) - 1 }, WithComputerReferences));
      }
    };
    const unsubscribe = ctx.slots.subscribe('conversation.chat.node', install); install();
    return () => { unsubscribe(); for (const dispose of disposers.reverse()) dispose(); };
  });
}
