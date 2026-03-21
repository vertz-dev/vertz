import { useDialogStack } from '@vertz/ui';
import { Button } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function AlertDialogDemo() {
  const dialogs = useDialogStack();

  async function handleDelete() {
    const confirmed = await dialogs.confirm({
      title: 'Are you absolutely sure?',
      description:
        'This action cannot be undone. This will permanently delete your account and remove your data from our servers.',
      confirm: 'Continue',
      cancel: 'Cancel',
      intent: 'danger',
    });
    if (confirmed) {
      // handle delete
    }
  }

  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Confirmation</div>
        <Button intent="destructive" size="md" onClick={handleDelete}>
          Delete Account
        </Button>
      </div>
    </div>
  );
}
