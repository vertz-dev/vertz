import { css } from '@vertz/ui';
import { Divider } from '../components/divider';
import { Footer } from '../components/footer';
import { Nav } from '../components/nav';
import { OpenAPIComparison } from '../components/openapi-comparison';
import { OpenAPIFeatures } from '../components/openapi-features';
import { OpenAPIGetStarted } from '../components/openapi-get-started';
import { OpenAPIWhy } from '../components/openapi-why';

// ── Hero styles ──────────────────────────────────────────

const s = css({
  section: [
    'flex',
    'items:center',
    'justify:center',
    'px:6',
    'min-h:screen',
    {
      '&': { 'padding-top': '5rem' },
      '@media (min-width: 1024px)': {
        'padding-left': '3rem',
        'padding-right': '3rem',
        'padding-top': '0',
      },
    },
  ],
  grid: [
    'flex',
    'flex-col',
    'gap:12',
    'w:full',
    'max-w:6xl',
    'mx:auto',
    'items:center',
    {
      '@media (min-width: 1024px)': {
        'flex-direction': 'row',
        'align-items': 'center',
        gap: '4rem',
      },
    },
  ],
  textCol: [
    'flex',
    'flex-col',
    'text:center',
    {
      '@media (min-width: 1024px)': {
        'text-align': 'left',
        flex: '1 1 0%',
        'min-width': '0',
      },
    },
  ],
  codeCol: [
    'w:full',
    {
      '@media (min-width: 1024px)': {
        flex: '1 1 0%',
        'min-width': '0',
      },
    },
  ],
  badge: [
    'flex',
    'items:center',
    'gap:2',
    'mb:6',
    { '@media (min-width: 1024px)': { 'justify-content': 'flex-start' } },
  ],
  badgeText: ['font:xs', 'tracking:widest', 'uppercase'],
  description: ['mt:6', 'font:base', 'max-w:xl', 'leading:relaxed'],
  descriptionHighlight: ['weight:medium'],
  ctas: [
    'mt:10',
    'flex',
    'flex-col',
    'items:stretch',
    'gap:4',
    {
      '@media (min-width: 1024px)': {
        'align-items': 'flex-start',
      },
    },
  ],
  ctaLink: [
    'flex',
    'items:center',
    'justify:center',
    'gap:2',
    'py:3',
    'px:6',
    'font:sm',
    'uppercase',
    'tracking:wider',
    'transition:colors',
    {
      '@media (min-width: 640px)': { display: 'inline-flex' },
    },
  ],
  terminal: [
    'p:6',
    'font:sm',
    'border:1',
    {
      '&': {
        'overflow-x': 'auto',
        'border-radius': '2px',
        'background-color': '#1C1B1A',
        'border-color': '#2A2826',
      },
    },
  ],
  terminalLine: ['mb:2'],
});

// ── Hero terminal ────────────────────────────────────────

function HeroTerminal() {
  return (
    <div className={s.terminal} style={{ fontFamily: 'var(--font-mono)' }}>
      <div className={s.terminalLine} style={{ color: '#6B6560' }}>
        $ npx @vertz/openapi generate --from ./openapi.json
      </div>
      <div style={{ marginTop: '1rem' }} />
      <div style={{ color: '#C8451B' }}>✓ 12 files written to ./src/generated</div>
      <div style={{ color: '#9C9690', marginTop: '0.25rem', fontSize: '0.8rem' }}>
        client.ts &middot; types/ &middot; resources/ &middot; schemas/
      </div>
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
              href="https://www.npmjs.com/package/@vertz/openapi"
              target="_blank"
              rel="noopener"
              className={s.ctaLink}
              style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}
            >
              View on npm
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
