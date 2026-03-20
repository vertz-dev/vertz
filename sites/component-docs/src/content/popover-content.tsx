import { Button, Popover } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { popoverProps } from '../props/popover-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <Popover>
          <Popover.Trigger>
            <Button intent="outline">Open Popover</Button>
          </Popover.Trigger>
          <Popover.Content>
            <div style={{ padding: '8px' }}>
              <p style={{ margin: '0', fontSize: '14px' }}>Popover content goes here.</p>
            </div>
          </Popover.Content>
        </Popover>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Popover, Button } from '@vertz/ui/components';

<Popover>
  <Popover.Trigger>
    <Button>Open Popover</Button>
  </Popover.Trigger>
  <Popover.Content>
    Popover content here
  </Popover.Content>
</Popover>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={popoverProps} />
    </>
  );
}
