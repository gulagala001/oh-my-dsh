import React from 'react';

export function TerminalMark({ small, runtime }) {
  return small
    ? <span className="omd-cli-mark" aria-hidden="true">✳</span>
    : <span className="omd-cli-welcome"><span className="omd-cli-glyph" aria-hidden="true">{' ▗▄▄▄▖\n▐ ▪ ▪ ▌\n ▀▚▄▞▀'}</span><span><strong>{runtime.brand.placeholder}</strong><small>TERMINAL WORKSPACE</small></span></span>;
}
