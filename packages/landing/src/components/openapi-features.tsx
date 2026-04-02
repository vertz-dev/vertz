import { css, Island } from '@vertz/ui';

// ── Styles ──────────────────────────────────────────────────

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:5xl', 'mx:auto', { '&': { overflow: 'hidden' } }],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:4', 'text:center'],
  heading: [
    'font:2xl',
    'mb:4',
    'text:center',
    { '@media (min-width: 768px)': { 'font-size': '2.25rem' } },
  ],
  subtitle: [
    'text:center',
    'mb:16',
    'max-w:2xl',
    'mx:auto',
    'font:sm',
    { '@media (min-width: 768px)': { 'font-size': '1rem' } },
  ],
  layout: [
    'grid',
    'gap:8',
    {
      '&': { overflow: 'hidden' },
      '@media (min-width: 768px)': {
        'grid-template-columns': '200px 1fr',
      },
    },
  ],
  nav: [
    'flex',
    'gap:1',
    'mb:6',
    {
      '&': {
        'overflow-x': 'auto',
        '-webkit-overflow-scrolling': 'touch',
        'scrollbar-width': 'none',
      },
      '&::-webkit-scrollbar': { display: 'none' },
      '@media (min-width: 768px)': {
        'flex-direction': 'column',
        'margin-bottom': '0',
        gap: '0',
      },
    },
  ],
  navBtn: [
    'py:2',
    'px:3',
    'font:xs',
    'cursor:pointer',
    {
      '&': {
        background: 'none',
        border: 'none',
        'text-align': 'left',
        'white-space': 'nowrap',
        outline: 'none',
        'font-family': 'var(--font-sans)',
        transition: 'color 0.2s, background 0.2s',
        'border-radius': '2px',
        'flex-shrink': '0',
      },
      '@media (min-width: 768px)': {
        'border-radius': '0',
        'white-space': 'normal',
        'font-size': '0.875rem',
        padding: '0.75rem 1rem',
      },
    },
  ],
  content: [{ '&': { display: 'grid', position: 'relative', 'min-width': '0' } }],
  page: ['flex', 'flex-col', 'gap:6', { '&': { 'min-width': '0' } }],
  pageTag: ['font:xs', 'tracking:widest', 'uppercase'],
  pageTitle: [
    'font:xl',
    {
      '@media (min-width: 768px)': { 'font-size': '1.875rem' },
    },
  ],
  pageDesc: [
    'font:sm',
    'leading:relaxed',
    { '@media (min-width: 768px)': { 'font-size': '1rem' } },
  ],
  codeWrap: [
    'p:4',
    'border:1',
    'font:xs',
    'leading:relaxed',
    {
      '&': { 'overflow-x': 'auto' },
      '@media (min-width: 768px)': { padding: '1.5rem', 'font-size': '0.875rem' },
    },
  ],
});

// ── Token color shorthand ───────────────────────────────────

const K = 'color:#C8451B'; // keyword
const F = 'color:#B8A080'; // function/method
const S = 'color:#7A9B6D'; // string
const C = 'color:#4A4540'; // comment
const T = 'color:#D4D0C8'; // text/identifier
const A = 'color:#B8A080;font-style:italic'; // JSX attribute
const V = 'color:#E8E4DC;font-style:italic'; // parameter
const E = 'color:#ef4444'; // error red
const H = 'color:#6B6560'; // hint

// ── Types & helpers ─────────────────────────────────────────

type Token = [string, string];
type FeatureLine = { t: Token[]; bg?: string; bl?: string };

function L(...t: Token[]): FeatureLine;
function L(opts: { bg: string; bl: string }, ...t: Token[]): FeatureLine;
function L(...args: (Token | { bg: string; bl: string })[]): FeatureLine {
  const first = args[0];
  if (first && !Array.isArray(first)) {
    const { bg, bl } = first as { bg: string; bl: string };
    return { t: args.slice(1) as Token[], bg, bl };
  }
  return { t: args as Token[] };
}

// ── Inline code in descriptions ─────────────────────────────

const CODE_STYLE = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.85em',
  background: 'rgba(200,69,27,0.08)',
  padding: '0.15em 0.4em',
  borderRadius: '3px',
  color: '#E8E4DC',
};

function RichText({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} style={CODE_STYLE}>
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ── Feature definitions ─────────────────────────────────────

const PAGES = [
  {
    id: 'type-safe',
    label: 'Type-Safe by Default',
    tag: '01',
    title: 'Every response typed. Every request validated.',
    desc: 'The generated SDK infers types directly from your OpenAPI spec. Response bodies, request inputs, query params — all fully typed. Returns `FetchResponse<T>` with error-as-value pattern via `isOk`/`isErr`.',
    code: [
      L([C, '// Generated from your OpenAPI spec']),
      L(
        [K, 'import'],
        [T, ' { '],
        [F, 'createClient'],
        [T, ' } '],
        [K, 'from'],
        [T, ' '],
        [S, "'./generated/client'"],
        [T, ';'],
      ),
      L(
        [K, 'import'],
        [T, ' { '],
        [F, 'isOk'],
        [T, ' } '],
        [K, 'from'],
        [T, ' '],
        [S, "'@vertz/fetch'"],
        [T, ';'],
      ),
      L(),
      L(
        [K, 'const'],
        [T, ' api '],
        [K, '='],
        [T, ' '],
        [F, 'createClient'],
        [T, '({ '],
        [A, 'baseURL'],
        [K, ':'],
        [T, ' '],
        [S, "'https://...'"],
        [T, ' });'],
      ),
      L(),
      L(
        [K, 'const'],
        [T, ' result '],
        [K, '='],
        [T, ' '],
        [K, 'await'],
        [T, ' api.tasks.'],
        [F, 'list'],
        [T, '();'],
      ),
      L([K, 'if'], [T, ' ('], [F, 'isOk'], [T, '(result)) {']),
      L([T, '  console.'], [F, 'log'], [T, '(result.data);']),
      L([C, '  //          ^? Task[] — fully typed']),
      L([T, '}']),
      L(),
      L(
        [K, 'await'],
        [T, ' api.tasks.'],
        [F, 'create'],
        [T, '({ '],
        [A, 'title'],
        [K, ':'],
        [T, ' '],
        [S, "'Ship it'"],
        [T, ' });'],
      ),
      L([C, '//                       ^? CreateTaskInput']),
    ],
  },
  {
    id: 'auth',
    label: 'Auth from Your Spec',
    tag: '02',
    title: 'Security schemes become typed auth strategies.',
    desc: 'OpenAPI security schemes — bearer, basic, apiKey, OAuth2 — are parsed and wired into the generated client as typed `ClientAuth`. No manual auth setup. Just pass credentials, headers are set automatically.',
    code: [
      L([C, '// Your spec defines: securitySchemes.bearerAuth']),
      L([C, '// Generated client includes typed auth:']),
      L(),
      L([K, 'const'], [T, ' api '], [K, '='], [T, ' '], [F, 'createClient'], [T, '({']),
      L([T, '  '], [A, 'baseURL'], [K, ':'], [T, ' '], [S, "'https://api.example.com'"], [T, ',']),
      L(
        [T, '  '],
        [A, 'auth'],
        [K, ':'],
        [T, ' { '],
        [A, 'bearerAuth'],
        [K, ':'],
        [T, ' '],
        [S, "'my-jwt-token'"],
        [T, ' },'],
      ),
      L([C, '  //      ^? ClientAuth — typed from your spec']),
      L([T, '});']),
      L(),
      L([C, '// Auth headers set automatically on every request']),
      L(
        [K, 'const'],
        [T, ' tasks '],
        [K, '='],
        [T, ' '],
        [K, 'await'],
        [T, ' api.tasks.'],
        [F, 'list'],
        [T, '();'],
      ),
      L([S, '// → Authorization: Bearer my-jwt-token']),
    ],
  },
  {
    id: 'zod',
    label: 'Runtime Validation',
    tag: '03',
    title: 'Zod schemas from your spec. Opt-in.',
    desc: 'Pass `--schemas` and get Zod validation schemas generated alongside your types. Validate user input before it hits the API. Catch bad data at the boundary, not in production.',
    code: [
      L([C, '// Generated with: npx @vertz/openapi generate --schemas']),
      L(
        [K, 'import'],
        [T, ' { '],
        [V, 'createTaskSchema'],
        [T, ' } '],
        [K, 'from'],
        [T, ' '],
        [S, "'./generated/schemas/tasks'"],
        [T, ';'],
      ),
      L(),
      L(
        [K, 'const'],
        [T, ' parsed '],
        [K, '='],
        [T, ' createTaskSchema.'],
        [F, 'parse'],
        [T, '(userInput);'],
      ),
      L([C, '//    ^? { title: string; done?: boolean }']),
      L(),
      L([C, '// Catches invalid data before it hits your API']),
      L(
        [T, 'createTaskSchema.'],
        [F, 'parse'],
        [T, '({ '],
        [A, 'title'],
        [K, ':'],
        [T, ' '],
        [E, '123'],
        [T, ' });'],
      ),
      L([E, '// ✗ ZodError: Expected string, received number']),
    ],
  },
  {
    id: 'backends',
    label: 'Any Backend',
    tag: '04',
    title: 'FastAPI, NestJS, Rails — or anything with a spec.',
    desc: 'Built-in adapters handle operationId quirks for common frameworks. Or point at any OpenAPI 3.x spec — JSON or YAML, file or URL. The generator normalizes everything into clean method names.',
    code: [
      L([C, '// openapi.config.ts — FastAPI backend']),
      L(
        [K, 'import'],
        [T, ' { '],
        [F, 'fastapi'],
        [T, ' } '],
        [K, 'from'],
        [T, ' '],
        [S, "'@vertz/openapi/adapters'"],
        [T, ';'],
      ),
      L(),
      L([K, 'export'], [T, ' '], [K, 'default'], [T, ' '], [F, 'defineConfig'], [T, '({']),
      L(
        [T, '  '],
        [A, 'source'],
        [K, ':'],
        [T, ' '],
        [S, "'https://api.example.com/openapi.json'"],
        [T, ','],
      ),
      L([T, '  '], [A, 'operationIds'], [K, ':'], [T, ' '], [F, 'fastapi'], [T, '(),']),
      L([T, '});']),
      L(),
      L([C, '// openapi.config.ts — NestJS backend']),
      L(
        [K, 'import'],
        [T, ' { '],
        [F, 'nestjs'],
        [T, ' } '],
        [K, 'from'],
        [T, ' '],
        [S, "'@vertz/openapi/adapters'"],
        [T, ';'],
      ),
      L(),
      L([K, 'export'], [T, ' '], [K, 'default'], [T, ' '], [F, 'defineConfig'], [T, '({']),
      L([T, '  '], [A, 'source'], [K, ':'], [T, ' '], [S, "'./openapi.json'"], [T, ',']),
      L([T, '  '], [A, 'operationIds'], [K, ':'], [T, ' '], [F, 'nestjs'], [T, '(),']),
      L([T, '});']),
    ],
  },
  {
    id: 'sync',
    label: 'Always in Sync',
    tag: '05',
    title: 'API changed? TypeScript catches it.',
    desc: 'Re-run the generator after a spec update. TypeScript immediately flags every call site that needs updating. Breaking changes caught at compile time — not at 3 AM in production.',
    code: [
      L([C, '// API added a required field: "priority"']),
      L([H, '$ npx @vertz/openapi generate --from ./openapi.json']),
      L(),
      L([C, '// TypeScript immediately catches the gap:']),
      L(
        [K, 'await'],
        [T, ' api.tasks.'],
        [F, 'create'],
        [T, '({ '],
        [A, 'title'],
        [K, ':'],
        [T, ' '],
        [S, "'Ship it'"],
        [T, ' });'],
      ),
      L([E, "// ✗ Property 'priority' is missing in type"]),
      L([E, "//   '{ title: string }' but required in type"]),
      L([E, "//   'CreateTaskInput'."]),
    ],
  },
];

// ── Code block renderer ─────────────────────────────────────

function CodeBlock({ lines }: { lines: FeatureLine[] }) {
  return (
    <div
      className={s.codeWrap}
      style={{
        fontFamily: 'var(--font-mono)',
        background: '#111110',
        borderColor: '#2A2826',
        borderRadius: '2px',
        whiteSpace: 'pre',
      }}
    >
      {lines.map((line, i) => {
        const hasDiff = Boolean(line.bg);
        const isEmpty = line.t.length === 0;
        return (
          <div
            key={i}
            style={{
              minHeight: isEmpty ? '1em' : undefined,
              background: line.bg,
              borderLeft: line.bl,
              margin: hasDiff ? '0 -1.5rem' : undefined,
              padding: hasDiff ? '0 1.5rem 0 calc(1.5rem - 3px)' : undefined,
            }}
          >
            {line.t.map((token, j) => (
              <span key={j} style={token[0]}>
                {token[1]}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Feature showcase (Island for interactivity) ─────────────

function OpenAPIFeatureShowcase() {
  let activeIndex = 0;

  return (
    <div className={s.layout}>
      <nav className={s.nav}>
        {PAGES.map((page, i) => (
          <button
            key={page.id}
            type="button"
            className={s.navBtn}
            style={{
              color: activeIndex === i ? '#E8E4DC' : '#9C9690',
              background: activeIndex === i ? 'rgba(200,69,27,0.06)' : 'transparent',
            }}
            onClick={() => {
              activeIndex = i;
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                color: activeIndex === i ? '#C8451B' : '#4A4540',
                marginRight: '0.5rem',
              }}
            >
              {page.tag}
            </span>
            {page.label}
          </button>
        ))}
      </nav>

      <div className={s.content}>
        {PAGES.map((page, i) => (
          <div
            key={page.id}
            className={s.page}
            style={{
              gridArea: '1 / 1',
              opacity: activeIndex === i ? 1 : 0,
              transform: activeIndex === i ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.35s ease, transform 0.35s ease',
              pointerEvents: activeIndex === i ? 'auto' : 'none',
            }}
          >
            <div>
              <p
                className={s.pageTag}
                style={{ fontFamily: 'var(--font-mono)', color: '#C8451B', marginBottom: '0.5rem' }}
              >
                {page.tag}
              </p>
              <h3
                className={s.pageTitle}
                style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}
              >
                {page.title}
              </h3>
            </div>
            <p className={s.pageDesc} style={{ color: '#9C9690' }}>
              <RichText text={page.desc} />
            </p>
            <CodeBlock lines={page.code} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Export ───────────────────────────────────────────────────

export function OpenAPIFeatures() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <p className={s.label} style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}>
          Features
        </p>
        <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
          Your spec already defines the contract.
        </h2>
        <p className={s.subtitle} style={{ color: '#9C9690' }}>
          The generator reads it, produces a typed SDK, and keeps it in sync. No manual wiring.
        </p>

        <Island component={OpenAPIFeatureShowcase} />
      </div>
    </section>
  );
}
