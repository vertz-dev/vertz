import { Button } from '@vertz/ui/components';
import { ComposedMenu } from '@vertz/ui-primitives';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { menuItemProps, menuProps } from '../props/menu-props';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <ComposedMenu onSelect={(v) => console.log('Selected:', v)}>
          <ComposedMenu.Trigger>
            <Button intent="outline">Open Menu</Button>
          </ComposedMenu.Trigger>
          <ComposedMenu.Content>
            <ComposedMenu.Label>Actions</ComposedMenu.Label>
            <ComposedMenu.Separator />
            <ComposedMenu.Item value="edit">Edit</ComposedMenu.Item>
            <ComposedMenu.Item value="duplicate">Duplicate</ComposedMenu.Item>
            <ComposedMenu.Separator />
            <ComposedMenu.Item value="delete">Delete</ComposedMenu.Item>
          </ComposedMenu.Content>
        </ComposedMenu>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { ComposedMenu } from '@vertz/ui-primitives';

<ComposedMenu onSelect={(value) => console.log(value)}>
  <ComposedMenu.Trigger>
    <button>Open Menu</button>
  </ComposedMenu.Trigger>
  <ComposedMenu.Content>
    <ComposedMenu.Label>Actions</ComposedMenu.Label>
    <ComposedMenu.Separator />
    <ComposedMenu.Item value="edit">Edit</ComposedMenu.Item>
    <ComposedMenu.Item value="delete">Delete</ComposedMenu.Item>
  </ComposedMenu.Content>
</ComposedMenu>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={menuProps} />

      <DocH2>Menu.Item Props</DocH2>
      <PropsTable props={menuItemProps} />
    </>
  );
}
