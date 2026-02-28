import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Tabs } = themeComponents.primitives;

export function TabsDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default variant</div>
        <Tabs defaultValue="account">
          <Tabs.List>
            <Tabs.Trigger value="account">Account</Tabs.Trigger>
            <Tabs.Trigger value="password">Password</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="account">
            <p style="padding: 1rem; color: var(--color-muted-foreground); font-size: 14px;">
              Make changes to your account here.
            </p>
          </Tabs.Content>
          <Tabs.Content value="password">
            <p style="padding: 1rem; color: var(--color-muted-foreground); font-size: 14px;">
              Change your password here.
            </p>
          </Tabs.Content>
        </Tabs>
      </div>

      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Line variant</div>
        <Tabs defaultValue="overview" variant="line">
          <Tabs.List>
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="analytics">Analytics</Tabs.Trigger>
            <Tabs.Trigger value="reports">Reports</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="overview">
            <p style="padding: 1rem; color: var(--color-muted-foreground); font-size: 14px;">
              Overview content goes here.
            </p>
          </Tabs.Content>
          <Tabs.Content value="analytics">
            <p style="padding: 1rem; color: var(--color-muted-foreground); font-size: 14px;">
              Analytics content goes here.
            </p>
          </Tabs.Content>
          <Tabs.Content value="reports">
            <p style="padding: 1rem; color: var(--color-muted-foreground); font-size: 14px;">
              Reports content goes here.
            </p>
          </Tabs.Content>
        </Tabs>
      </div>
    </div>
  );
}
