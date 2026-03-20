import { Badge } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { PropsTable } from '../components/props-table';
import { badgeProps } from '../props/badge-props';

export const description = 'Displays a badge or a component that looks like a badge.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Badge>Badge</Badge>
      </ComponentPreview>

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
        Installation
      </h2>
      <pre
        style={{
          margin: '0 0 16px',
          padding: '16px',
          fontSize: '13px',
          lineHeight: '1.5',
          overflow: 'auto',
          borderRadius: '8px',
          backgroundColor: 'var(--color-muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </pre>

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
        Usage
      </h2>
      <pre
        style={{
          margin: '0 0 16px',
          padding: '16px',
          fontSize: '13px',
          lineHeight: '1.5',
          overflow: 'auto',
          borderRadius: '8px',
          backgroundColor: 'var(--color-muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <code>
          {`import { Badge } from '@vertz/ui/components';

<Badge>Badge</Badge>`}
        </code>
      </pre>

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
        Examples
      </h2>

      <h3
        style={{
          fontSize: '18px',
          fontWeight: '600',
          lineHeight: '1.4',
          color: 'var(--color-foreground)',
          margin: '24px 0 12px',
        }}
      >
        Colors
      </h3>
      <ComponentPreview>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Badge color="gray">Gray</Badge>
          <Badge color="blue">Blue</Badge>
          <Badge color="green">Green</Badge>
          <Badge color="yellow">Yellow</Badge>
          <Badge color="red">Red</Badge>
        </div>
      </ComponentPreview>

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
        API Reference
      </h2>
      <PropsTable props={badgeProps} />
    </>
  );
}
