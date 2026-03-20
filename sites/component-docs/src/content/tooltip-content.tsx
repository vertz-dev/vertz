import { Button, Tooltip } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { tooltipProps } from '../props/tooltip-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <Tooltip>
          <Tooltip.Trigger>
            <Button intent="outline">Hover me</Button>
          </Tooltip.Trigger>
          <Tooltip.Content>This is a tooltip</Tooltip.Content>
        </Tooltip>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Tooltip, Button } from '@vertz/ui/components';

<Tooltip>
  <Tooltip.Trigger>
    <Button>Hover me</Button>
  </Tooltip.Trigger>
  <Tooltip.Content>This is a tooltip</Tooltip.Content>
</Tooltip>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={tooltipProps} />
    </>
  );
}
