import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
});

export function GetStarted() {
  return (
    <section class={s.section} style="background: #0e0e11; border-top: 1px solid rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.02)">
      <div style="max-width: 56rem; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center">
        <div>
          <h2 style="font-family: 'DM Serif Display', Georgia, serif; font-size: 2.25rem; margin-bottom: 1.5rem">
            Get started in 30 seconds.
          </h2>
          <p style="font-size: 1.125rem; color: #a1a1aa; margin-bottom: 1rem">
            Schema, API, and UI — running locally. Edit any layer. See it update instantly.
          </p>
        </div>
        <div style="background: #0a0a0b; border: 1px solid #1e1e22; padding: 1.5rem; border-radius: 0.5rem; font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1)">
          <div style="color: #71717a; margin-bottom: 0.5rem">$ bun create vertz my-app</div>
          <div style="color: #71717a; margin-bottom: 0.5rem">$ cd my-app</div>
          <div style="color: #71717a">$ bun dev</div>
          <div style="color: #34d399; margin-top: 1rem">✓ Full-stack app running on http://localhost:3000</div>
        </div>
      </div>
    </section>
  );
}
