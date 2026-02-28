import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { tabs } = themeComponents.primitives;

export function TabsDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        {(() => {
          const t = tabs({ defaultValue: 'account' });
          const tab1 = t.Tab('account', 'Account');
          const tab2 = t.Tab('password', 'Password');
          const tab3 = t.Tab('settings', 'Settings');
          tab1.panel.textContent = 'Manage your account settings and preferences.';
          tab1.panel.style.cssText = 'padding: 16px; color: var(--color-foreground)';
          tab2.panel.textContent = 'Change your password here.';
          tab2.panel.style.cssText = 'padding: 16px; color: var(--color-foreground)';
          tab3.panel.textContent = 'Configure your application settings.';
          tab3.panel.style.cssText = 'padding: 16px; color: var(--color-foreground)';
          t.list.append(tab1.trigger, tab2.trigger, tab3.trigger);
          t.root.append(t.list, tab1.panel, tab2.panel, tab3.panel);
          return t.root;
        })()}
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Line variant</div>
        {(() => {
          const t = tabs({ defaultValue: 'overview', variant: 'line' });
          const tab1 = t.Tab('overview', 'Overview');
          const tab2 = t.Tab('analytics', 'Analytics');
          tab1.panel.textContent = 'Overview content goes here.';
          tab1.panel.style.cssText = 'padding: 16px; color: var(--color-foreground)';
          tab2.panel.textContent = 'Analytics dashboard content.';
          tab2.panel.style.cssText = 'padding: 16px; color: var(--color-foreground)';
          t.list.append(tab1.trigger, tab2.trigger);
          t.root.append(t.list, tab1.panel, tab2.panel);
          return t.root;
        })()}
      </div>
    </div>
  );
}
