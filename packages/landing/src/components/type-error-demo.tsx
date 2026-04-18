import { css, token } from '@vertz/ui';
import { TOKENS_DIFF_SCHEMA, TOKENS_ERROR_API, TOKENS_ERROR_UI_RENDER } from './highlighted-code';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  wrapper: { maxWidth: '56rem', marginInline: 'auto' },
  sectionLabel: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: token.spacing[4],
    textAlign: 'center',
    color: token.color.gray[500],
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
    color: token.color.gray[400],
  },
  grid: {
    display: 'grid',
    gap: token.spacing[8],
    '@media (min-width: 768px)': { gridTemplateColumns: '1fr 1fr' },
  },
  columnLabel: {
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: token.spacing[3],
  },
  codeBlock: {
    borderWidth: '1px',
    borderRadius: token.radius.lg,
    padding: token.spacing[6],
    fontSize: token.font.size.sm,
    backgroundColor: token.color.gray[950],
    '&': { overflowX: 'auto' },
  },
  errorHint: {
    fontSize: token.font.size.xs,
    paddingLeft: token.spacing[4],
    color: token.color.gray[500],
  },
  errorSpacer: {
    marginTop: token.spacing[4],
    marginBottom: token.spacing[1],
    color: token.color.gray[500],
  },
  errorLabel: { marginBottom: token.spacing[1], color: token.color.gray[500] },
});

// Diff metadata: which lines in TOKENS_DIFF_SCHEMA get diff treatment
// Line indices: 0=opening, 1=id, 2=title(removed), 3=name(added), 4=done, 5=closing
const DIFF_LINES: Record<number, 'removed' | 'added'> = {
  2: 'removed',
  3: 'added',
};

const DIFF_STYLES = {
  removed: {
    position: 'relative' as const,
    background: 'rgba(239,68,68,0.1)',
    margin: '0 -1.5rem',
    padding: '0 1.5rem 0 calc(1.5rem - 3px)',
    borderLeft: '3px solid #ef4444',
  },
  added: {
    position: 'relative' as const,
    background: 'rgba(34,197,94,0.1)',
    margin: '0 -1.5rem',
    padding: '0 1.5rem 0 calc(1.5rem - 3px)',
    borderLeft: '3px solid #22c55e',
  },
};

const DIFF_SIGN_STYLES = {
  removed: { position: 'absolute' as const, left: '0.5rem', color: '#ef4444' },
  added: { position: 'absolute' as const, left: '0.5rem', color: '#22c55e' },
};

// Pre-compute diff metadata at module level to avoid compiler
// transforming `const` inside .map() callbacks into computed signals
// (which loses closure over the callback index parameter).
const DIFF_ITEMS = TOKENS_DIFF_SCHEMA.map((line, i) => ({
  line,
  diff: DIFF_LINES[i] as 'removed' | 'added' | undefined,
  key: i,
}));

function DiffCodeBlock() {
  return (
    <div
      className={s.codeBlock}
      style={{ borderColor: '#1e1e22', fontFamily: 'var(--font-mono)', lineHeight: '1.75' }}
    >
      <pre style={{ margin: '0' }}>
        <code>
          {DIFF_ITEMS.map((item) => {
            if (item.diff) {
              return (
                <div key={item.key} style={DIFF_STYLES[item.diff]}>
                  <span style={DIFF_SIGN_STYLES[item.diff]}>
                    {item.diff === 'removed' ? '-' : '+'}
                  </span>
                  <span style={item.diff === 'removed' ? { opacity: '0.65' } : undefined}>
                    {item.line.map((token) => (
                      <span key={token[1]} style={token[0]}>
                        {token[1]}
                      </span>
                    ))}
                  </span>
                </div>
              );
            }
            return (
              <span key={item.key}>
                {item.line.map((token) => (
                  <span key={token[1]} style={token[0]}>
                    {token[1]}
                  </span>
                ))}
                {'\n'}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

// Pre-compute error API tokens with styles baked in
const ERROR_API_ITEMS = TOKENS_ERROR_API[0].map((token) => ({
  content: token[1],
  style:
    token[1] === ' title'
      ? `${token[0]}; text-decoration: wavy underline; text-decoration-color: #ef4444`
      : token[0],
}));

// Pre-compute error UI tokens with title split
const ERROR_UI_ITEMS = TOKENS_ERROR_UI_RENDER[0].map((token) => {
  if (!token[1].includes('title')) {
    return { content: token[1], style: token[0], parts: null };
  }
  return { content: token[1], style: token[0], parts: token[1].split('title') };
});

function ErrorCodeBlock() {
  return (
    <div
      className={s.codeBlock}
      style={{
        borderColor: 'rgba(239,68,68,0.3)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
        lineHeight: '1.75',
      }}
    >
      <div className={s.errorLabel}>
        <span style={{ color: '#ef4444' }}>✗</span> API call
      </div>
      <div>
        <pre style={{ margin: '0', display: 'inline' }}>
          <code>
            {ERROR_API_ITEMS.map((item) => (
              <span key={item.content} style={item.style}>
                {item.content}
              </span>
            ))}
          </code>
        </pre>
      </div>
      <div className={s.errorHint}>Property 'title' does not exist. Did you mean 'name'?</div>

      <div className={s.errorSpacer}>
        <span style={{ color: '#ef4444' }}>✗</span> UI render
      </div>
      <div>
        <pre style={{ margin: '0', display: 'inline' }}>
          <code>
            {ERROR_UI_ITEMS.map((item) =>
              item.parts ? (
                <span key={item.content} style={item.style}>
                  {item.parts[0]}
                  <span
                    style={{ textDecoration: 'wavy underline', textDecorationColor: '#ef4444' }}
                  >
                    title
                  </span>
                  {item.parts[1]}
                </span>
              ) : (
                <span key={item.content} style={item.style}>
                  {item.content}
                </span>
              ),
            )}
          </code>
        </pre>
      </div>
      <div className={s.errorHint}>Property 'title' does not exist on type 'Todo'.</div>
    </div>
  );
}

export function TypeErrorDemo() {
  return (
    <section className={s.section}>
      <div className={s.wrapper}>
        <p className={s.sectionLabel} style={{ fontFamily: 'var(--font-mono)' }}>
          Type safety
        </p>
        <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)' }}>
          Rename a field. The compiler catches everything.
        </h2>
        <p className={s.subtitle}>
          One rename. Every bug found at compile time. Zero runtime surprises.
        </p>

        <div className={s.grid}>
          <div>
            <p
              className={s.columnLabel}
              style={{ fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}
            >
              The change
            </p>
            <DiffCodeBlock />
          </div>

          <div>
            <p
              className={s.columnLabel}
              style={{ fontFamily: 'var(--font-mono)', color: '#ef4444' }}
            >
              Compile errors
            </p>
            <ErrorCodeBlock />
          </div>
        </div>
      </div>
    </section>
  );
}
