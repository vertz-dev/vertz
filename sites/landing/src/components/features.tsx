import { css, Island } from '@vertz/ui';

// ── Styles ──────────────────────────────────────────────────

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:5xl', 'mx:auto'],
  label: ['font:xs', 'tracking:widest', 'uppercase', 'mb:4', 'text:center'],
  heading: ['font:4xl', 'mb:4', 'text:center'],
  subtitle: ['text:center', 'mb:16', 'max-w:2xl', 'mx:auto'],
  layout: [
    'grid',
    'gap:8',
    {
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
    'py:3',
    'px:4',
    'font:sm',
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
      },
      '@media (min-width: 768px)': {
        'border-radius': '0',
        'white-space': 'normal',
      },
    },
  ],
  content: [{ '&': { display: 'grid', position: 'relative' } }],
  page: ['flex', 'flex-col', 'gap:6'],
  pageTag: ['font:xs', 'tracking:widest', 'uppercase'],
  pageTitle: ['font:3xl'],
  pageDesc: ['font:base', 'leading:relaxed'],
  codeWrap: [
    'p:6',
    'border:1',
    'font:sm',
    'leading:relaxed',
    { '&': { 'overflow-x': 'auto' } },
  ],
});

// ── Token color shorthand ───────────────────────────────────

const K = 'color:#C8451B';                    // keyword
const F = 'color:#B8A080';                    // function/method
const S = 'color:#7A9B6D';                    // string
const N = 'color:#D4A053';                    // number/boolean
const C = 'color:#4A4540';                    // comment
const T = 'color:#D4D0C8';                    // text/identifier
const A = 'color:#B8A080;font-style:italic';  // JSX attribute
const V = 'color:#E8E4DC;font-style:italic';  // parameter
const E = 'color:#ef4444';                    // error red
const H = 'color:#6B6560';                    // hint (code context)

// ── Types & helpers ─────────────────────────────────────────

type Token = [string, string];
type FeatureLine = { t: Token[]; bg?: string; bl?: string };

const L = (...t: Token[]): FeatureLine => ({ t });

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
        i % 2 === 1
          ? <code key={i} style={CODE_STYLE}>{part}</code>
          : <span key={i}>{part}</span>,
      )}
    </>
  );
}

// ── Feature definitions ─────────────────────────────────────

const PAGES = [
  {
    id: 'field-selection',
    label: 'Auto Field Selection',
    tag: '01',
    title: 'Your UI decides the query.',
    desc: 'Reference `task.title` in a component — the compiler traces the access and generates a SELECT with only that column. Add `task.dueDate` to the template, the query adapts. Remove it, the column drops. No field lists to maintain. No GraphQL fragments. The compiler knows what your UI needs.',
    code: [
      L([C, 'Your component accesses title and status']),
      L([K, 'const'], [T, ' tasks '], [K, '='], [T, ' '], [F, 'query'], [T, '(todoApi.'], [F, 'list'], [T, '());']),
      L(),
      L([K, 'return'], [T, ' (']),
      L([T, '  <'], [K, 'ul'], [T, '>']),
      L([T, '    {tasks.data.'], [F, 'map'], [T, '(('], [V, 't'], [T, ') '], [K, '=>'], [T, ' (']),
      L([T, '      <'], [K, 'li'], [T, ' '], [A, 'key'], [K, '='], [T, '{t.id}>{t.title} — {t.status}</'], [K, 'li'], [T, '>']),
      L([T, '    ))}' ]),
      L([T, '  </'], [K, 'ul'], [T, '>']),
      L([T, ')']),
      L(),
      L([C, 'Generated: '], [S, 'SELECT "id", "title", "status" FROM "todo"']),
      L([C, 'Never SELECT * — only what the UI actually uses.']),
    ],
  },
  {
    id: 'type-safety',
    label: 'End-to-End Types',
    tag: '02',
    title: 'Rename a field. Everything breaks — at compile time.',
    desc: 'One schema defines the shape. One type chain flows from database column to API route to form input. Rename `title` to `name` — TypeScript finds every broken reference across your entire stack before you run a single test.',
    code: [
      L([K, 'const'], [T, ' todos '], [K, '='], [T, ' d.'], [F, 'table'], [T, '('], [S, "'todos'"], [T, ', {']),
      L([T, '  id'], [K, ':'], [T, '   d.'], [F, 'uuid'], [T, '().'], [F, 'primary'], [T, '(),']),
      { t: [[E, '- '], [T, 'title'], [K, ':'], [T, ' d.'], [F, 'text'], [T, '(),']], bg: 'rgba(239,68,68,0.08)', bl: '3px solid #ef4444' },
      { t: [['color:#22c55e', '+ '], [T, 'name'], [K, ':'], [T, '  d.'], [F, 'text'], [T, '(),']], bg: 'rgba(34,197,94,0.08)', bl: '3px solid #22c55e' },
      L([T, '  done'], [K, ':'], [T, '  d.'], [F, 'boolean'], [T, '().'], [F, 'default'], [T, '('], [N, 'false'], [T, '),']),
      L([T, '});']),
      L(),
      L([E, '✗ '], [T, 'api.todos.'], [F, 'create'], [T, '({ '], [E, 'title'], [K, ':'], [T, ' '], [S, "'Buy milk'"], [T, ' });']),
      L([H, '  Property \'title\' does not exist. Did you mean \'name\'?']),
      L(),
      L([E, '✗ '], [T, '<'], [K, 'li'], [T, '>{t.'], [E, 'title'], [T, '}</'], [K, 'li'], [T, '>']),
      L([H, '  Property \'title\' does not exist on type \'Todo\'.']),
    ],
  },
  {
    id: 'openapi',
    label: 'Instant OpenAPI',
    tag: '03',
    title: 'Your schema is the documentation.',
    desc: 'Every entity gets REST endpoints and a fully documented OpenAPI spec. No decorators. No separate spec file. No drift between code and docs. Define the entity, get CRUD operations with complete request/response schemas at `/api/openapi`.',
    code: [
      L([K, 'export'], [T, ' '], [K, 'const'], [T, ' todos '], [K, '='], [T, ' '], [F, 'entity'], [T, '('], [S, "'todos'"], [T, ', {']),
      L([T, '  model'], [K, ':'], [T, ' todosModel,']),
      L([T, '  access'], [K, ':'], [T, ' {']),
      L([T, '    list'], [K, ':'], [T, '   rules.'], [F, 'authenticated'], [T, '(),']),
      L([T, '    create'], [K, ':'], [T, ' rules.'], [F, 'authenticated'], [T, '(),']),
      L([T, '    delete'], [K, ':'], [T, ' rules.'], [F, 'entitlement'], [T, '('], [S, "'todo:delete'"], [T, '),']),
      L([T, '  },']),
      L([T, '});']),
      L(),
      L([C, 'Auto-generated REST + OpenAPI:']),
      L([S, 'GET  /api/todos'], [C, '      '], [S, 'POST /api/todos']),
      L([S, 'GET  /api/todos/:id'], [C, '  '], [S, 'PUT  /api/todos/:id']),
      L([K, 'GET  /api/openapi'], [C, '    ← full OpenAPI spec']),
    ],
  },
  {
    id: 'sdk',
    label: 'TypeScript SDK',
    tag: '04',
    title: 'Generate. Publish. Let agents consume.',
    desc: 'One command generates a typed client SDK from your API. Publish to npm for third-party developers. Feed it to an LLM agent. Every endpoint typed, every response validated, every breaking change caught at compile time — for your consumers too.',
    code: [
      L([H, '$ vertz codegen']),
      L(),
      L([C, 'Your consumers get fully typed access:']),
      L([K, 'import'], [T, ' { '], [F, 'createClient'], [T, ' } '], [K, 'from'], [T, ' '], [S, "'@myapp/sdk'"], [T, ';']),
      L(),
      L([K, 'const'], [T, ' api '], [K, '='], [T, ' '], [F, 'createClient'], [T, '({ baseUrl'], [K, ':'], [T, ' '], [S, "'https://...'"], [T, ' });']),
      L(),
      L([K, 'const'], [T, ' todos '], [K, '='], [T, ' '], [K, 'await'], [T, ' api.todos.'], [F, 'list'], [T, '();']),
      L([C, '   ^? { id: string; title: string; done: boolean }[]']),
      L(),
      L([K, 'await'], [T, ' api.todos.'], [F, 'create'], [T, '({ title'], [K, ':'], [T, ' '], [S, "'Ship it'"], [T, ' });']),
      L([C, '                      ^? CreateTodoInput — fully typed']),
    ],
  },
  {
    id: 'agent-native',
    label: 'Agent-Native',
    tag: '05',
    title: 'One pattern per task. Agents get it right the first time.',
    desc: 'Every API has one canonical pattern. No framework trivia, no hidden conventions. Add one line to the schema — database, API, SDK, validation, and forms all update. An LLM agent writes correct code on the first try because there\'s only one way to do it.',
    code: [
      L([S, 'Agent prompt: "Add a due date to todos"']),
      L(),
      L([C, 'Schema — the only code the agent writes:']),
      L([T, 'dueDate'], [K, ':'], [T, ' d.'], [F, 'date'], [T, '().'], [F, 'optional'], [T, '(),']),
      L(),
      L([C, 'Vertz derives everything else:']),
      L([S, '✓ Database migration']),
      L([S, '✓ API endpoint updates']),
      L([S, '✓ OpenAPI spec update']),
      L([S, '✓ SDK type update']),
      L([S, '✓ Form validation rules']),
      L([K, 'One line of schema → full-stack feature.']),
    ],
  },
  {
    id: 'zero-runtime',
    label: 'Zero-Runtime Signals',
    tag: '06',
    title: 'The compiler does the work. Not the browser.',
    desc: '`let count = 0` becomes a reactive signal. `const double = count * 2` becomes a computed value. The compiler transforms at build time — not the browser at runtime. No virtual DOM, no diffing, no framework overhead. Just direct DOM updates.',
    code: [
      L([C, 'You write this:']),
      L([K, 'export'], [T, ' '], [K, 'function'], [T, ' '], [F, 'Counter'], [T, '() {']),
      L([T, '  '], [K, 'let'], [T, ' count '], [K, '='], [T, ' '], [N, '0'], [T, ';']),
      L([T, '  '], [K, 'const'], [T, ' double '], [K, '='], [T, ' count '], [K, '*'], [T, ' '], [N, '2'], [T, ';']),
      L(),
      L([T, '  '], [K, 'return'], [T, ' (']),
      L([T, '    <'], [K, 'button'], [T, ' '], [A, 'onClick'], [K, '='], [T, '{() '], [K, '=>'], [T, ' count'], [K, '++'], [T, '}>']),
      L([T, '      {count} × 2 = {double}']),
      L([T, '    </'], [K, 'button'], [T, '>']),
      L([T, '  );']),
      L([T, '}']),
      L([C, 'Compiler: let → signal(), const → computed()']),
      L([C, 'Runtime: '], [K, 'direct DOM updates. Zero overhead.']),
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
              <span key={j} style={token[0]}>{token[1]}</span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Feature showcase (Island for interactivity) ─────────────

function FeatureShowcase() {
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
            onClick={() => { activeIndex = i; }}
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

export function Features() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <p className={s.label} style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}>
          Features
        </p>
        <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
          Not another framework wrapper.
        </h2>
        <p className={s.subtitle} style={{ color: '#9C9690' }}>
          Every feature exists because the compiler knows your entire stack — schema, API, and UI — at build time.
        </p>

        <Island component={FeatureShowcase} />
      </div>
    </section>
  );
}
