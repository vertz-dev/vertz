import { NavigationMenu } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { navigationMenuItemProps, navigationMenuProps } from '../props/navigation-menu-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <NavigationMenu>
          <NavigationMenu.List>
            <NavigationMenu.Item value="getting-started">
              <NavigationMenu.Trigger>Getting Started</NavigationMenu.Trigger>
              <NavigationMenu.Content>
                <NavigationMenu.Link href="/docs">Documentation</NavigationMenu.Link>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
            <NavigationMenu.Item value="components">
              <NavigationMenu.Link href="/components">Components</NavigationMenu.Link>
            </NavigationMenu.Item>
          </NavigationMenu.List>
          <NavigationMenu.Viewport />
        </NavigationMenu>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { NavigationMenu } from 'vertz/components';

<NavigationMenu>
  <NavigationMenu.List>
    <NavigationMenu.Item value="docs">
      <NavigationMenu.Link href="/docs">Documentation</NavigationMenu.Link>
    </NavigationMenu.Item>
    <NavigationMenu.Item value="components">
      <NavigationMenu.Trigger>Components</NavigationMenu.Trigger>
      <NavigationMenu.Content>
        <NavigationMenu.Link href="/components/button">Button</NavigationMenu.Link>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  </NavigationMenu.List>
  <NavigationMenu.Viewport />
</NavigationMenu>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={navigationMenuProps} />

      <DocH2>NavigationMenu.Item Props</DocH2>
      <PropsTable props={navigationMenuItemProps} />
    </>
  );
}
