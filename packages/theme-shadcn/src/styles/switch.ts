import type { CSSOutput, RawDeclaration, StyleEntry } from '@vertz/ui';
import { css } from '@vertz/ui';
import { bgOpacity, DARK } from './_helpers';

type SwitchBlocks = {
  root: StyleEntry[];
  thumb: StyleEntry[];
  rootSm: StyleEntry[];
  thumbSm: StyleEntry[];
};

const focusRing: Record<string, (string | RawDeclaration)[]> = {
  '&:focus-visible': [
    'outline-none',
    'border:ring',
    {
      property: 'box-shadow',
      value: '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
    },
  ],
};

/** Create switch css() styles. */
export function createSwitchStyles(): CSSOutput<SwitchBlocks> {
  const s = css({
    switchRoot: [
      'inline-flex',
      'shrink-0',
      'items:center',
      'rounded:full',
      'border:1',
      'border:transparent',
      'cursor:pointer',
      'bg:input',
      'transition:colors',
      'h:5',
      'w:8',
      { [DARK]: [bgOpacity('input', 80)] },
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      {
        '&[data-state="checked"]': ['bg:primary'],
        '&[data-state="unchecked"]': ['bg:input'],
      },
    ],
    switchThumb: [
      'block',
      'h:4',
      'w:4',
      'rounded:full',
      'bg:background',
      {
        '&': [
          {
            property: 'transition',
            value: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1), width 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          },
        ],
      },
      {
        '&[data-state="unchecked"]': [{ property: 'transform', value: 'translateX(0)' }],
        '&[data-state="checked"]': [
          { property: 'transform', value: 'translateX(calc(100% - 2px))' },
        ],
      },
      {
        'button:active > &[data-state="unchecked"]': [
          'w:5',
          { property: 'transform', value: 'translateX(0)' },
        ],
        'button:active > &[data-state="checked"]': [
          'w:5',
          { property: 'transform', value: 'translateX(0.625rem)' },
        ],
      },
      {
        [`${DARK}[data-state="unchecked"]`]: [
          { property: 'background-color', value: 'var(--color-foreground)' },
        ],
      },
      {
        [`${DARK}[data-state="checked"]`]: [
          { property: 'background-color', value: 'var(--color-primary-foreground)' },
        ],
      },
    ],
    switchRootSm: [
      'inline-flex',
      'shrink-0',
      'items:center',
      'rounded:full',
      'border:1',
      'border:transparent',
      'cursor:pointer',
      'bg:input',
      'transition:colors',
      'h:3.5',
      'w:6',
      { [DARK]: [bgOpacity('input', 80)] },
      focusRing,
      { '&:disabled': ['pointer-events-none', 'opacity:0.5'] },
      {
        '&[data-state="checked"]': ['bg:primary'],
        '&[data-state="unchecked"]': ['bg:input'],
      },
    ],
    switchThumbSm: [
      'block',
      'h:3',
      'w:3',
      'rounded:full',
      'bg:background',
      {
        '&': [
          {
            property: 'transition',
            value: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1), width 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          },
        ],
      },
      {
        '&[data-state="unchecked"]': [{ property: 'transform', value: 'translateX(0)' }],
        '&[data-state="checked"]': [
          { property: 'transform', value: 'translateX(calc(100% - 2px))' },
        ],
      },
      {
        'button:active > &[data-state="unchecked"]': [
          'w:3.5',
          { property: 'transform', value: 'translateX(0)' },
        ],
        'button:active > &[data-state="checked"]': [
          'w:3.5',
          { property: 'transform', value: 'translateX(0.5rem)' },
        ],
      },
      {
        [`${DARK}[data-state="unchecked"]`]: [
          { property: 'background-color', value: 'var(--color-foreground)' },
        ],
      },
      {
        [`${DARK}[data-state="checked"]`]: [
          { property: 'background-color', value: 'var(--color-primary-foreground)' },
        ],
      },
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
