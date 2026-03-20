import { ResizablePanel } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { resizablePanelPanelProps, resizablePanelProps } from '../props/resizable-panel-props';

export const description = 'A group of resizable panels with draggable handles.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ height: '200px', width: '100%' }}>
          <ResizablePanel orientation="horizontal">
            <ResizablePanel.Panel>
              <div style={{ padding: '16px' }}>Panel One</div>
            </ResizablePanel.Panel>
            <ResizablePanel.Handle />
            <ResizablePanel.Panel>
              <div style={{ padding: '16px' }}>Panel Two</div>
            </ResizablePanel.Panel>
          </ResizablePanel>
        </div>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { ResizablePanel } from '@vertz/ui/components';

<ResizablePanel orientation="horizontal">
  <ResizablePanel.Panel>
    <div>Panel One</div>
  </ResizablePanel.Panel>
  <ResizablePanel.Handle />
  <ResizablePanel.Panel>
    <div>Panel Two</div>
  </ResizablePanel.Panel>
</ResizablePanel>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={resizablePanelProps} />

      <DocH2>ResizablePanel.Panel Props</DocH2>
      <PropsTable props={resizablePanelPanelProps} />
    </>
  );
}
