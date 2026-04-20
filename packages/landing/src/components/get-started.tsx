import { css, token } from '@vertz/ui';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  container: {
    maxWidth: '56rem',
    marginInline: 'auto',
    display: 'grid',
    gap: token.spacing[12],
    alignItems: 'center',
    '@media (min-width: 768px)': { gridTemplateColumns: '1fr 1fr' },
  },
  heading: { fontSize: token.font.size['4xl'], marginBottom: token.spacing[6] },
  desc: { fontSize: token.font.size.lg, marginBottom: token.spacing[4] },
  terminal: {
    padding: token.spacing[6],
    fontSize: token.font.size.sm,
    borderWidth: '1px',
    '&': { overflowX: 'auto', borderRadius: '2px' },
  },
  terminalLine: { marginBottom: token.spacing[2] },
  terminalCmd: {},
  successLine: { marginTop: token.spacing[4] },
  success: {},
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
