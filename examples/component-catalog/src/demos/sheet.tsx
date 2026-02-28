import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button, Label, Input } = themeComponents;
const { Sheet } = themeComponents.primitives;

export function SheetDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Right side (default)</div>
        <Sheet>
          <Sheet.Trigger>
            <Button intent="outline" size="md">Open Sheet</Button>
          </Sheet.Trigger>
          <Sheet.Content>
            <Sheet.Title>Edit profile</Sheet.Title>
            <Sheet.Description>Make changes to your profile here.</Sheet.Description>
            <div style="display: flex; flex-direction: column; gap: 1rem; padding: 1rem 0;">
              <div style="display: flex; flex-direction: column; gap: 0.375rem;">
                <Label for="sheet-name">Name</Label>
                <Input id="sheet-name" name="name" defaultValue="Pedro Duarte" />
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.375rem;">
                <Label for="sheet-username">Username</Label>
                <Input id="sheet-username" name="username" defaultValue="@peduarte" />
              </div>
            </div>
            <Button intent="primary" size="md">Save changes</Button>
          </Sheet.Content>
        </Sheet>
      </div>

      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Left side</div>
        <Sheet side="left">
          <Sheet.Trigger>
            <Button intent="outline" size="md">Open Left</Button>
          </Sheet.Trigger>
          <Sheet.Content>
            <Sheet.Title>Navigation</Sheet.Title>
            <p style="color: var(--color-muted-foreground); font-size: 14px;">
              This sheet slides in from the left.
            </p>
          </Sheet.Content>
        </Sheet>
      </div>
    </div>
  );
}
