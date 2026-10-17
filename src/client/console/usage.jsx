import React from 'react';
import { Icon } from './ui.jsx';
import { bucketAmount, compact, fmt } from '../monitor-format.mjs';

const parts = [['inputTokens', 'input', '未缓存输入'], ['outputTokens', 'output', '输出'], ['cacheReadTokens', 'cache', '缓存读取']];

export function Usage({ metric = {} }) {
  return <span className="omc-usage">{parts.map(([key, icon, label]) => {
    const title = `${label}：${bucketAmount(metric, key, fmt)} Token`;
    return <span key={key} className={`omc-usage-${icon}`} title={title} aria-label={title}>
      <Icon name={icon} size={14}/><b>{bucketAmount(metric, key, compact).replace('k', 'K')}</b>
    </span>;
  })}</span>;
}
