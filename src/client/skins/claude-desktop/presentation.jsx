import React from 'react';

// Decorative spark from open-claude-ui's message presentation; product text
// and all host controls remain in their existing slots.
export function ClaudeDesktopMark({ small }) {
  return <span className="omd-claude-mark" data-small={small || undefined} aria-hidden="true">✳</span>;
}
