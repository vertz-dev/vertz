import { Menubar } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
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

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Menubar } from '@vertz/ui/components';

<Menubar>
  <Menubar.Menu value="file">
    <Menubar.Trigger>File</Menubar.Trigger>
    <Menubar.Content>
      <Menubar.Item value="new">New File</Menubar.Item>
      <Menubar.Item value="open">Open</Menubar.Item>
    </Menubar.Content>
  </Menubar.Menu>
</Menubar>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={menubarProps} />

      <DocH2>Menubar.Menu Props</DocH2>
      <PropsTable props={menubarMenuProps} />
    </>
  );
}
