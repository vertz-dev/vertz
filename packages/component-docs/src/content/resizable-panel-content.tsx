import { ResizablePanel } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { resizablePanelPanelProps, resizablePanelProps } from '../props/resizable-panel-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <div
          style={{
            height: '200px',
            width: '100%',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <ResizablePanel orientation="horizontal">
            <ResizablePanel.Panel defaultSize={50}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--color-muted-foreground)',
                  fontSize: '14px',
                }}
              >
                Panel One
              </div>
            </ResizablePanel.Panel>
            <ResizablePanel.Handle />
            <ResizablePanel.Panel defaultSize={50}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--color-muted-foreground)',
                  fontSize: '14px',
                }}
              >
                Panel Two
              </div>
            </ResizablePanel.Panel>
          </ResizablePanel>
        </div>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { ResizablePanel } from 'vertz/components';

<ResizablePanel orientation="horizontal">
  <ResizablePanel.Panel>
    <div>Panel One</div>
  </ResizablePanel.Panel>
  <ResizablePanel.Handle />
  <ResizablePanel.Panel>
    <div>Panel Two</div>
  </ResizablePanel.Panel>
</ResizablePanel>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={resizablePanelProps} />

      <DocH2>ResizablePanel.Panel Props</DocH2>
      <PropsTable props={resizablePanelPanelProps} />
    </>
  );
}
