import { css, token } from '@vertz/ui';
import { Divider } from '../components/divider';
import { Footer } from '../components/footer';
import { Nav } from '../components/nav';
import { OpenAPIComparison } from '../components/openapi-comparison';
import { OpenAPIFeatures } from '../components/openapi-features';
import { OpenAPIGetStarted } from '../components/openapi-get-started';
import { OpenAPIWhy } from '../components/openapi-why';

// ── Hero styles ──────────────────────────────────────────

const s = css({
  section: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: token.spacing[6],
    minHeight: '100vh',
    '&': { paddingTop: '5rem' },
    '@media (min-width: 1024px)': { paddingLeft: '3rem', paddingRight: '3rem', paddingTop: '0' },
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[12],
    width: '100%',
    maxWidth: '72rem',
    marginInline: 'auto',
    alignItems: 'center',
    '@media (min-width: 1024px)': { flexDirection: 'row', alignItems: 'center', gap: '4rem' },
  },
  textCol: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'center',
    '@media (min-width: 1024px)': { textAlign: 'left', flex: '1 1 0%', minWidth: '0' },
  },
  codeCol: { width: '100%', '@media (min-width: 1024px)': { flex: '1 1 0%', minWidth: '0' } },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    marginBottom: token.spacing[6],
    '@media (min-width: 1024px)': { justifyContent: 'flex-start' },
  },
  badgeText: { fontSize: token.font.size.xs, letterSpacing: '0.1em', textTransform: 'uppercase' },
  description: {
    marginTop: token.spacing[6],
    fontSize: token.font.size.base,
    maxWidth: '36rem',
    lineHeight: token.font.lineHeight.relaxed,
  },
  descriptionHighlight: { fontWeight: token.font.weight.medium },
  ctas: {
    marginTop: token.spacing[10],
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: token.spacing[4],
    '@media (min-width: 1024px)': { alignItems: 'flex-start' },
  },
  ctaPrimary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: token.spacing[2],
    paddingBlock: token.spacing[3],
    paddingInline: token.spacing[6],
    fontSize: token.font.size.sm,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&': { background: '#C8451B', color: '#fff', borderRadius: '2px', textDecoration: 'none' },
    '&:hover': { background: '#d65229' },
    '@media (min-width: 640px)': { display: 'inline-flex' },
  },
  ctaLink: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: token.spacing[2],
    paddingBlock: token.spacing[3],
    paddingInline: token.spacing[6],
    fontSize: token.font.size.sm,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '@media (min-width: 640px)': { display: 'inline-flex' },
  },
  terminal: {
    padding: token.spacing[6],
    fontSize: token.font.size.sm,
    borderWidth: '1px',
    '&': {
      overflowX: 'auto',
      borderRadius: '2px',
      backgroundColor: '#1C1B1A',
      borderColor: '#2A2826',
    },
  },
  terminalLine: { marginBottom: token.spacing[2] },
});

// ── Hero terminal ────────────────────────────────────────

function HeroTerminal() {
  return (
    <div className={s.terminal} style={{ fontFamily: 'var(--font-mono)' }}>
      <div className={s.terminalLine} style={{ color: '#6B6560' }}>
        $ npx @vertz/openapi generate --from ./openapi.json
      </div>
      <div style={{ marginTop: '1rem' }} />
      <div style={{ color: '#C8451B' }}>Generated 12 files in ./src/generated, 12 written</div>
    </div>
  );
}

// ── Page-local glow effect ───────────────────────────────

function OpenAPIGlow() {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '700px',
          height: '500px',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse, rgba(200,69,27,0.05) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -60%)',
          width: '350px',
          height: '350px',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse, rgba(200,69,27,0.025) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
    </>
  );
}

// ── Hero section ─────────────────────────────────────────

function OpenAPIHero() {
  return (
    <section className={s.section}>
      <div className={s.grid}>
        <div className={s.textCol}>
          <div className={s.badge} style={{ justifyContent: 'center' }}>
            <span
              className={s.badgeText}
              style={{
                fontFamily: 'var(--font-mono)',
                color: '#C8451B',
                border: '1px solid rgba(200,69,27,0.3)',
                borderRadius: '2px',
                padding: '0.2em 0.6em',
              }}
            >
              Framework-agnostic
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2rem, 4vw, 3.5rem)',
              letterSpacing: '-0.025em',
              lineHeight: '1.15',
              color: '#E8E4DC',
            }}
          >
            <span style={{ display: 'block' }}>Turn any OpenAPI spec</span>
            <span style={{ display: 'block', color: '#6B6560' }}>into a typed TypeScript SDK.</span>
          </h1>

          <p className={s.description} style={{ color: '#9C9690' }}>
            One command. Full type safety. Zero config. No Java runtime.{' '}
            <span className={s.descriptionHighlight} style={{ color: '#E8E4DC' }}>
              Works with any backend — FastAPI, NestJS, Rails, Go, or anything with an OpenAPI spec.
            </span>
          </p>

          <div className={s.ctas}>
            <a
              href="#get-started"
              className={s.ctaPrimary}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Get Started
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
            <a
              href="https://github.com/vertz-dev/vertz/tree/main/packages/openapi"
              target="_blank"
              rel="noopener"
              className={s.ctaLink}
              style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}
            >
              View on GitHub
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>

        <div className={s.codeCol}>
          <HeroTerminal />
        </div>
      </div>
    </section>
  );
}

// ── Page export ──────────────────────────────────────────

export function OpenAPIPage() {
  return (
    <div>
      <Nav />
      <OpenAPIGlow />
      <main style={{ position: 'relative', zIndex: '2', overflowX: 'hidden' }}>
        <OpenAPIHero />
        <Divider />
        <OpenAPIFeatures />
        <Divider />
        <OpenAPIWhy />
        <OpenAPIComparison />
        <Divider />
        <OpenAPIGetStarted />
      </main>
      <Footer />
    </div>
  );
}
