import { ToggleGroup } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2, DocParagraph } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { toggleGroupItemProps, toggleGroupProps } from '../props/toggle-group-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <ToggleGroup type="multiple" defaultValue={['bold']}>
          <ToggleGroup.Item value="bold">Bold</ToggleGroup.Item>
          <ToggleGroup.Item value="italic">Italic</ToggleGroup.Item>
          <ToggleGroup.Item value="underline">Underline</ToggleGroup.Item>
        </ToggleGroup>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { ToggleGroup } from 'vertz/components';

<ToggleGroup type="multiple" defaultValue={['bold']}>
  <ToggleGroup.Item value="bold">Bold</ToggleGroup.Item>
  <ToggleGroup.Item value="italic">Italic</ToggleGroup.Item>
  <ToggleGroup.Item value="underline">Underline</ToggleGroup.Item>
</ToggleGroup>`}
        lang="tsx"
      />

      <DocH2>Single Selection</DocH2>
      <DocParagraph>
        Use type="single" when only one option should be active at a time.
      </DocParagraph>
      <ComponentPreview>
        <ToggleGroup type="single" defaultValue={['list']}>
          <ToggleGroup.Item value="grid">Grid</ToggleGroup.Item>
          <ToggleGroup.Item value="list">List</ToggleGroup.Item>
          <ToggleGroup.Item value="kanban">Kanban</ToggleGroup.Item>
        </ToggleGroup>
      </ComponentPreview>
      <CodeBlock
        code={`<ToggleGroup type="single" defaultValue={['list']}>
  <ToggleGroup.Item value="grid">Grid</ToggleGroup.Item>
  <ToggleGroup.Item value="list">List</ToggleGroup.Item>
  <ToggleGroup.Item value="kanban">Kanban</ToggleGroup.Item>
</ToggleGroup>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={toggleGroupProps} />

      <DocH2>ToggleGroup.Item Props</DocH2>
      <PropsTable props={toggleGroupItemProps} />
    </>
  );
}
