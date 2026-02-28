import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';

type SwitchBlocks = {
  root: StyleEntry[];
  thumb: StyleEntry[];
  rootSm: StyleEntry[];
  thumbSm: StyleEntry[];
};

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    {
      property: 'outline',
      value: '3px solid color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
    { property: 'outline-offset', value: '2px' },
  ],
};

/** Create switch css() styles. */
export function createSwitchStyles(): CSSOutput<SwitchBlocks> {
  const s = css({
    switchRoot: [
      'inline-flex',
      'shrink-0',
      'h:6',
      'w:11',
      'items:center',
      'rounded:full',
      'border:2',
      'border:transparent',
      'cursor:pointer',
      'bg:input',
      'shadow:xs',
      'transition:colors',
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
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
    switchRootSm: [
      'inline-flex',
      'shrink-0',
      'h:5',
      'w:9',
      'items:center',
      'rounded:full',
      'border:2',
      'border:transparent',
      'cursor:pointer',
      'bg:input',
      'shadow:xs',
      'transition:colors',
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      {
        '&[data-state="checked"]': ['bg:primary'],
        '&[data-state="unchecked"]': ['bg:input'],
      },
    ],
    switchThumbSm: [
      'block',
      'h:4',
      'w:4',
      'rounded:full',
      'bg:background',
      'shadow:sm',
      'transition:transform',
    ],
  });
  return {
    root: s.switchRoot,
    thumb: s.switchThumb,
    rootSm: s.switchRootSm,
    thumbSm: s.switchThumbSm,
    css: s.css,
  } as CSSOutput<SwitchBlocks>;
}
