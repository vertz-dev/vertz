import { Separator } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { PropsTable } from '../components/props-table';
import { separatorProps } from '../props/separator-props';

export const description = 'Visually or semantically separates content.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h4
              style={{
                fontSize: '14px',
                fontWeight: '500',
                color: 'var(--color-foreground)',
                margin: '0 0 4px',
              }}
            >
              Vertz UI
            </h4>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--color-muted-foreground)',
                margin: '0',
              }}
            >
              An open-source UI component library.
            </p>
          </div>
          <Separator />
          <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-foreground)' }}>Blog</span>
            <Separator orientation="vertical" />
            <span style={{ fontSize: '14px', color: 'var(--color-foreground)' }}>Docs</span>
            <Separator orientation="vertical" />
            <span style={{ fontSize: '14px', color: 'var(--color-foreground)' }}>Source</span>
          </div>
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
          {`import { Separator } from '@vertz/ui/components';

<Separator />
<Separator orientation="vertical" />`}
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
        API Reference
      </h2>
      <PropsTable props={separatorProps} />
    </>
  );
}
