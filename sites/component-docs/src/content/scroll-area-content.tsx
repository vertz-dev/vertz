import { ScrollArea, Separator } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { scrollAreaProps } from '../props/scroll-area-props';

const tags = Array.from({ length: 50 }, (_, i) => `v1.${i}.0`);

export function Content() {
  return (
    <>
      <ComponentPreview>
        <div
          style={{
            height: '18rem',
            width: '14rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <ScrollArea>
            <div style={{ padding: '1rem' }}>
              <h4
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  margin: '0 0 1rem',
                  color: 'var(--color-foreground)',
                }}
              >
                Tags
              </h4>
              {tags.map((tag) => (
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      padding: '0.375rem 0',
                      color: 'var(--color-foreground)',
                    }}
                  >
                    {tag}
                  </div>
                  <Separator />
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { ScrollArea } from 'vertz/components';

<ScrollArea>
  <div style={{ height: '200px' }}>
    Scrollable content here...
  </div>
</ScrollArea>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={scrollAreaProps} />
    </>
  );
}
