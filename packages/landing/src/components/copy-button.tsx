import { css } from '@vertz/ui';

const PROMPT_TEXT = 'Build a full-stack to-do app using docs.vertz.dev';

const s = css({
  wrapper: ['flex', 'flex-col', 'gap:2', 'w:full'],
  labelRow: ['flex', 'items:center', 'gap:2'],
  label: ['font:xs', 'text:gray.500'],
  copyIcon: [
    'cursor:pointer',
    {
      '&': {
        background: 'none',
        border: 'none',
        padding: '0',
        display: 'inline-flex',
        'align-items': 'center',
        outline: 'none',
      },
    },
  ],
  prompt: [
    'flex',
    'items:center',
    'gap:3',
    'py:2.5',
    'px:4',
    'border:1',
    'w:full',
    {
      '&': {
        'background-color': '#1C1B1A',
        'border-color': '#2A2826',
        'border-radius': '2px',
        color: '#D4D0C8',
      },
    },
  ],
  promptPrefix: ['font:sm', 'text:gray.500', { '&': { 'white-space': 'nowrap' } }],
  promptText: ['font:sm', 'text:gray.400', { '&': { flex: '1', 'font-style': 'italic' } }],
  promptHighlight: [
    'weight:semibold',
    'text:gray.200',
    {
      '&': {
        'font-style': 'normal',
        'text-decoration': 'underline',
        'text-underline-offset': '3px',
        'text-decoration-color': '#52525b',
      },
    },
  ],
});

function TerminalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6B6560"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function ClipboardIcon({ color }: { color: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4ade80"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function CopyButton() {
  let copied = false;

  function handleClick() {
    navigator.clipboard.writeText(PROMPT_TEXT);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  return (
    <div className={s.wrapper}>
      <div className={s.labelRow}>
        <TerminalIcon />
        <span className={s.label} style={{ fontFamily: 'var(--font-mono)' }}>
          Ask your agent:
        </span>
        <button type="button" className={s.copyIcon} onClick={handleClick} aria-label="Copy prompt">
          {copied ? <CheckIcon /> : <ClipboardIcon color="#6B6560" />}
        </button>
      </div>
      <div className={s.prompt} style={{ fontFamily: 'var(--font-mono)' }}>
        <span className={s.promptText}>
          "Build a full-stack to-do app using{' '}
          <span className={s.promptHighlight}>docs.vertz.dev</span>"
        </span>
      </div>
    </div>
  );
}
