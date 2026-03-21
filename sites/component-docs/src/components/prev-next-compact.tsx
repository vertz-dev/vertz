import { useRouter } from '@vertz/ui/router';
import type { ComponentEntry } from '../manifest';

interface PrevNextCompactProps {
  prev: ComponentEntry | undefined;
  next: ComponentEntry | undefined;
}

export function PrevNextCompact({ prev, next }: PrevNextCompactProps) {
  const { navigate } = useRouter();

  function go(name: string) {
    navigate({ to: `/components/${name}` });
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '4px',
        marginBottom: '24px',
      }}
    >
      <button
        type="button"
        title={prev ? prev.title : undefined}
        disabled={!prev}
        onClick={() => prev && go(prev.name)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          fontSize: '18px',
          lineHeight: '1',
          borderRadius: '6px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'transparent',
          color: prev ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
          opacity: prev ? '1' : '0.3',
          cursor: prev ? 'pointer' : 'default',
          fontFamily: 'inherit',
          padding: '0',
        }}
      >
        {'\u2039'}
      </button>
      <button
        type="button"
        title={next ? next.title : undefined}
        disabled={!next}
        onClick={() => next && go(next.name)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          fontSize: '18px',
          lineHeight: '1',
          borderRadius: '6px',
          border: '1px solid var(--color-border)',
          backgroundColor: 'transparent',
          color: next ? 'var(--color-foreground)' : 'var(--color-muted-foreground)',
          opacity: next ? '1' : '0.3',
          cursor: next ? 'pointer' : 'default',
          fontFamily: 'inherit',
          padding: '0',
        }}
      >
        {'\u203A'}
      </button>
    </div>
  );
}
