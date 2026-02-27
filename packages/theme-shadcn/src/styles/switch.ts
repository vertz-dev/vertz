import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type SwitchBlocks = {
  root: StyleEntry[];
  thumb: StyleEntry[];
};

/** Create switch css() styles. */
export function createSwitchStyles(): CSSOutput<SwitchBlocks> {
  const s = css({
    switchRoot: [
      'inline-flex',
      'h:6',
      'w:11',
      'items:center',
      'rounded:full',
      'border:2',
      'border:transparent',
      'cursor:pointer',
      'bg:input',
      'transition:colors',
      'focus-visible:outline-none',
      'focus-visible:ring:2',
      'focus-visible:ring:ring',
      'disabled:opacity:0.5',
      'disabled:cursor:default',
      {
        '&[data-state="checked"]': ['bg:primary'],
        '&[data-state="unchecked"]': ['bg:input'],
      },
    ],
    switchThumb: [
      'block',
      'h:5',
      'w:5',
      'rounded:full',
      'bg:background',
      'shadow:sm',
      'transition:transform',
    ],
  });
  return {
    root: s.switchRoot,
    thumb: s.switchThumb,
    css: s.css,
  } as CSSOutput<SwitchBlocks>;
}
