import { TOKENS_DIFF_SCHEMA, TOKENS_ERROR_API, TOKENS_ERROR_UI_RENDER } from '@/lib/highlighted-code';

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

function parseStyle(cssString: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const part of cssString.split(';')) {
    const [key, value] = part.split(':');
    if (key && value) {
      const camelKey = key.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      style[camelKey] = value.trim();
    }
  }
  return style;
}

function DiffCodeBlock() {
  return (
    <div
      className="border rounded-lg p-6 text-sm bg-gray-950"
      style={{ borderColor: '#1e1e22', fontFamily: 'var(--font-mono)', lineHeight: 1.75 }}
    >
      <pre style={{ margin: 0 }}>
        <code>
          {TOKENS_DIFF_SCHEMA.map((line, i) => {
            const diff = DIFF_LINES[i];
            if (diff) {
              return (
                <div key={i} style={DIFF_STYLES[diff]}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '0.5rem',
                      color: diff === 'removed' ? '#ef4444' : '#22c55e',
                    }}
                  >
                    {diff === 'removed' ? '-' : '+'}
                  </span>
                  <span style={diff === 'removed' ? { opacity: 0.5 } : undefined}>
                    {line.map((token, j) => (
                      <span key={j} style={parseStyle(token[0])}>
                        {token[1]}
                      </span>
                    ))}
                  </span>
                </div>
              );
            }
            return (
              <span key={i}>
                {line.map((token, j) => (
                  <span key={j} style={parseStyle(token[0])}>
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

function ErrorCodeBlock() {
  return (
    <div
      className="border rounded-lg p-6 text-sm bg-gray-950"
      style={{ borderColor: 'rgba(239,68,68,0.3)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.75 }}
    >
      <div className="mb-1 text-gray-500">
        <span style={{ color: '#ef4444' }}>{'\u2717'}</span> API call
      </div>
      <div>
        <pre style={{ margin: 0, display: 'inline' }}>
          <code>
            {TOKENS_ERROR_API[0].map((token, idx) => {
              const isTitle = token[1] === ' title';
              return (
                <span
                  key={idx}
                  style={{
                    ...parseStyle(token[0]),
                    ...(isTitle
                      ? { textDecoration: 'wavy underline', textDecorationColor: '#ef4444' }
                      : {}),
                  }}
                >
                  {token[1]}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
      <div className="text-xs pl-4 text-gray-500">Property &apos;title&apos; does not exist. Did you mean &apos;name&apos;?</div>

      <div className="mt-4 mb-1 text-gray-500">
        <span style={{ color: '#ef4444' }}>{'\u2717'}</span> UI render
      </div>
      <div>
        <pre style={{ margin: 0, display: 'inline' }}>
          <code>
            {TOKENS_ERROR_UI_RENDER[0].map((token, idx) => {
              const hasTitle = token[1].includes('title');
              if (!hasTitle) {
                return (
                  <span key={idx} style={parseStyle(token[0])}>
                    {token[1]}
                  </span>
                );
              }
              // Split token content around 'title' to apply wavy underline only to that word
              const parts = token[1].split('title');
              return (
                <span key={idx} style={parseStyle(token[0])}>
                  {parts[0]}
                  <span style={{ textDecoration: 'wavy underline', textDecorationColor: '#ef4444' }}>
                    title
                  </span>
                  {parts[1]}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
      <div className="text-xs pl-4 text-gray-500">Property &apos;title&apos; does not exist on type &apos;Todo&apos;.</div>
    </div>
  );
}

export function TypeErrorDemo() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <p
          className="text-xs tracking-widest uppercase mb-4 text-center text-gray-500"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Type safety
        </p>
        <h2
          className="text-4xl mb-4 text-center"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Rename a field. The compiler catches everything.
        </h2>
        <p className="text-center mb-12 max-w-xl mx-auto text-gray-400">
          One rename. Every bug found at compile time. Zero runtime surprises.
        </p>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <p
              className="text-xs uppercase tracking-wider mb-3"
              style={{ fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}
            >
              The change
            </p>
            <DiffCodeBlock />
          </div>

          <div>
            <p
              className="text-xs uppercase tracking-wider mb-3"
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
