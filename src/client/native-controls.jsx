import React, { Children, isValidElement, useId, useRef, useState } from 'react';
import { Button, Input, Switch, Checkbox, SegmentedControl, Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

export { Button, Input, Switch, Checkbox, SegmentedControl };

export const isSelectMenuTarget = target => Boolean(target?.closest?.('[role="menu"]')?.querySelector('[data-omd-select-option]'));

// DSH's own settings selectors use Menu. Keep the existing option/value face
// while sharing the host's real button, menu, focus and keyboard behavior.
export function Select({ children, value, onChange, disabled, className, style, id, title, 'aria-label': label }) {
  const [open, setOpen] = useState(false), root = useRef(null), generated = useId();
  const items = [], options = [];
  const collect = (nodes, groupDisabled = false) => Children.forEach(nodes, child => {
    if (!isValidElement(child)) return;
    if (child.type === 'optgroup') {
      items.push({ type: 'label', id: `group-${items.length}`, text: child.props.label });
      collect(child.props.children, groupDisabled || child.props.disabled);
    } else if (child.type === 'option') {
      const option = { id: `option-${options.length}`, value: String(child.props.value ?? child.props.children),
        label: <span data-omd-select-option="">{child.props.children}</span>,
        disabled: Boolean(groupDisabled || child.props.disabled) };
      items.push(option); options.push(option);
    } else collect(child.props.children, groupDisabled);
  });
  collect(children);
  const selected = options.find(option => option.value === String(value));
  return <span ref={root} className={['omd-native-select', className].filter(Boolean).join(' ')} style={style}>
    <Menu open={open} onClose={() => setOpen(false)} items={items} selectedId={selected?.id} portal align="end"
      onSelect={next => {
        if (disabled || root.current?.querySelector('button')?.matches(':disabled')) return;
        const option = options.find(item => item.id === next);
        if (!option || option.disabled) return;
        setOpen(false);
        if (option.value !== String(value)) onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } });
      }} anchor={<Button id={id ?? generated} type="button" variant="outline" size="sm" disabled={disabled}
        aria-label={label} title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)}>
        <span className="omd-native-select-value">{selected?.label ?? ''}</span><IconChevronDownOutlineRegular/>
      </Button>}/>
  </span>;
}
