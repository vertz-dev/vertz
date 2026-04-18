import { css, token } from '@vertz/ui';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  container: { maxWidth: '56rem', marginInline: 'auto' },
  label: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: token.spacing[4],
    textAlign: 'center',
    '&': { color: '#6B6560' },
  },
  heading: {
    fontSize: token.font.size['4xl'],
    marginBottom: token.spacing[4],
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: token.spacing[12],
    maxWidth: '36rem',
    marginInline: 'auto',
    '&': { color: '#9C9690' },
  },
  list: { display: 'flex', flexDirection: 'column' },
  row: {
    gap: token.spacing[4],
    alignItems: 'center',
    paddingInline: token.spacing[6],
    paddingBlock: token.spacing[4],
    '@media (max-width: 639px)': { display: 'flex', flexWrap: 'wrap' },
    '@media (min-width: 640px)': { display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr' },
  },
  pkg: { fontSize: token.font.size.sm },
  what: { fontSize: token.font.size.sm, '&': { color: '#B8A080' } },
  replaces: {
    fontSize: token.font.size.xs,
    '&': { color: '#4A4540' },
    '@media (min-width: 640px)': { textAlign: 'right' },
  },
});

const LAYERS = [
  {
    pkg: 'vertz/schema',
    what: 'Runtime-safe type definitions',
    replaces: 'Zod',
    color: '#a78bfa',
  },
  {
    pkg: 'vertz/db',
    what: 'Typed queries & migrations',
    replaces: 'Drizzle / Prisma',
    color: '#60a5fa',
  },
  {
    pkg: 'vertz/server',
    what: 'Entity-based CRUD + OpenAPI',
    replaces: 'Express + tRPC',
    color: '#34d399',
  },
  {
    pkg: 'vertz/compiler',
    what: 'Static analysis + SDK codegen',
    replaces: 'Manual glue code',
    color: '#fbbf24',
  },
  {
    pkg: 'vertz/ui',
    what: 'Signals, query(), form(), css()',
    replaces: 'React + Tailwind',
    color: '#f472b6',
  },
  {
    pkg: 'vertz/ui-primitives',
    what: 'Accessible components',
    replaces: 'Radix / Base UI',
    color: '#e879f9',
  },
  {
    pkg: 'vertz/theme-shadcn',
    what: 'Pre-built styled components',
    replaces: 'shadcn/ui',
    color: '#f9a8d4',
  },
  {
    pkg: 'vertz/ui-server',
    what: 'SSR, streaming, HMR dev server',
    replaces: 'Next.js + Vite',
    color: '#c084fc',
  },
  {
    pkg: 'vertz/testing',
    what: 'API & UI test utilities on vtz',
    replaces: 'Vitest + Testing Library',
    color: '#4ade80',
  },
  {
    pkg: 'vertz/cloudflare',
    what: 'Edge deployment',
    replaces: 'Dockerfile + infra',
    color: '#fb923c',
  },
  {
    pkg: 'vertz/icons',
    what: 'Tree-shakeable Lucide icons',
    replaces: 'lucide-react',
    color: '#94a3b8',
  },
];

export function TheStack() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <p className={s.label} style={{ fontFamily: 'var(--font-mono)' }}>
          The stack
        </p>
        <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
          One framework. Not fifteen npm installs.
        </h2>
        <p className={s.subtitle}>Every layer works together because they were built together.</p>

        <div className={s.list}>
          {LAYERS.map((layer) => (
            <div key={layer.pkg} className={s.row} style={{ borderBottom: '1px solid #2A2826' }}>
              <div className={s.pkg} style={{ fontFamily: 'var(--font-mono)', color: layer.color }}>
                {layer.pkg}
              </div>
              <div className={s.what}>{layer.what}</div>
              <div className={s.replaces} style={{ fontFamily: 'var(--font-mono)' }}>
                replaces {layer.replaces}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
