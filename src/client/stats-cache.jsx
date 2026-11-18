import React, { useCallback } from 'react';
import { decorateSlotComponent } from './slot-decoration.mjs';

// The native stats marker covers every measured hit rate below 50%, including
// partial hits. Keep its threshold and all native usage and price calculations.
export function applyStatsCacheLabel(ctx) {
  const labels = {
    zh: ['低命中', '缓存命中率低于 50%，实际命中比例见缓存列。'],
    en: ['Low hit rate', 'Cache hit rate below 50%. See the cache column for the measured rate.'],
    ja: ['低ヒット率', 'キャッシュヒット率は 50% 未満です。正確な値はキャッシュ列で確認できます。'],
    de: ['Niedrige Trefferquote', 'Die Cache-Trefferquote liegt unter 50 %. Der genaue Wert steht in der Cache-Spalte.'],
    es: ['Pocos aciertos', 'La tasa de aciertos de caché es inferior al 50 %. Consulta la columna de caché.'],
    fr: ['Taux faible', 'Le taux de lecture en cache est inférieur à 50 %. Consultez la colonne du cache.'],
    pt: ['Taxa baixa', 'A taxa de acertos do cache está abaixo de 50%. Consulte a coluna de cache.'],
    ru: ['Мало попаданий', 'Доля попаданий в кеш ниже 50 %. Точное значение указано в столбце кеша.'],
  };
  const namespace = 'omdStatsCache';
  ctx.effect(() => ctx.locale.register(namespace, Object.fromEntries(Object.entries(labels)
    .map(([locale, [label, title]]) => [locale, { label, title }]))));
  const translate = ctx.locale.bind(namespace);
  ctx.slots.inject('conversation.view', () => decorateSlotComponent(ctx.slots, 'conversation.view',
    (_key, entry) => entry.options.id === 'stats' && entry.locale === 'stats', entry => {
      const Original = entry.component;
      return function Stats(props) {
        const t = useCallback((key, ...args) => key === 'state.cacheMiss' ? translate('label')
          : key === 'state.cacheMiss.title' ? translate('title') : props.t(key, ...args), [props.t]);
        return <Original {...props} t={t}/>;
      };
    }));
}
