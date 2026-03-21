import { Menubar } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { menubarMenuProps, menubarProps } from '../props/menubar-props';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Menubar>
          <Menubar.Menu value="file">
            <Menubar.Trigger>File</Menubar.Trigger>
            <Menubar.Content>
              <Menubar.Item value="new">New File</Menubar.Item>
              <Menubar.Item value="open">Open</Menubar.Item>
              <Menubar.Separator />
              <Menubar.Item value="exit">Exit</Menubar.Item>
            </Menubar.Content>
          </Menubar.Menu>
          <Menubar.Menu value="edit">
            <Menubar.Trigger>Edit</Menubar.Trigger>
            <Menubar.Content>
              <Menubar.Item value="undo">Undo</Menubar.Item>
              <Menubar.Item value="redo">Redo</Menubar.Item>
            </Menubar.Content>
          </Menubar.Menu>
        </Menubar>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Menubar } from 'vertz/components';

<Menubar>
  <Menubar.Menu value="file">
    <Menubar.Trigger>File</Menubar.Trigger>
    <Menubar.Content>
      <Menubar.Item value="new">New File</Menubar.Item>
      <Menubar.Item value="open">Open</Menubar.Item>
    </Menubar.Content>
  </Menubar.Menu>
</Menubar>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={menubarProps} />

      <DocH2>Menubar.Menu Props</DocH2>
      <PropsTable props={menubarMenuProps} />
    </>
  );
}
