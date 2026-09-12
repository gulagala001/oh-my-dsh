import React from 'react';

export function ComputerIcon({ name = 'screen', size = 16, ...props }) {
  const paths = {
    globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
    rotate: <><rect x="3" y="3" width="9" height="15" rx="2"/><path d="M7 15h1m8-9a6 6 0 0 1 5 6m0-5v5h-5M15 16h4a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-9"/></>,
    region: <><path d="M8 3H4v4m12-4h4v4M4 17v4h4m8 0h4v-4M4 11v2m16-2v2M11 3h2m-2 18h2"/></>,
    pointer: <path d="m5 3 14 10-7 1-3 7Z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></>,
    history: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6m3-4v6l4 2"/></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></>,
    book: <><path d="M12 5v16M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2Z"/></>,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 8 3 3-3 3m6 2h4"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8 21h8m-4-4v4"/></>,
    browser: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 8h18M7 5.5h.01M10 5.5h.01"/></>,
    share: <><rect x="3" y="7" width="18" height="14" rx="2.5"/><path d="M12 15V2m-4 4 4-4 4 4"/></>,
    preview: <><rect x="3" y="4" width="18" height="16" rx="2.5"/><rect x="11" y="11" width="7" height="6" rx="1"/></>,
    popout: <><path d="M14 3h7v7m0-7-9 9M10 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4"/></>,
    return: <><path d="M10 14H3V7m0 7 9-9m2 16h4a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h-4M3 18a3 3 0 0 0 3 3h4"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
    shrink: <path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    stack: <><rect x="6" y="8" width="15" height="13" rx="2.5"/><path d="M17 4H6a3 3 0 0 0-3 3v10"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>,
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>,
    annotate: <><path d="M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-6M15 3l6 6M10 14l-1 4 4-1L22 8a2 2 0 0 0-6-6Z"/></>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--cu-bg, Canvas)"/><circle cx="16" cy="17" r="3" fill="var(--cu-bg, Canvas)"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] ?? paths.screen}</svg>;
}
