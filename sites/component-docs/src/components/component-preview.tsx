interface ComponentPreviewProps {
  /** Path to the example source file (resolved at build time). */
  file?: string;
  /** Injected source code string (set by remark plugin at compile time). */
  __source?: string;
  /** The live component to render in the preview area. */
  children?: unknown;
}

export function ComponentPreview({ __source, children }: ComponentPreviewProps) {
  let showCode = false;

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '24px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          minHeight: '120px',
        }}
      >
        {children}
      </div>
      {__source ? (
        <div>
          <button
            type="button"
            style={{
              width: '100%',
              padding: '8px 16px',
              fontSize: '13px',
              color: 'var(--color-muted-foreground)',
              backgroundColor: 'var(--color-muted)',
              border: 'none',
              borderTop: '1px solid var(--color-border)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onClick={() => {
              showCode = !showCode;
            }}
          >
            {showCode ? 'Hide Code' : 'View Code'}
          </button>
          <div style={{ display: showCode ? 'block' : 'none' }}>
            <pre
              style={{
                margin: '0',
                padding: '16px',
                fontSize: '13px',
                lineHeight: '1.5',
                overflow: 'auto',
                backgroundColor: 'var(--color-muted)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              <code>{__source}</code>
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
