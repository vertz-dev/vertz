import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { dropdownMenu } = themeComponents.primitives;

export function DropdownMenuDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic menu</div>
        {(() => {
          const menu = dropdownMenu({});
          menu.trigger.textContent = '';
          menu.trigger.append(Button({ intent: 'outline', size: 'md', children: 'Open Menu' }));
          menu.Item('profile', 'Profile');
          menu.Item('settings', 'Settings');
          menu.Separator();
          menu.Item('logout', 'Log out');
          return menu.trigger;
        })()}
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With groups</div>
        {(() => {
          const menu = dropdownMenu({});
          menu.trigger.textContent = '';
          menu.trigger.append(Button({ intent: 'outline', size: 'md', children: 'Actions' }));
          const group1 = menu.Group('Account');
          group1.Item('profile', 'Profile');
          group1.Item('billing', 'Billing');
          menu.Separator();
          const group2 = menu.Group('Team');
          group2.Item('invite', 'Invite members');
          group2.Item('settings', 'Team settings');
          return menu.trigger;
        })()}
      </div>
    </div>
  );
}
