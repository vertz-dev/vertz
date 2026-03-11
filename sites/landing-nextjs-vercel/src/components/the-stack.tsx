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
  {
    pkg: '@vertz/icons',
    what: 'Tree-shakeable Lucide icons',
    replaces: 'lucide-react',
    color: '#94a3b8',
  },
];

export function TheStack() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <p
          className="text-xs tracking-widest uppercase mb-4 text-center text-gray-500"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          The stack
        </p>
        <h2
          className="text-4xl mb-4 text-center"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          One framework. Not fifteen npm installs.
        </h2>
        <p className="text-center mb-12 max-w-xl mx-auto text-gray-400">
          Every layer works together because they were built together.
        </p>

        <div className="flex flex-col">
          {LAYERS.map((layer) => (
            <div
              key={layer.pkg}
              className="grid gap-4 items-center px-6 py-4"
              style={{
                gridTemplateColumns: '1fr 1.5fr 1fr',
                borderBottom: '1px solid #1e1e22',
              }}
            >
              <div
                className="text-sm"
                style={{ fontFamily: 'var(--font-mono)', color: layer.color }}
              >
                {layer.pkg}
              </div>
              <div className="text-sm text-gray-300">{layer.what}</div>
              <div
                className="text-xs text-right text-gray-600"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                replaces {layer.replaces}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
