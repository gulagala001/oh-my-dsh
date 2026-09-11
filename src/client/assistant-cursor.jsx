import React, { useEffect, useState } from 'react';

export function AssistantCursor({ cursor, frame }) {
  const [expired, setExpired] = useState(null);
  const [pulseExpired, setPulseExpired] = useState(null);
  const identity = cursor && cursor.source + ':' + cursor.sequence;
  const pulse = cursor?.press && cursor.source + ':' + cursor.press.sequence;
  useEffect(() => {
    if (!identity) return;
    const timer = setTimeout(() => setExpired(identity), 1500);
    return () => clearTimeout(timer);
  }, [identity]);
  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulseExpired(pulse), 250);
    return () => clearTimeout(timer);
  }, [pulse]);
  if (!cursor || !frame || expired === identity || cursor.loaderId !== frame.loaderId || !cursor.geometry ||
      Object.keys(cursor.geometry).some(key => cursor.geometry[key] !== frame.geometry?.[key])) return null;
  const x = cursor.x / frame.width, y = cursor.y / frame.height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
  const pressed = cursor.buttons !== 0;
  return <>
    {pulse && pulseExpired !== pulse && <span key={pulse} aria-hidden="true" className="tx-cu-cursor-pulse" style={{ left: cursor.press.x / frame.width * 100 + '%', top: cursor.press.y / frame.height * 100 + '%' }}/>}
    <span className={'tx-cu-assistant-cursor' + (pressed ? ' is-pressed' : '')} aria-hidden="true"
    data-sequence={cursor.sequence} data-state={pressed ? 'pressed' : 'moving'} style={{ left: x * 100 + '%', top: y * 100 + '%' }}>
    <svg width="22" height="27" viewBox="0 0 22 27" fill="none"><path d="M2 2L19 14.5L11.6 15.5L7.7 22.5L2 2Z" fill="#17191c" stroke="white" strokeWidth="2" strokeLinejoin="round"/></svg>
  </span></>;
}
