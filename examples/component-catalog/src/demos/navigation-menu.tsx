import { NavigationMenu } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function NavigationMenuDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <NavigationMenu>
          <NavigationMenu.List>
            <NavigationMenu.Item value="getting-started">
              <NavigationMenu.Trigger>Getting Started</NavigationMenu.Trigger>
              <NavigationMenu.Content>
                <div style={{ padding: '1rem', width: '24rem' }}>
                  <p style={{ fontSize: '14px', color: 'var(--color-muted-foreground)' }}>
                    Re-usable components built with Vertz UI and Shadcn theming.
                  </p>
                </div>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
            <NavigationMenu.Item value="components">
              <NavigationMenu.Trigger>Components</NavigationMenu.Trigger>
              <NavigationMenu.Content>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.75rem',
                    padding: '1rem',
                    width: '28rem',
                  }}
                >
                  <NavigationMenu.Link href="/button">Button</NavigationMenu.Link>
                  <NavigationMenu.Link href="/dialog">Dialog</NavigationMenu.Link>
                  <NavigationMenu.Link href="/tabs">Tabs</NavigationMenu.Link>
                  <NavigationMenu.Link href="/select">Select</NavigationMenu.Link>
                </div>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
            <NavigationMenu.Item value="docs">
              <NavigationMenu.Link href="https://github.com/vertz-dev/vertz">
                Documentation
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          </NavigationMenu.List>
          <NavigationMenu.Viewport />
        </NavigationMenu>
      </div>
    </div>
  );
}
