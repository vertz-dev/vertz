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
    { '&': { display: 'none' } },
    { '@media (min-width: 640px)': { display: 'inline-grid' } },
  ],
  dollarSign: ['text:gray.500'],
  mobileBadge: [
    'absolute',
    'font:xs',
    'py:1',
    'px:3',
    'rounded:md',
    'z:50',
    {
      '&': {
        right: '0.5rem',
        top: '-0.5rem',
        background: '#4ade80',
        color: '#0a0a0b',
        'pointer-events': 'none',
        'white-space': 'nowrap',
        transition: 'opacity 0.2s',
        'font-weight': '500',
      },
    },
    { '@media (min-width: 640px)': { display: 'none' } },
  ],
});

export default function CopyButton() {
  let copied = false;

  function handleClick() {
    navigator.clipboard.writeText('bun create vertz@latest my-app');
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={s.copyButton}
      style={{ fontFamily: 'var(--font-mono)', borderColor: '#1e1e22', boxShadow: '4px 4px 0 rgba(255,255,255,0.06)', transition: 'all 0.15s' }}
    >
      <span className={s.mobileBadge} style={{ opacity: copied ? '1' : '0' }}>
        Copied!
      </span>
      <span className={s.dollarSign}>$</span> bun create vertz@latest my-app
      <span className={s.copyPrefix}>
        <span style={{ gridArea: '1/1', visibility: 'hidden', pointerEvents: 'none' }}>
          (click to copy)
        </span>
        <span style={{ gridArea: '1/1' }}>{copied ? 'Copied!' : '(click to copy)'}</span>
      </span>
    </button>
  );
}
