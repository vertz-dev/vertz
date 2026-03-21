import { Separator } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { separatorProps } from '../props/separator-props';
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
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Separator } from 'vertz/components';

<Separator />
<Separator orientation="vertical" />`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={separatorProps} />
    </>
  );
}
