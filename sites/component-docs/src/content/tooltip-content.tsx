import { Button, Tooltip } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
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
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Tooltip, Button } from 'vertz/components';

<Tooltip>
  <Tooltip.Trigger>
    <Button>Hover me</Button>
  </Tooltip.Trigger>
  <Tooltip.Content>This is a tooltip</Tooltip.Content>
</Tooltip>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={tooltipProps} />
    </>
  );
}
