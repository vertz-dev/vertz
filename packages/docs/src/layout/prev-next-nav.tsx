export interface PrevNextNavProps {
  prev?: { path: string; title: string };
  next?: { path: string; title: string };
}

function PrevLink({ path, title }: { path: string; title: string }) {
  return (
    <a href={path} data-prev-link style={{ textDecoration: 'none' }}>
      <span style={{ fontSize: '12px', opacity: 0.6 }}>Previous</span>
      <span style={{ fontWeight: '500' }}>{title}</span>
    </a>
  );
}

function NextLink({ path, title }: { path: string; title: string }) {
  return (
    <a href={path} data-next-link style={{ textDecoration: 'none', textAlign: 'right' }}>
      <span style={{ fontSize: '12px', opacity: 0.6 }}>Next</span>
      <span style={{ fontWeight: '500' }}>{title}</span>
    </a>
  );
}

export function PrevNextNav({ prev, next }: PrevNextNavProps) {
  return (
    <nav
      aria-label="Page navigation"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '1px solid var(--docs-border, #e5e7eb)',
        paddingTop: '24px',
        marginTop: '48px',
      }}
    >
      {prev ? <PrevLink path={prev.path} title={prev.title} /> : <span />}
      {next ? <NextLink path={next.path} title={next.title} /> : <span />}
    </nav>
  );
}
