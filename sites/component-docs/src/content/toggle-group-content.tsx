import { ToggleGroup } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { toggleGroupItemProps, toggleGroupProps } from '../props/toggle-group-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <ToggleGroup type="single" defaultValue={['center']}>
          <ToggleGroup.Item value="left">Left</ToggleGroup.Item>
          <ToggleGroup.Item value="center">Center</ToggleGroup.Item>
          <ToggleGroup.Item value="right">Right</ToggleGroup.Item>
        </ToggleGroup>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { ToggleGroup } from '@vertz/ui/components';

<ToggleGroup type="single" defaultValue={['center']}>
  <ToggleGroup.Item value="left">Left</ToggleGroup.Item>
  <ToggleGroup.Item value="center">Center</ToggleGroup.Item>
  <ToggleGroup.Item value="right">Right</ToggleGroup.Item>
</ToggleGroup>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={toggleGroupProps} />

      <DocH2>ToggleGroup.Item Props</DocH2>
      <PropsTable props={toggleGroupItemProps} />
    </>
  );
}
