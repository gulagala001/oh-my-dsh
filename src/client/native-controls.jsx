import React, { Children, isValidElement, useId, useRef, useState } from 'react';
import { Button, Input, Switch, Checkbox, SegmentedControl as NativeSegmentedControl, Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

export { Button, Input, Switch, Checkbox };

export function SegmentedControl({ id, ...props }) {
  const generated = useId();
  return <div className="omd-native-segments"><NativeSegmentedControl {...props} id={id ?? generated}/></div>;
}

export const isSelectMenuTarget = target => Boolean(target?.closest?.('[role="menu"]')?.querySelector('[data-omd-select-option]'));

// DSH's own settings selectors use Menu: the host's real button, menu, focus
// and keyboard behavior. Options are { value, label, disabled?, group? }.
export function Choice({ value, options, onChange, disabled, className, style, id, title, 'aria-label': label }) {
  const [open, setOpen] = useState(false), root = useRef(null), generated = useId();
  const items = [];
  let group;
  options.forEach((option, index) => {
    if (option.group !== group) { group = option.group; if (group) items.push({ type: 'label', id: `group-${index}`, text: group }); }
    items.push({ id: `option-${index}`, label: <span data-omd-select-option="">{option.label}</span>, disabled: Boolean(option.disabled), option });
  });
  const selected = items.find(item => item.option && String(item.option.value) === String(value));
  return <span ref={root} className={['omd-native-select', className].filter(Boolean).join(' ')} style={style}>
    <Menu open={open} onClose={() => setOpen(false)} items={items} selectedId={selected?.id} portal align="end"
      onSelect={next => {
        if (disabled) return;
        const item = items.find(entry => entry.id === next);
        if (!item?.option || item.disabled) return;
        setOpen(false);
        if (String(item.option.value) !== String(value)) onChange?.(item.option.value);
      }} anchor={<Button id={id ?? generated} type="button" variant="outline" size="sm" disabled={disabled}
        aria-label={label} title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)}>
        <span className="omd-native-select-value">{selected?.label ?? ''}</span><IconChevronDownOutlineRegular/>
      </Button>}/>
  </span>;
}

// <select>-shaped wrapper kept for existing option/optgroup markup.
export function Select({ children, value, onChange, ...props }) {
  const options = [];
  const collect = (nodes, group, groupDisabled = false) => Children.forEach(nodes, child => {
    if (!isValidElement(child)) return;
    if (child.type === 'optgroup') collect(child.props.children, child.props.label, groupDisabled || child.props.disabled);
    else if (child.type === 'option') options.push({ value: String(child.props.value ?? child.props.children), label: child.props.children, group, disabled: Boolean(groupDisabled || child.props.disabled) });
    else collect(child.props.children, group, groupDisabled);
  });
  collect(children);
  return <Choice {...props} value={String(value)} options={options} onChange={next => onChange?.({ target: { value: next }, currentTarget: { value: next } })}/>;
}
