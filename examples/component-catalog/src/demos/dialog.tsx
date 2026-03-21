import type { DialogHandle } from '@vertz/ui';
import { useDialogStack } from '@vertz/ui';
import { Button, Dialog, Input, Label } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

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

function ShareLinkDialog({ dialog }: { dialog: DialogHandle<void> }) {
  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Share link</Dialog.Title>
        <Dialog.Description>Anyone who has this link will be able to view this.</Dialog.Description>
      </Dialog.Header>
      <Dialog.Body>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'grid', flex: '1', gap: '0.5rem' }}>
            <Input id="dialog-link" defaultValue="https://ui.shadcn.com/docs/installation" />
          </div>
        </div>
      </Dialog.Body>
      <Dialog.Footer>
        <Button intent="secondary" size="md" onClick={() => dialog.close()}>
          Close
        </Button>
      </Dialog.Footer>
    </>
  );
}

function DetailsDialog() {
  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Details</Dialog.Title>
        <Dialog.Description>
          This dialog has no footer — it only shows informational content.
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Body>
        <p style={{ color: 'var(--color-muted-foreground)', fontSize: '14px' }}>
          The footer is completely optional. Close this dialog using the X button or pressing
          Escape.
        </p>
      </Dialog.Body>
    </>
  );
}

export function DialogDemo() {
  const dialogs = useDialogStack();

  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Edit profile</div>
        <Button intent="outline" size="md" onClick={() => dialogs.open(EditProfileDialog, {})}>
          Edit Profile
        </Button>
      </div>

      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Share link</div>
        <Button intent="outline" size="md" onClick={() => dialogs.open(ShareLinkDialog, {})}>
          Share
        </Button>
      </div>

      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Without footer</div>
        <Button intent="outline" size="md" onClick={() => dialogs.open(DetailsDialog, {})}>
          View Details
        </Button>
      </div>
    </div>
  );
}
