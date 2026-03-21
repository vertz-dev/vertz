import { Button, Dialog, Input, Label } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { dialogContentProps, dialogProps } from '../props/dialog-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Dialog>
          <Dialog.Trigger>
            <Button intent="outline">Edit Profile</Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Edit profile</Dialog.Title>
              <Dialog.Description>
                Make changes to your profile here. Click save when you're done.
              </Dialog.Description>
            </Dialog.Header>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <Label for="dialog-name">Name</Label>
                <Input id="dialog-name" name="name" defaultValue="Pedro Duarte" />
              </div>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <Label for="dialog-username">Username</Label>
                <Input id="dialog-username" name="username" defaultValue="@peduarte" />
              </div>
            </div>
            <Dialog.Footer>
              <Button intent="outline" size="md">
                Cancel
              </Button>
              <Button intent="primary" size="md">
                Save changes
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Dialog, Button } from 'vertz/components';

<Dialog>
  <Dialog.Trigger>
    <Button intent="outline">Edit Profile</Button>
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Edit profile</Dialog.Title>
      <Dialog.Description>Make changes here.</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button intent="outline">Cancel</Button>
      <Button intent="primary">Save changes</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={dialogProps} />

      <DocH2>Dialog.Content Props</DocH2>
      <PropsTable props={dialogContentProps} />
    </>
  );
}
