import { css } from '@vertz/ui';

const MONO = "font-family: 'JetBrains Mono', monospace";

const s = css({
  section: [
    'flex',
    'flex-col',
    'items:center',
    'justify:center',
    'px:6',
    'min-h:screen',
    'text:center',
  ],
  badge: ['flex', 'items:center', 'gap:2', 'mb:8'],
  badgeDotWrap: ['relative', 'flex', 'h:2.5', 'w:2.5'],
  badgeDotPing: ['absolute', 'inline-flex', 'h:full', 'w:full', 'rounded:full'],
  badgeDot: ['relative', 'inline-flex', 'rounded:full', 'h:2.5', 'w:2.5'],
  badgeText: ['font:xs', 'tracking:widest', 'uppercase'],
  h1: ['max-w:4xl'],
  h1Line: ['block'],
  description: ['mt:8', 'font:xl', 'max-w:2xl', 'leading:relaxed'],
  descriptionHighlight: ['weight:medium'],
  ctas: ['mt:12', 'flex', 'flex-row', 'items:center', 'gap:4'],
  githubLink: [
    'inline-flex',
    'items:center',
    'justify:center',
    'gap:2',
    'py:3',
    'px:6',
    'font:sm',
    'uppercase',
    'tracking:wider',
    'transition:colors',
  ],
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
  ],
  copyPrefix: ['font:xs'],
});

export function Hero() {
  return (
    <section class={s.section}>
      <div class={s.badge}>
        <span class={s.badgeDotWrap}>
          <span class={s.badgeDotPing} style="background: #60a5fa; opacity: 0.4" />
          <span class={s.badgeDot} style="background: #3b82f6" />
        </span>
        <span class={s.badgeText} style={`${MONO}; color: #71717a`}>
          Public Beta
        </span>
      </div>

      <h1
        class={s.h1}
        style="font-family: 'DM Serif Display', Georgia, serif; font-size: clamp(3rem, 8vw, 6rem); letter-spacing: -0.025em; line-height: 1.1"
      >
        <span class={s.h1Line}>One command.</span>
        <span class={s.h1Line} style="color: #a1a1aa">
          Full stack. Running.
        </span>
      </h1>

      <p class={s.description} style="color: #a1a1aa">
        One command. Database, API, and UI — running locally.{' '}
        <span class={s.descriptionHighlight} style="color: #e4e4e7">
          Define your schema once. Everything else is derived. Zero config.
        </span>
      </p>

      <div class={s.ctas}>
        <CopyButton />
        <a
          href="https://github.com/vertz-dev/vertz"
          target="_blank"
          rel="noopener"
          class={s.githubLink}
          style={`${MONO}; color: #a1a1aa`}
        >
          View on GitHub →
        </a>
      </div>
    </section>
  );
}

function CopyButton() {
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
      style={`${MONO}; background: #111113; border-color: #1e1e22; color: #d4d4d8; box-shadow: 4px 4px 0 rgba(255,255,255,0.06); transition: all 0.15s`}
    >
      <span style="color: #71717a">$</span> bun create vertz my-app
      <span class={s.copyPrefix} style="color: #71717a">
        {copied ? 'Copied!' : '(click to copy)'}
      </span>
    </button>
  );
}
