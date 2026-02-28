import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { alertDialog } = themeComponents.primitives;

export function AlertDialogDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Confirmation dialog</div>
        {(() => {
          const ad = alertDialog({});
          ad.trigger.textContent = '';
          ad.trigger.append(Button({ intent: 'destructive', size: 'md', children: 'Delete Account' }));
          ad.title.textContent = 'Are you absolutely sure?';
          ad.description.textContent =
            'This action cannot be undone. This will permanently delete your account and remove your data from our servers.';
          ad.cancel.textContent = 'Cancel';
          ad.action.textContent = 'Continue';
          return ad.trigger;
        })()}
      </div>
    </div>
  );
}
