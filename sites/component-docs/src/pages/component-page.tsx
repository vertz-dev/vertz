import { useParams } from '@vertz/ui/router';
import { DocsLayout } from '../components/docs-layout';
import { PrevNext } from '../components/prev-next';
import { findComponent, getAdjacentComponents } from '../manifest';

export function ComponentPage() {
  const { name } = useParams<'/components/:name'>();
  const entry = findComponent(name);
  const { prev, next } = getAdjacentComponents(name);

  if (!entry) {
    return (
      <DocsLayout>
        <h1
          style={{
            fontSize: '30px',
            fontWeight: '700',
            lineHeight: '1.2',
            color: 'var(--color-foreground)',
            margin: '0 0 8px',
          }}
        >
          Component not found
        </h1>
        <p
          style={{
            fontSize: '16px',
            lineHeight: '1.6',
            color: 'var(--color-muted-foreground)',
            margin: '0 0 32px',
          }}
        >
          The component "{name}" does not exist in the documentation.
        </p>
      </DocsLayout>
    );
  }

  return (
    <DocsLayout activeName={name}>
      <h1
        style={{
          fontSize: '30px',
          fontWeight: '700',
          lineHeight: '1.2',
          color: 'var(--color-foreground)',
          margin: '0 0 8px',
        }}
      >
        {entry.title}
      </h1>
      <p
        style={{
          fontSize: '16px',
          lineHeight: '1.6',
          color: 'var(--color-muted-foreground)',
          margin: '0 0 32px',
        }}
      >
        Documentation for {entry.title} is coming soon.
      </p>
      <PrevNext prev={prev} next={next} />
    </DocsLayout>
  );
}
