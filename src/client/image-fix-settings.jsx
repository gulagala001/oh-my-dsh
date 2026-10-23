import React, { useEffect, useId, useState } from 'react';
import { Button, Choice, Input, Switch } from './native-controls.jsx';
import { Icon } from './native-icons.jsx';
import { DEFAULT_IMAGE_RULE, DEFAULT_IMAGE_RULES, validateImageRules } from '../image-rules.mjs';

const draftOf = rule => ({ maxImages: String(rule.maxImages), maxBytes: String(rule.maxBytes / 1000000), keepImages: String(rule.keepImages) });
const fields = [['maxImages', '图片数量上限', '张'], ['maxBytes', '图片总大小上限', 'MB'], ['keepImages', '整理后保留', '张']];

function RuleFields({ rule, disabled, change }) {
  const id = useId(), [draft, setDraft] = useState(() => draftOf(rule)), [error, setError] = useState('');
  useEffect(() => { setDraft(draftOf(rule)); setError(''); }, [rule.provider, rule.maxImages, rule.maxBytes, rule.keepImages]);
  const save = () => {
    if (disabled) return;
    const next = { provider: rule.provider, maxImages: Number(draft.maxImages),
      maxBytes: Math.round(Number(draft.maxBytes) * 1000000), keepImages: Number(draft.keepImages) };
    try {
      if (Object.values(draft).some(value => !value.trim())) throw Error('请填写完整的图片限制');
      validateImageRules([next]); setError('');
      if (Object.keys(next).some(key => next[key] !== rule[key])) void change(next);
    } catch (failure) { setError(failure.message); }
  };
  return <div className="omd-image-fields">
    {fields.map(([key, label, unit]) => <div className="omd-image-field" key={key}>
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <div className="omd-image-value"><Input id={`${id}-${key}`} aria-label={label} inputMode={key === 'maxBytes' ? 'decimal' : 'numeric'}
        aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${id}-error` : undefined} disabled={disabled}
        value={draft[key]} onChange={event => { setDraft({ ...draft, [key]: event.target.value }); setError(''); }}
        onBlur={save} onKeyDown={event => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); save(); }
          if (event.key === 'Escape') { setDraft(draftOf(rule)); setError(''); }
        }}/><small>{unit}</small></div>
    </div>)}
    {error && <div id={`${id}-error`} className="omd-set-status omd-set-error" role="alert">{error}</div>}
  </div>;
}

export function ImageFixSettings({ config, directory, commit }) {
  const [expanded, setExpanded] = useState(false), [opened, setOpened] = useState(''), [adding, setAdding] = useState(false);
  const [choice, setChoice] = useState(''), [pending, setPending] = useState(false), id = useId();
  const enabled = config.multiImageFixEnabled !== false, rules = config.multiImageFixRules ?? DEFAULT_IMAGE_RULES;
  const name = provider => directory.find(item => item.id === provider)?.name || (provider === 'cmdgoat-responses' ? 'CMD' : provider);
  const available = directory.filter(item => !rules.some(rule => rule.provider === item.id));
  const save = async patch => { setPending(true); try { return await commit(patch); } finally { setPending(false); } };
  const update = next => save({ multiImageFixRules: rules.map(rule => rule.provider === next.provider ? next : rule) });
  const remove = provider => save({ multiImageFixRules: rules.filter(rule => rule.provider !== provider) });
  const add = async () => {
    if (!available.some(item => item.id === choice)) return;
    if (await save({ multiImageFixRules: [...rules, { provider: choice, ...DEFAULT_IMAGE_RULE }] })) { setChoice(''); setAdding(false); }
  };
  const selected = rules.length ? `已选 ${rules.length < 3 ? rules.map(rule => name(rule.provider)).join('、') : `${name(rules[0].provider)} 等 ${rules.length} 个渠道`}` : '未选择渠道';
  return <div className="omd-set-row omd-image-settings">
    <div className="omd-image-header">
      <Button type="button" variant="ghost" className="omd-image-disclosure" aria-expanded={expanded} aria-controls={`${id}-body`} onClick={() => setExpanded(!expanded)}>
        <Icon name="chevron" size={14} className={expanded ? 'omd-image-open' : ''}/>
        <span className="omd-set-copy"><strong>多图请求修复</strong><small>{enabled ? selected : `已关闭 · ${selected}`}</small></span>
      </Button>
      <Switch label="多图请求修复" checked={enabled} disabled={pending} onChange={value => void save({ multiImageFixEnabled: value })}/>
    </div>
    {expanded && <div id={`${id}-body`} className="omd-image-body">
      <div className="omd-image-channels">
        {!rules.length && <div className="omd-image-empty">添加需要启用修复的渠道</div>}
        {rules.map((rule, index) => <div className="omd-image-channel" key={rule.provider}>
          <div className="omd-image-header">
            <Button type="button" variant="ghost" className="omd-image-disclosure" aria-expanded={opened === rule.provider}
              aria-controls={`${id}-channel-${index}`} onClick={() => setOpened(opened === rule.provider ? '' : rule.provider)}>
              <Icon name="chevron" size={14} className={opened === rule.provider ? 'omd-image-open' : ''}/><span>{name(rule.provider)}</span>
              {!directory.some(item => item.id === rule.provider) && <small className="omd-image-unavailable">未配置</small>}
            </Button>
            <Button type="button" variant="ghost" size="sm" aria-label={`移除 ${name(rule.provider)}`} disabled={!enabled || pending} onClick={() => void remove(rule.provider)}><Icon name="close" size={14}/></Button>
          </div>
          {opened === rule.provider && <div id={`${id}-channel-${index}`}><RuleFields rule={rule} disabled={!enabled || pending} change={update}/></div>}
        </div>)}
      </div>
      {adding ? <div className="omd-image-add">
        <Choice aria-label="选择要添加的渠道" disabled={!enabled || pending} value={choice} onChange={setChoice}
          options={[{ value: '', label: '选择已配置的渠道' }, ...available.map(item => ({ value: item.id, label: item.name || item.id }))]}/>
        <Button type="button" size="sm" disabled={!enabled || pending || !available.some(item => item.id === choice)} onClick={() => void add()}>添加</Button>
        <Button type="button" size="sm" variant="ghost" aria-label="取消添加" onClick={() => setAdding(false)}><Icon name="close" size={14}/></Button>
      </div> : <Button type="button" variant="ghost" size="sm" disabled={!enabled || pending || !available.length} onClick={() => setAdding(true)}>＋ 添加渠道</Button>}
      <p className="omd-image-note">仅对所选渠道生效。批量减少历史图片发送，原图仍可回查；最新未读图片受保护。整理可能影响当次缓存。</p>
    </div>}
  </div>;
}
