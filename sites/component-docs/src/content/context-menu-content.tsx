import { ContextMenu } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { contextMenuItemProps, contextMenuProps } from '../props/context-menu-props';

export const description = 'A menu that appears on right-click with contextual actions.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <ContextMenu>
          <ContextMenu.Trigger>
            <div
              style={{
                border: '1px dashed var(--color-border)',
                borderRadius: '8px',
                padding: '32px',
                textAlign: 'center',
                color: 'var(--color-muted-foreground)',
                fontSize: '14px',
              }}
            >
              Right click here
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Content>
            <ContextMenu.Item value="copy">Copy</ContextMenu.Item>
            <ContextMenu.Item value="paste">Paste</ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item value="delete">Delete</ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { ContextMenu } from '@vertz/ui/components';

<ContextMenu>
  <ContextMenu.Trigger>
    <div>Right click here</div>
  </ContextMenu.Trigger>
  <ContextMenu.Content>
    <ContextMenu.Item value="copy">Copy</ContextMenu.Item>
    <ContextMenu.Item value="paste">Paste</ContextMenu.Item>
    <ContextMenu.Separator />
    <ContextMenu.Item value="delete">Delete</ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={contextMenuProps} />

      <DocH2>ContextMenu.Item Props</DocH2>
      <PropsTable props={contextMenuItemProps} />
    </>
  );
}
