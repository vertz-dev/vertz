import { css } from '@vertz/ui';

const s = css({
  section: ['flex', 'flex-col', 'items:center', 'justify:center', 'px:6'],
  badge: ['flex', 'items:center', 'gap:2', 'mb:8'],
  ctas: ['mt:12', 'flex', 'flex-col', 'items:center', 'gap:4'],
});

export function Hero() {
  return (
    <section class={s.section} style="min-height: 100vh; text-align: center">
      <div class={s.badge}>
        <span style="position: relative; display: flex; height: 0.625rem; width: 0.625rem">
          <span style="position: absolute; display: inline-flex; height: 100%; width: 100%; border-radius: 9999px; background: #60a5fa; opacity: 0.4" />
          <span style="position: relative; display: inline-flex; border-radius: 9999px; height: 0.625rem; width: 0.625rem; background: #3b82f6" />
        </span>
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a">
          Public Beta
        </span>
      </div>

      <h1 style="font-family: 'DM Serif Display', Georgia, serif; font-size: clamp(3rem, 8vw, 6rem); letter-spacing: -0.025em; line-height: 1.1; max-width: 56rem">
        <span style="display: block">One command.</span>
        <span style="display: block; color: #a1a1aa">Full stack. Running.</span>
      </h1>

      <p style="margin-top: 2rem; font-size: 1.25rem; color: #a1a1aa; max-width: 42rem; line-height: 1.625">
        One command. Database, API, and UI — running locally.{' '}
        <span style="color: #e4e4e7; font-weight: 500">Define your schema once. Everything else is derived. Zero config.</span>
      </p>

      <div class={s.ctas} style="flex-direction: row">
        <CopyButton />
        <a
          href="https://github.com/vertz-dev/vertz"
          target="_blank"
          rel="noopener"
          style="display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1.5rem; color: #a1a1aa; font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; transition: color 0.15s"
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
    setTimeout(() => { copied = false; }, 2000);
  }

  return (
    <button
      onClick={handleClick}
      style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 1.5rem; background: #111113; border: 2px solid #1e1e22; color: #d4d4d8; font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; cursor: pointer; box-shadow: 4px 4px 0 rgba(255,255,255,0.06); transition: all 0.15s"
    >
      <span style="color: #71717a">$</span> bun create vertz my-app
      <span style="color: #71717a; font-size: 0.75rem">{copied ? 'Copied!' : '(click to copy)'}</span>
    </button>
  );
}
