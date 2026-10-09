import React, { useSyncExternalStore } from 'react';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { operationRowLocale, summarizeToolOutcomes } from './computer-groups.mjs';
import { SavedImage } from './tool-image.jsx';

// Native groups own ordering, disclosure and generic tool rendering.
// OpenCU only adds outcome badges and its attachment gallery.
export function computerGroupPresentation(ctx) {
  ctx.slots.inject('conversation.chat.node', () => decorateSlotComponent(ctx.slots, 'conversation.chat.node', key => key === 'turn-process', original => {
    const Original = original.component;
    function ProcessOutcomes(props) {
      const nodes = props.useChat(state => state.nodes);
      const source = nodes.turnDataSource(props.node.data.turn, 'tool-call');
      const data = useSyncExternalStore(source.subscribe, source.getSnapshot);
      const { failures, stopped } = summarizeToolOutcomes(data);
      return <span className="tx-cu-turn-outcomes"><Original {...props}/>{failures > 0 && <span className="tx-cu-error">{failures} 项失败</span>}{stopped > 0 && <span>{stopped} 项已停止</span>}</span>;
    }
    return ProcessOutcomes;
  }));
  ctx.slots.inject('tool.call.toolview', () => decorateSlotComponent(ctx.slots, 'tool.call.toolview', () => true, original => {
    const Original = original.component;
    function ToolPresentation(props) {
      const images = (name, owner, ...options) => {
        if (name !== 'tool.call.images') return props.renderSlot(name, owner, ...options);
        return <div className="tx-cu-result-images">{owner.images.map((item, index) => item.attachment ? <SavedImage key={index} attachment={item.attachment} loadImage={owner.loadImage}/> : null)}</div>;
      };
      return <Original {...props} {...(props.t && original.locale === 'conversation' ? { t: operationRowLocale(props.t, props.toolName, props.block) } : {})} {...(original.children?.['tool.call.images'] ? { renderSlot: images } : {})}/>;
    }
    return ToolPresentation;
  }));
}
