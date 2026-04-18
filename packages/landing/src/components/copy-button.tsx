import { css, token } from '@vertz/ui';

const PROMPT_TEXT = 'Build a full-stack to-do app using docs.vertz.dev';

const s = css({
  wrapper: { display: 'flex', flexDirection: 'column', gap: token.spacing[2], width: '100%' },
  labelRow: { display: 'flex', alignItems: 'center', gap: token.spacing[2] },
  label: { fontSize: token.font.size.xs, color: token.color.gray[500] },
  copyIcon: {
    cursor: 'pointer',
    '&': {
      background: 'none',
      border: 'none',
      padding: '0',
      display: 'inline-flex',
      alignItems: 'center',
      outline: 'none',
    },
  },
  prompt: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[3],
    paddingBlock: token.spacing['2.5'],
    paddingInline: token.spacing[4],
    borderWidth: '1px',
    width: '100%',
    '&': {
      backgroundColor: '#1C1B1A',
      borderColor: '#2A2826',
      borderRadius: '2px',
      color: '#D4D0C8',
    },
  },
  promptPrefix: {
    fontSize: token.font.size.sm,
    color: token.color.gray[500],
    '&': { whiteSpace: 'nowrap' },
  },
  promptText: {
    fontSize: token.font.size.sm,
    color: token.color.gray[400],
    '&': { flex: '1', fontStyle: 'italic' },
  },
  promptHighlight: {
    fontWeight: token.font.weight.semibold,
    color: token.color.gray[200],
    '&': {
      fontStyle: 'normal',
      textDecoration: 'underline',
      textUnderlineOffset: '3px',
      textDecorationColor: '#52525b',
    },
  },
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
