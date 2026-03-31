import { Button, Drawer } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { drawerProps } from '../props/drawer-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Drawer>
          <Drawer.Trigger>
            <Button intent="outline">Open Drawer</Button>
          </Drawer.Trigger>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Handle />
              <Drawer.Title>Drawer Title</Drawer.Title>
              <Drawer.Description>Drawer description goes here.</Drawer.Description>
            </Drawer.Header>
            <Drawer.Footer>
              <Button>Submit</Button>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Drawer, Button } from 'vertz/components';

<Drawer>
  <Drawer.Trigger>
    <Button>Open Drawer</Button>
  </Drawer.Trigger>
  <Drawer.Content>
    <Drawer.Header>
      <Drawer.Handle />
      <Drawer.Title>Title</Drawer.Title>
      <Drawer.Description>Description</Drawer.Description>
    </Drawer.Header>
    <Drawer.Footer>
      <Button>Submit</Button>
    </Drawer.Footer>
  </Drawer.Content>
</Drawer>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={drawerProps} />
    </>
  );
}
