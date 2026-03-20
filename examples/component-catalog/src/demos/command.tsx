import { Command } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function CommandDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div
          style={{
            width: '100%',
            maxWidth: '28rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <Command placeholder="Type a command or search...">
            <Command.Input />
            <Command.List>
              <Command.Empty>No results found.</Command.Empty>
              <Command.Group label="Suggestions">
                <Command.Item value="calendar">Calendar</Command.Item>
                <Command.Item value="search">Search</Command.Item>
                <Command.Item value="calculator">Calculator</Command.Item>
              </Command.Group>
              <Command.Separator />
              <Command.Group label="Settings">
                <Command.Item value="profile">Profile</Command.Item>
                <Command.Item value="billing">Billing</Command.Item>
                <Command.Item value="preferences">Preferences</Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      </div>
    </div>
  );
}
