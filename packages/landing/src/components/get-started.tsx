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
  desc: ['font:lg', 'mb:4'],
  terminal: [
    'p:6',
    'font:sm',
    'border:1',
    { '&': { 'overflow-x': 'auto', 'border-radius': '2px' } },
  ],
  terminalLine: ['mb:2'],
  terminalCmd: [],
  successLine: ['mt:4'],
  success: [],
});

export function GetStarted() {
  return (
    <section
      className={s.section}
      style={{
        background: '#0F0F0E',
        borderTop: '1px solid #2A2826',
        borderBottom: '1px solid #2A2826',
      }}
    >
      <div className={s.container}>
        <div>
          <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
            Get started in 30 seconds.
          </h2>
          <p className={s.desc} style={{ color: '#9C9690' }}>
            SQLite database, REST API, and UI — all running locally. No Docker. No config files.
            Edit any layer and see it update instantly.
          </p>
        </div>
        <div
          className={s.terminal}
          style={{ background: '#1C1B1A', borderColor: '#2A2826', fontFamily: 'var(--font-mono)' }}
        >
          <div className={`${s.terminalLine} ${s.terminalCmd}`} style={{ color: '#6B6560' }}>
            $ curl -fsSL vertz.dev/vtz/install | sh
          </div>
          <div className={`${s.terminalLine} ${s.terminalCmd}`} style={{ color: '#6B6560' }}>
            $ vtz create my-app
          </div>
          <div className={`${s.terminalLine} ${s.terminalCmd}`} style={{ color: '#6B6560' }}>
            $ cd my-app
          </div>
          <div className={s.terminalCmd} style={{ color: '#6B6560' }}>
            $ vtz dev
          </div>
          <div className={s.successLine} style={{ color: '#C8451B' }}>
            ✓ SQLite database ready
          </div>
          <div className={s.success} style={{ color: '#C8451B' }}>
            ✓ API server on http://localhost:3000/api
          </div>
          <div className={s.success} style={{ color: '#C8451B' }}>
            ✓ UI on http://localhost:3000
          </div>
        </div>
      </div>
    </section>
  );
}
