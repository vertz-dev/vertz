import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:4xl', 'mx:auto', 'grid', 'grid-cols:2', 'gap:12', 'items:center'],
  heading: ['font:4xl', 'mb:6'],
  desc: ['font:lg', 'mb:4'],
  terminal: ['p:6', 'rounded:lg', 'font:sm', 'border:1'],
  terminalLine: ['mb:2'],
  successLine: ['mt:4'],
});

export function GetStarted() {
  return (
    <section
      class={s.section}
      style="background: #0e0e11; border-top: 1px solid rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.02)"
    >
      <div class={s.container}>
        <div>
          <h2 class={s.heading} style="font-family: 'DM Serif Display', Georgia, serif">
            Get started in 30 seconds.
          </h2>
          <p class={s.desc} style="color: #a1a1aa">
            SQLite database, REST API, and UI — all running locally. No Docker. No config files.
            Edit any layer and see it update instantly.
          </p>
        </div>
        <div
          class={s.terminal}
          style="background: #0a0a0b; border-color: #1e1e22; font-family: 'JetBrains Mono', monospace; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1)"
        >
          <div class={s.terminalLine} style="color: #71717a">
            $ bun create vertz my-app
          </div>
          <div class={s.terminalLine} style="color: #71717a">
            $ cd my-app
          </div>
          <div style="color: #71717a">$ bun dev</div>
          <div class={s.successLine} style="color: #34d399">
            ✓ SQLite database ready
          </div>
          <div style="color: #34d399">✓ API server on http://localhost:3000/api</div>
          <div style="color: #34d399">✓ UI on http://localhost:3000</div>
        </div>
      </div>
    </section>
  );
}
