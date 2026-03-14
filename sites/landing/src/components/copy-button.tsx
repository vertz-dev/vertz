import { css } from '@vertz/ui';

const s = css({
  copyButton: [
    'flex',
    'items:center',
    'justify:between',
    'gap:4',
    'py:3',
    'px:6',
    'font:sm',
    'cursor:pointer',
    'border:2',
    'bg:gray.950',
    'text:gray.300',
    'relative',
  ],
  copyPrefix: [
    'font:xs',
    'text:gray.500',
    { '&': [{ property: 'display', value: 'none' }] },
    { '@media (min-width: 640px)': [{ property: 'display', value: 'inline-grid' }] },
  ],
  dollarSign: ['text:gray.500'],
  mobileBadge: [
    'absolute',
    'font:xs',
    'py:1',
    'px:3',
    'rounded:md',
    'z:50',
    { '&': [
      { property: 'right', value: '0.5rem' },
      { property: 'top', value: '-0.5rem' },
      { property: 'background', value: '#4ade80' },
      { property: 'color', value: '#0a0a0b' },
      { property: 'pointer-events', value: 'none' },
      { property: 'white-space', value: 'nowrap' },
      { property: 'transition', value: 'opacity 0.2s' },
      { property: 'font-weight', value: '500' },
    ] },
    { '@media (min-width: 640px)': [{ property: 'display', value: 'none' }] },
  ],
});

export default function CopyButton() {
  let copied = false;

  function handleClick() {
    navigator.clipboard.writeText('bun create vertz my-app');
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      class={s.copyButton}
      style="font-family: var(--font-mono); border-color: #1e1e22; box-shadow: 4px 4px 0 rgba(255,255,255,0.06); transition: all 0.15s"
    >
      <span class={s.mobileBadge} style={copied ? 'opacity: 1' : 'opacity: 0'}>
        Copied!
      </span>
      <span class={s.dollarSign}>$</span> bun create vertz my-app
      <span class={s.copyPrefix}>
        <span style="grid-area: 1/1; visibility: hidden; pointer-events: none">
          (click to copy)
        </span>
        <span style="grid-area: 1/1">{copied ? 'Copied!' : '(click to copy)'}</span>
      </span>
    </button>
  );
}
