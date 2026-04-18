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
  links: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[2],
    marginTop: token.spacing[6],
  },
  link: {
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { color: '#E8E4DC' },
  },
  terminal: {
    padding: token.spacing[6],
    fontSize: token.font.size.sm,
    borderWidth: '1px',
    '&': { overflowX: 'auto', borderRadius: '2px' },
  },
  terminalLine: { marginBottom: token.spacing[2] },
  successLine: { marginTop: token.spacing[4] },
});

export function OpenAPIGetStarted() {
  return (
    <section
      id="get-started"
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
            Get started in one command.
          </h2>
          <p className={s.desc} style={{ color: '#9C9690' }}>
            Point at your OpenAPI spec. Get a typed SDK. No install required — npx runs it directly.
          </p>
          <div className={s.links}>
            <a
              href="https://www.npmjs.com/package/@vertz/openapi"
              target="_blank"
              rel="noopener"
              className={s.link}
              style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}
            >
              npm &rarr;
            </a>
            <a
              href="https://github.com/vertz-dev/vertz/tree/main/packages/openapi"
              target="_blank"
              rel="noopener"
              className={s.link}
              style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}
            >
              GitHub &rarr;
            </a>
            <a
              href="https://docs.vertz.dev/guides/server/codegen"
              className={s.link}
              style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}
            >
              Docs &rarr;
            </a>
          </div>
        </div>
        <div
          className={s.terminal}
          style={{ background: '#1C1B1A', borderColor: '#2A2826', fontFamily: 'var(--font-mono)' }}
        >
          <div className={s.terminalLine} style={{ color: '#6B6560' }}>
            $ npx @vertz/openapi generate --from ./openapi.json
          </div>
          <div className={s.successLine} style={{ color: '#C8451B' }}>
            Generated 12 files in ./src/generated, 12 written
          </div>
        </div>
      </div>
    </section>
  );
}
