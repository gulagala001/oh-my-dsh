import React, { useSyncExternalStore } from 'react';
import { BrandMark } from './brand.jsx';
import { BrandNameWithVersion } from './version-info.jsx';
import { whaleSvg } from './brand.mjs';
import { brandDocumentTitle } from './document-title.mjs';

export function applyAppearanceBrand(ctx, getRuntime) {
  function Mark({ size = 32 }) {
    const runtime = getRuntime(), { advanced } = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
    return advanced.brand.logo === 'custom' && advanced.brand.image
      ? <img className="omd-custom-brand-image" src={advanced.brand.image} width={size} height={size} alt="" aria-hidden="true"/>
      : <BrandMark size={size}/>;
  }
  function Name() {
    const runtime = getRuntime(), { advanced } = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
    return <BrandNameWithVersion name={advanced.brand.logo === 'custom' ? advanced.brand.name : ''}/>;
  }
  for (const [name, Component] of [['sidebar.brand.mark', Mark], ['sidebar.brand.name', Name], ['conversation.hero.brand.mark', Mark]]) {
    ctx.slots.inject(name, () => {
      const runtime = getRuntime(); let dispose;
      const sync = () => {
        if (runtime.getSnapshot().advanced.brand.logo === 'native') { dispose?.(); dispose = undefined; }
        else if (!dispose) dispose = ctx.slots.register({ name, priority: -10 }, Component);
      };
      const off = runtime.subscribe(sync); sync();
      return () => { off(); dispose?.(); };
    });
  }
  ctx.effect(() => {
    const runtime = getRuntime();
    const title = brandDocumentTitle(document, { mode: 'native' });
    let icon, last = '';
    const sync = () => {
      const brand = runtime.getSnapshot().advanced.brand, key = JSON.stringify(brand);
      if (key === last) return; last = key;
      title.update?.({ mode: brand.title, text: brand.titleText });
      if (brand.logo === 'native') { icon?.remove(); icon = undefined; }
      else {
        if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; icon.dataset.omdFavicon = ''; document.head.append(icon); }
        icon.type = brand.logo === 'custom' && brand.image ? 'image/png' : 'image/svg+xml';
        icon.href = brand.logo === 'custom' && brand.image ? brand.image : 'data:image/svg+xml,' + encodeURIComponent(whaleSvg('omd-favicon'));
      }
    };
    const off = runtime.subscribe(sync); sync();
    return () => { off(); title(); icon?.remove(); };
  });
}
