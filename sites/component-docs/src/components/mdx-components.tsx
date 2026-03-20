/** MDX component overrides for consistent styling of markdown elements. */

interface MdxProps {
  children?: unknown;
  [key: string]: unknown;
}

export function DocH1({ children }: MdxProps) {
  return (
    <h1
      style={{
        fontSize: '30px',
        fontWeight: '700',
        lineHeight: '1.2',
        color: 'var(--color-foreground)',
        margin: '0 0 8px',
      }}
    >
      {children}
    </h1>
  );
}

export function DocH2({ children }: MdxProps) {
  return (
    <h2
      style={{
        fontSize: '22px',
        fontWeight: '600',
        lineHeight: '1.3',
        color: 'var(--color-foreground)',
        margin: '32px 0 16px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {children}
    </h2>
  );
}

export function DocH3({ children }: MdxProps) {
  return (
    <h3
      style={{
        fontSize: '18px',
        fontWeight: '600',
        lineHeight: '1.4',
        color: 'var(--color-foreground)',
        margin: '24px 0 12px',
      }}
    >
      {children}
    </h3>
  );
}

export function DocParagraph({ children }: MdxProps) {
  return (
    <p
      style={{
        fontSize: '15px',
        lineHeight: '1.7',
        color: 'var(--color-foreground)',
        margin: '0 0 16px',
      }}
    >
      {children}
    </p>
  );
}

export function InlineCode({ children }: MdxProps) {
  return (
    <code
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '13px',
        backgroundColor: 'var(--color-muted)',
        padding: '2px 6px',
        borderRadius: '4px',
      }}
    >
      {children}
    </code>
  );
}

export function DocLink({ href, children }: MdxProps & { href?: string }) {
  return (
    <a
      href={href as string}
      style={{
        color: 'var(--color-primary)',
        textDecoration: 'underline',
        textUnderlineOffset: '4px',
      }}
    >
      {children}
    </a>
  );
}

export function DocList({ children }: MdxProps) {
  return (
    <ul
      style={{
        paddingLeft: '24px',
        margin: '0 0 16px',
        fontSize: '15px',
        lineHeight: '1.7',
      }}
    >
      {children}
    </ul>
  );
}

export function DocOrderedList({ children }: MdxProps) {
  return (
    <ol
      style={{
        paddingLeft: '24px',
        margin: '0 0 16px',
        fontSize: '15px',
        lineHeight: '1.7',
      }}
    >
      {children}
    </ol>
  );
}

export function DocTable({ children }: MdxProps) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        {children}
      </table>
    </div>
  );
}

/**
 * CodeFence: MDX `pre` override.
 * When Shiki is enabled, the pre tag already contains highlighted HTML.
 * This wrapper adds consistent styling around the highlighted output.
 */
export function CodeFence({ children, ...props }: MdxProps) {
  return (
    <pre
      {...props}
      style={{
        margin: '0 0 16px',
        padding: '16px',
        fontSize: '13px',
        lineHeight: '1.5',
        overflow: 'auto',
        borderRadius: '8px',
        backgroundColor: 'var(--color-muted)',
        fontFamily: 'var(--font-mono, monospace)',
        ...(typeof props.style === 'object' ? props.style : {}),
      }}
    >
      {children}
    </pre>
  );
}

/** Map of all MDX component overrides. */
export const mdxComponents = {
  h1: DocH1,
  h2: DocH2,
  h3: DocH3,
  p: DocParagraph,
  code: InlineCode,
  pre: CodeFence,
  a: DocLink,
  ul: DocList,
  ol: DocOrderedList,
  table: DocTable,
};
