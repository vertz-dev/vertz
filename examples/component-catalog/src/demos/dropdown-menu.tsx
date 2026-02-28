import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { DropdownMenu } = themeComponents.primitives;

export function DropdownMenuDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic menu</div>
        <DropdownMenu>
          <DropdownMenu.Trigger>
            <Button intent="outline" size="md">Open</Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Label>My Account</DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Group label="Account">
              <DropdownMenu.Item value="profile">Profile</DropdownMenu.Item>
              <DropdownMenu.Item value="billing">Billing</DropdownMenu.Item>
            </DropdownMenu.Group>
            <DropdownMenu.Separator />
            <DropdownMenu.Group label="Team">
              <DropdownMenu.Item value="team">Team</DropdownMenu.Item>
              <DropdownMenu.Item value="subscription">Subscription</DropdownMenu.Item>
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
    </div>
  );
}
