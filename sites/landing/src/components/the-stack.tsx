import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:4xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:4', 'text:center'],
  heading: ['font:4xl', 'mb:4', 'text:center'],
  subtitle: ['text:center', 'mb:12', 'max-w:xl', 'mx:auto'],
  list: ['flex', 'flex-col'],
  row: ['grid', 'gap:4', 'items:center', 'px:6', 'py:4'],
  pkg: ['font:sm'],
  what: ['font:sm'],
  replaces: ['font:xs', 'text:right'],
});

const MONO = "font-family: 'JetBrains Mono', monospace";

const LAYERS = [
  {
    pkg: '@vertz/schema',
    what: 'Runtime-safe type definitions',
    replaces: 'Zod',
    color: '#a78bfa',
  },
  {
    pkg: '@vertz/db',
    what: 'Typed queries & migrations',
    replaces: 'Drizzle / Prisma',
    color: '#60a5fa',
  },
  {
    pkg: '@vertz/server',
    what: 'Entity-based CRUD + OpenAPI',
    replaces: 'Express + tRPC',
    color: '#34d399',
  },
  {
    pkg: '@vertz/compiler',
    what: 'Static analysis + SDK codegen',
    replaces: 'Manual glue code',
    color: '#fbbf24',
  },
  {
    pkg: '@vertz/ui',
    what: 'Signals, query(), form(), css()',
    replaces: 'React + Tailwind',
    color: '#f472b6',
  },
  {
    pkg: '@vertz/ui-primitives',
    what: 'Accessible components',
    replaces: 'Radix / Base UI',
    color: '#e879f9',
  },
  {
    pkg: '@vertz/theme-shadcn',
    what: 'Pre-built styled components',
    replaces: 'shadcn/ui',
    color: '#f9a8d4',
  },
  {
    pkg: '@vertz/ui-server',
    what: 'SSR, streaming, HMR dev server',
    replaces: 'Next.js + Vite',
    color: '#c084fc',
  },
  {
    pkg: '@vertz/testing',
    what: 'API & UI test utilities on Bun',
    replaces: 'Vitest + Testing Library',
    color: '#4ade80',
  },
  {
    pkg: '@vertz/cloudflare',
    what: 'Edge deployment',
    replaces: 'Dockerfile + infra',
    color: '#fb923c',
  },
];

export function TheStack() {
  return (
    <section class={s.section}>
      <div class={s.container}>
        <p class={s.label} style={`${MONO}; color: #71717a`}>
          The stack
        </p>
        <h2 class={s.heading} style="font-family: 'DM Serif Display', Georgia, serif">
          One framework. Not fifteen npm installs.
        </h2>
        <p class={s.subtitle} style="color: #a1a1aa">
          Every layer works together because they were built together.
        </p>

        <div class={s.list}>
          {LAYERS.map((layer) => (
            <div
              key={layer.pkg}
              class={s.row}
              style={`grid-template-columns: 1fr 1.5fr 1fr; border-bottom: 1px solid #1e1e22`}
            >
              <div class={s.pkg} style={`${MONO}; color: ${layer.color}`}>
                {layer.pkg}
              </div>
              <div class={s.what} style="color: #d4d4d8">
                {layer.what}
              </div>
              <div class={s.replaces} style={`${MONO}; color: #52525b`}>
                replaces {layer.replaces}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
