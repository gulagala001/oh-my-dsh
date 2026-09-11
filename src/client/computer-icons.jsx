import React from 'react';

export function ComputerIcon({ name = 'screen', size = 16, ...props }) {
  const paths = {
    screen: <><rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8 21h8m-4-4v4"/></>,
    browser: <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 8h18M7 5.5h.01M10 5.5h.01"/></>,
    share: <><rect x="3" y="7" width="18" height="14" rx="2.5"/><path d="M12 15V2m-4 4 4-4 4 4"/></>,
    preview: <><rect x="3" y="4" width="18" height="16" rx="2.5"/><rect x="11" y="11" width="7" height="6" rx="1"/></>,
    popout: <><path d="M14 3h7v7m0-7-9 9M10 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4"/></>,
    return: <><path d="M10 14H3V7m0 7 9-9m2 16h4a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h-4M3 18a3 3 0 0 0 3 3h4"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    stack: <><rect x="6" y="8" width="15" height="13" rx="2.5"/><path d="M17 4H6a3 3 0 0 0-3 3v10"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>,
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>,
    annotate: <><path d="M12 4H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-6M15 3l6 6M10 14l-1 4 4-1L22 8a2 2 0 0 0-6-6Z"/></>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--cu-bg, Canvas)"/><circle cx="16" cy="17" r="3" fill="var(--cu-bg, Canvas)"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] ?? paths.screen}</svg>;
}
