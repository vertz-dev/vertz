import type { DialogHandle } from '@vertz/ui';
import { useDialogStack } from '@vertz/ui';
import { Button, Dialog, Input, Label } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { dialogProps } from '../props/dialog-props';

function EditProfileDialog({ dialog }: { dialog: DialogHandle<void> }) {
  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Edit profile</Dialog.Title>
        <Dialog.Description>
          Make changes to your profile here. Click save when you're done.
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Body>
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
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Cancel>Cancel</Dialog.Cancel>
        <Button intent="primary" size="md" onClick={() => dialog.close()}>
          Save changes
        </Button>
      </Dialog.Footer>
    </>
  );
}

function DialogPreview() {
  const dialogs = useDialogStack();

  return (
    <Button intent="outline" onClick={() => dialogs.open(EditProfileDialog, {})}>
      Edit Profile
    </Button>
  );
}

export function Content() {
  return (
    <>
      <ComponentPreview>
        <DialogPreview />
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { useDialogStack } from '@vertz/ui';
import type { DialogHandle } from '@vertz/ui';
import { Dialog, Button } from '@vertz/ui/components';

function EditProfileDialog({ dialog }: { dialog: DialogHandle<void> }) {
  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Edit profile</Dialog.Title>
        <Dialog.Description>Make changes here.</Dialog.Description>
      </Dialog.Header>
      <Dialog.Body>...</Dialog.Body>
      <Dialog.Footer>
        <Dialog.Cancel>Cancel</Dialog.Cancel>
        <Button intent="primary" onClick={() => dialog.close()}>Save</Button>
      </Dialog.Footer>
    </>
  );
}

// Open via DialogStack
const dialogs = useDialogStack();
await dialogs.open(EditProfileDialog, {});`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={dialogProps} />
    </>
  );
}
