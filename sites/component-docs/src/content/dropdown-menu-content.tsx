import { Button, DropdownMenu } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { dropdownMenuItemProps, dropdownMenuProps } from '../props/dropdown-menu-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <DropdownMenu>
          <DropdownMenu.Trigger>
            <Button intent="outline">Open Menu</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Label>My Account</DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Item value="profile">Profile</DropdownMenu.Item>
            <DropdownMenu.Item value="settings">Settings</DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item value="logout">Log out</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { DropdownMenu, Button } from '@vertz/ui/components';

<DropdownMenu>
  <DropdownMenu.Trigger>
    <Button>Open Menu</Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Label>Actions</DropdownMenu.Label>
    <DropdownMenu.Separator />
    <DropdownMenu.Item value="edit">Edit</DropdownMenu.Item>
    <DropdownMenu.Item value="delete">Delete</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={dropdownMenuProps} />

      <DocH2>DropdownMenu.Item Props</DocH2>
      <PropsTable props={dropdownMenuItemProps} />
    </>
  );
}
