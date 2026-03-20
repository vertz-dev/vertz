import { Link } from '@vertz/ui/router';
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
      {prev ? <Link href={`/components/${prev.name}`}>{`\u2190 ${prev.title}`}</Link> : <div />}
      {next ? <Link href={`/components/${next.name}`}>{`${next.title} \u2192`}</Link> : <div />}
    </div>
  );
}
