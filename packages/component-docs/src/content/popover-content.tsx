import { Button, Popover } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
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
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Popover, Button } from 'vertz/components';

<Popover>
  <Popover.Trigger>
    <Button>Open Popover</Button>
  </Popover.Trigger>
  <Popover.Content>
    Popover content here
  </Popover.Content>
</Popover>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={popoverProps} />
    </>
  );
}
