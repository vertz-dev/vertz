import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
});

const MONO = "font-family: 'JetBrains Mono', monospace";

const LAYERS = [
  { pkg: '@vertz/schema', what: 'Runtime-safe type definitions', replaces: 'Zod', color: '#a78bfa' },
  { pkg: '@vertz/db', what: 'Typed queries & migrations', replaces: 'Drizzle / Prisma', color: '#60a5fa' },
  { pkg: '@vertz/server', what: 'Entity-based CRUD + OpenAPI', replaces: 'Express + tRPC', color: '#34d399' },
  { pkg: '@vertz/compiler', what: 'Static analysis + SDK codegen', replaces: 'Manual glue code', color: '#fbbf24' },
  { pkg: '@vertz/ui', what: 'Signals, query(), form(), css()', replaces: 'React + Tailwind', color: '#f472b6' },
  { pkg: '@vertz/ui-primitives', what: 'Accessible components', replaces: 'Radix / Base UI', color: '#e879f9' },
  { pkg: '@vertz/theme-shadcn', what: 'Pre-built styled components', replaces: 'shadcn/ui', color: '#f9a8d4' },
  { pkg: '@vertz/ui-server', what: 'SSR, streaming, HMR dev server', replaces: 'Next.js + Vite', color: '#c084fc' },
  { pkg: '@vertz/testing', what: 'API & UI test utilities on Bun', replaces: 'Vitest + Testing Library', color: '#4ade80' },
  { pkg: '@vertz/cloudflare', what: 'Edge deployment', replaces: 'Dockerfile + infra', color: '#fb923c' },
];

export function TheStack() {
  return (
    <section class={s.section}>
      <div style="max-width: 56rem; margin: 0 auto">
        <p style={`${MONO}; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: #71717a; margin-bottom: 1rem; text-align: center`}>
          The stack
        </p>
        <h2 style="font-family: 'DM Serif Display', Georgia, serif; font-size: 2.25rem; margin-bottom: 1rem; text-align: center">
          One framework. Not fifteen npm installs.
        </h2>
        <p style="color: #a1a1aa; text-align: center; margin-bottom: 3rem; max-width: 36rem; margin-left: auto; margin-right: auto">
          Every layer works together because they were built together.
        </p>

        <div style="display: flex; flex-direction: column; gap: 0">
          {LAYERS.map((layer) => (
            <div
              key={layer.pkg}
              style={`display: grid; grid-template-columns: 1fr 1.5fr 1fr; gap: 1rem; align-items: center; padding: 1rem 1.5rem; border-bottom: 1px solid #1e1e22`}
            >
              <div style={`${MONO}; font-size: 0.875rem; color: ${layer.color}`}>
                {layer.pkg}
              </div>
              <div style="font-size: 0.875rem; color: #d4d4d8">
                {layer.what}
              </div>
              <div style={`${MONO}; font-size: 0.75rem; color: #52525b; text-align: right`}>
                replaces {layer.replaces}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
