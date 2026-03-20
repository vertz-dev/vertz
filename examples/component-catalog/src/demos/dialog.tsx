import { Button, Dialog, Input, Label } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function DialogDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Edit profile</div>
        <Dialog>
          <Dialog.Trigger>
            <Button intent="outline" size="md">
              Edit Profile
            </Button>
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
      </div>

      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Share link</div>
        <Dialog>
          <Dialog.Trigger>
            <Button intent="outline" size="md">
              Share
            </Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Share link</Dialog.Title>
              <Dialog.Description>
                Anyone who has this link will be able to view this.
              </Dialog.Description>
            </Dialog.Header>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'grid', flex: 1, gap: '0.5rem' }}>
                <Input id="dialog-link" defaultValue="https://ui.shadcn.com/docs/installation" />
              </div>
            </div>
            <Dialog.Footer>
              <Button intent="secondary" size="md">
                Close
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog>
      </div>

      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Without footer</div>
        <Dialog>
          <Dialog.Trigger>
            <Button intent="outline" size="md">
              View Details
            </Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Details</Dialog.Title>
              <Dialog.Description>
                This dialog has no footer — it only shows informational content.
              </Dialog.Description>
            </Dialog.Header>
            <p style={{ color: 'var(--color-muted-foreground)', fontSize: '14px' }}>
              The footer is completely optional. Close this dialog using the X button or pressing
              Escape.
            </p>
          </Dialog.Content>
        </Dialog>
      </div>
    </div>
  );
}
