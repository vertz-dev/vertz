import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: [
    'max-w:4xl',
    'mx:auto',
    'grid',
    'gap:12',
    'items:center',
    { '@media (min-width: 768px)': { 'grid-template-columns': '1fr 1fr' } },
  ],
  heading: ['font:4xl', 'mb:6'],
  desc: ['font:lg', 'mb:4', 'text:gray.400'],
  terminal: [
    'p:6',
    'rounded:lg',
    'font:sm',
    'border:1',
    'bg:gray.950',
    { '&': { 'overflow-x': 'auto' } },
  ],
  terminalLine: ['mb:2'],
  terminalCmd: ['text:gray.500'],
  successLine: ['mt:4'],
  success: [],
});

export function GetStarted() {
  return (
    <section
      className={s.section}
      style="background: #0e0e11; border-top: 1px solid rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.02)"
    >
      <div className={s.container}>
        <div>
          <h2 className={s.heading} style="font-family: var(--font-display)">
            Get started in 30 seconds.
          </h2>
          <p className={s.desc}>
            SQLite database, REST API, and UI — all running locally. No Docker. No config files.
            Edit any layer and see it update instantly.
          </p>
        </div>
        <div
          className={s.terminal}
          style="border-color: #1e1e22; font-family: var(--font-mono); box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1)"
        >
          <div className={`${s.terminalLine} ${s.terminalCmd}`}>$ bun create vertz@latest my-app</div>
          <div className={`${s.terminalLine} ${s.terminalCmd}`}>$ cd my-app</div>
          <div className={s.terminalCmd}>$ bun dev</div>
          <div className={s.successLine} style="color: #4ade80">
            ✓ SQLite database ready
          </div>
          <div className={s.success} style="color: #4ade80">
            ✓ API server on http://localhost:3000/api
          </div>
          <div className={s.success} style="color: #4ade80">
            ✓ UI on http://localhost:3000
          </div>
        </div>
      </div>
    </section>
  );
}
