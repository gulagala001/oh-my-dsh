import React, { useId, useMemo } from 'react';
import { whaleSvg } from './brand.mjs';

export function BrandMark({ size = 32, className = '' }) {
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const artwork = useMemo(() => ({ __html: whaleSvg('omd-' + instance) }), [instance]);
  const edge = Math.max(32, size);
  return <span className={'tx-brand-mark ' + className} style={{ width: edge, height: edge }} aria-hidden="true" dangerouslySetInnerHTML={artwork}/>;
}
