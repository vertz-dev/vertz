import type { ComponentEntry } from '../manifest';

interface PrevNextProps {
  prev: ComponentEntry | undefined;
  next: ComponentEntry | undefined;
}

export function PrevNext({ prev, next }: PrevNextProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: '1px solid var(--color-border)',
        padding: '24px 0',
        marginTop: '48px',
      }}
    >
      {prev ? (
        <a
          href={`/components/${prev.name}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
        >
          <span style={{ fontSize: '12px', color: 'var(--color-muted-foreground)' }}>Previous</span>
          <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--color-foreground)' }}>
            {prev.title}
          </span>
        </a>
      ) : (
        <div />
      )}
      {next ? (
        <a
          href={`/components/${next.name}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
        >
          <span style={{ fontSize: '12px', color: 'var(--color-muted-foreground)' }}>Next</span>
          <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--color-foreground)' }}>
            {next.title}
          </span>
        </a>
      ) : (
        <div />
      )}
    </div>
  );
}
