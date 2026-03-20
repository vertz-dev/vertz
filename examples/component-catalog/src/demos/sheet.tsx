import { Button, Input, Label, Sheet } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function SheetDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Right side (default)</div>
        <Sheet>
          <Sheet.Trigger>
            <Button intent="outline" size="md">
              Open Sheet
            </Button>
          </Sheet.Trigger>
          <Sheet.Content>
            <Sheet.Title>Edit profile</Sheet.Title>
            <Sheet.Description>Make changes to your profile here.</Sheet.Description>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <Label for="sheet-name">Name</Label>
                <Input id="sheet-name" name="name" defaultValue="Pedro Duarte" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <Label for="sheet-username">Username</Label>
                <Input id="sheet-username" name="username" defaultValue="@peduarte" />
              </div>
            </div>
            <Button intent="primary" size="md">
              Save changes
            </Button>
          </Sheet.Content>
        </Sheet>
      </div>

      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Left side</div>
        <Sheet side="left">
          <Sheet.Trigger>
            <Button intent="outline" size="md">
              Open Left
            </Button>
          </Sheet.Trigger>
          <Sheet.Content>
            <Sheet.Title>Navigation</Sheet.Title>
            <p style={{ color: 'var(--color-muted-foreground)', fontSize: '14px' }}>
              This sheet slides in from the left.
            </p>
          </Sheet.Content>
        </Sheet>
      </div>
    </div>
  );
}
