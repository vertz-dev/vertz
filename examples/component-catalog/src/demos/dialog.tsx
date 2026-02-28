import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button, Input, Label } = themeComponents;
const { Dialog } = themeComponents.primitives;

export function DialogDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With form</div>
        <Dialog>
          <Dialog.Trigger>
            <Button intent="outline" size="md">Edit Profile</Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Edit profile</Dialog.Title>
            <Dialog.Description>
              Make changes to your profile here. Click save when you're done.
            </Dialog.Description>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              <div style="display: flex; flex-direction: column; gap: 0.375rem;">
                <Label htmlFor="dialog-name">Name</Label>
                <Input id="dialog-name" name="name" defaultValue="Pedro Duarte" />
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.375rem;">
                <Label htmlFor="dialog-username">Username</Label>
                <Input id="dialog-username" name="username" defaultValue="@peduarte" />
              </div>
            </div>
            <Dialog.Footer>
              <Button intent="outline" size="md">Cancel</Button>
              <Button intent="primary" size="md">Save changes</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog>
      </div>

      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Without footer</div>
        <Dialog>
          <Dialog.Trigger>
            <Button intent="outline" size="md">View Details</Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Details</Dialog.Title>
            <Dialog.Description>
              This dialog has no footer — it only shows informational content.
            </Dialog.Description>
            <p style="color: var(--color-muted-foreground); font-size: 14px;">
              The footer is completely optional. Close this dialog using the X button or pressing
              Escape.
            </p>
          </Dialog.Content>
        </Dialog>
      </div>
    </div>
  );
}
