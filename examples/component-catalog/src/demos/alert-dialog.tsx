import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { AlertDialog } = themeComponents.primitives;

export function AlertDialogDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Confirmation</div>
        <AlertDialog>
          <AlertDialog.Trigger>
            <Button intent="destructive" size="md">Delete Account</Button>
          </AlertDialog.Trigger>
          <AlertDialog.Content>
            <AlertDialog.Title>Are you absolutely sure?</AlertDialog.Title>
            <AlertDialog.Description>
              This action cannot be undone. This will permanently delete your account and remove your data from our servers.
            </AlertDialog.Description>
            <AlertDialog.Footer>
              <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
              <AlertDialog.Action>Continue</AlertDialog.Action>
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog>
      </div>
    </div>
  );
}
