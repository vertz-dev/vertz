import { css, token } from '@vertz/ui';

// ── Token color shorthand ───────────────────────────────────

const K = 'color:#C8451B'; // keyword
const F = 'color:#B8A080'; // function/method
const S = 'color:#7A9B6D'; // string
const C = 'color:#4A4540'; // comment
const T = 'color:#D4D0C8'; // text/identifier
const A = 'color:#B8A080;font-style:italic'; // JSX attribute
const E = 'color:#ef4444'; // error red

type Token = [string, string];
type Line = { t: Token[] };

function L(...t: Token[]): Line {
  return { t };
}

// ── Code data ───────────────────────────────────────────────

const BEFORE: Line[] = [
  L([C, '// Hand-written fetch']),
  L([K, 'const'], [T, ' res '], [K, '='], [T, ' '], [K, 'await'], [T, ' '], [F, 'fetch'], [T, '(']),
  L([T, '  '], [S, "'https://api.example.com/tasks'"]),
  L([T, '  { '], [A, 'method'], [K, ':'], [T, ' '], [S, "'POST'"], [T, ',']),
  L([T, '    '], [A, 'headers'], [K, ':'], [T, ' {']),
  L([T, '      '], [S, "'Content-Type'"], [K, ':'], [T, ' '], [S, "'application/json'"], [T, ',']),
  L([T, '      '], [S, "'Authorization'"], [K, ':'], [T, ' '], [S, '`Bearer ${token}`'], [T, ',']),
  L([T, '    },']),
  L(
    [T, '    '],
    [A, 'body'],
    [K, ':'],
    [T, ' JSON.'],
    [F, 'stringify'],
    [T, '({ '],
    [A, 'title'],
    [K, ':'],
    [T, ' '],
    [S, "'Ship it'"],
    [T, ' }),'],
  ),
  L([T, '  }']),
  L([T, ');']),
  L(
    [K, 'const'],
    [T, ' data '],
    [K, '='],
    [T, ' '],
    [K, 'await'],
    [T, ' res.'],
    [F, 'json'],
    [T, '();'],
  ),
  L([E, '//              ^? any 😬']),
];

const AFTER: Line[] = [
  L([C, '// Generated SDK']),
  L([K, 'const'], [T, ' api '], [K, '='], [T, ' '], [F, 'createClient'], [T, '({']),
  L([T, '  '], [A, 'baseURL'], [K, ':'], [T, ' '], [S, "'https://api.example.com'"], [T, ',']),
  L([T, '  '], [A, 'auth'], [K, ':'], [T, ' { '], [A, 'bearerAuth'], [K, ':'], [T, ' token },']),
  L([T, '});']),
  L(),
  L(
    [K, 'const'],
    [T, ' result '],
    [K, '='],
    [T, ' '],
    [K, 'await'],
    [T, ' api.tasks.'],
    [F, 'create'],
    [T, '({'],
  ),
  L([T, '  '], [A, 'title'], [K, ':'], [T, ' '], [S, "'Ship it'"], [T, ',']),
  L([T, '});']),
  L([C, '// ^? FetchResponse<Task>']),
  L([C, '// Typed, with retries & error handling']),
];

// ── Styles ──────────────────────────────────────────────────

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  container: { maxWidth: '64rem', marginInline: 'auto' },
  label: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: token.spacing[4],
    textAlign: 'center',
  },
  heading: {
    fontSize: token.font.size['2xl'],
    marginBottom: token.spacing[4],
    textAlign: 'center',
    '@media (min-width: 768px)': { fontSize: '2.25rem' },
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: token.spacing[12],
    maxWidth: '42rem',
    marginInline: 'auto',
    fontSize: token.font.size.sm,
    '@media (min-width: 768px)': { fontSize: '1rem' },
  },
  grid: {
    display: 'grid',
    gap: token.spacing[6],
    '@media (min-width: 768px)': { gridTemplateColumns: '1fr 1fr' },
  },
  codeBlock: {
    padding: token.spacing[5],
    borderWidth: '1px',
    fontSize: token.font.size.xs,
    lineHeight: token.font.lineHeight.relaxed,
    '&': { overflowX: 'auto' },
    '@media (min-width: 768px)': { padding: '1.5rem', fontSize: '0.875rem' },
  },
  columnLabel: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: token.spacing[3],
  },
});

// ── Code block renderer ─────────────────────────────────────

function CodeLines({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((line, i) => {
        const isEmpty = line.t.length === 0;
        return (
          <div key={i} style={{ minHeight: isEmpty ? '1em' : undefined }}>
            {line.t.map((token, j) => (
              <span key={j} style={token[0]}>
                {token[1]}
              </span>
            ))}
          </div>
        );
      })}
    </>
  );
}

// ── Export ───────────────────────────────────────────────────

export function OpenAPIComparison() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <p className={s.label} style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}>
          Before / After
        </p>
        <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
          Stop writing boilerplate.
        </h2>
        <p className={s.subtitle} style={{ color: '#9C9690' }}>
          Replace hand-written fetch calls with a generated, typed SDK — fewer lines, full type
          safety, built-in auth.
        </p>

        <div className={s.grid}>
          <div>
            <p
              className={s.columnLabel}
              style={{ fontFamily: 'var(--font-mono)', color: '#ef4444' }}
            >
              Before
            </p>
            <div
              className={s.codeBlock}
              style={{
                fontFamily: 'var(--font-mono)',
                background: '#111110',
                borderColor: 'rgba(239,68,68,0.2)',
                borderRadius: '2px',
                whiteSpace: 'pre',
              }}
            >
              <CodeLines lines={BEFORE} />
            </div>
          </div>

          <div>
            <p
              className={s.columnLabel}
              style={{ fontFamily: 'var(--font-mono)', color: '#22c55e' }}
            >
              After
            </p>
            <div
              className={s.codeBlock}
              style={{
                fontFamily: 'var(--font-mono)',
                background: '#111110',
                borderColor: 'rgba(34,197,94,0.2)',
                borderRadius: '2px',
                whiteSpace: 'pre',
              }}
            >
              <CodeLines lines={AFTER} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
