import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:4xl', 'mx:auto'],
  label: [
    'font:xs',
    'tracking:widest',
    'uppercase',
    'mb:4',
    'text:center',
    { '&': { color: '#6B6560' } },
  ],
  heading: ['font:4xl', 'mb:4', 'text:center'],
  subtitle: ['text:center', 'mb:12', 'max-w:xl', 'mx:auto', { '&': { color: '#9C9690' } }],
  list: ['flex', 'flex-col'],
  row: [
    'gap:4',
    'items:center',
    'px:6',
    'py:4',
    { '@media (max-width: 639px)': { display: 'flex', 'flex-wrap': 'wrap' } },
    { '@media (min-width: 640px)': { display: 'grid', 'grid-template-columns': '1fr 1.5fr 1fr' } },
  ],
  pkg: ['font:sm'],
  what: ['font:sm', { '&': { color: '#B8A080' } }],
  replaces: [
    'font:xs',
    { '&': { color: '#4A4540' } },
    { '@media (min-width: 640px)': { 'text-align': 'right' } },
  ],
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
    what: 'API & UI test utilities on Bun',
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
