import { Button, Drawer } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function DrawerDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <Drawer>
          <Drawer.Trigger>
            <Button intent="outline" size="md">
              Open Drawer
            </Button>
          </Drawer.Trigger>
          <Drawer.Content>
            <Drawer.Handle />
            <Drawer.Header>
              <Drawer.Title>Move goal</Drawer.Title>
              <Drawer.Description>Set your daily activity goal.</Drawer.Description>
            </Drawer.Header>
            <div style={{ padding: '1rem' }}>
              <p style={{ color: 'var(--color-muted-foreground)', fontSize: '14px' }}>
                Drag the handle or use the buttons to adjust your goal.
              </p>
            </div>
            <Drawer.Footer>
              <Button intent="outline" size="md">
                Cancel
              </Button>
              <Button intent="primary" size="md">
                Submit
              </Button>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer>
      </div>
    </div>
  );
}
