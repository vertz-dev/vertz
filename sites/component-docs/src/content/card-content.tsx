import { Button, Card } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { cardProps } from '../props/card-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Card>
          <Card.Header>
            <Card.Title>Card Title</Card.Title>
            <Card.Description>Card Description</Card.Description>
          </Card.Header>
          <Card.Content>
            <p style={{ fontSize: '14px', color: 'var(--color-muted-foreground)', margin: '0' }}>
              Card content goes here.
            </p>
          </Card.Content>
          <Card.Footer>
            <Button intent="outline" size="sm">
              Cancel
            </Button>
            <Button size="sm">Save</Button>
          </Card.Footer>
        </Card>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Card } from 'vertz/components';

<Card>
  <Card.Header>
    <Card.Title>Title</Card.Title>
    <Card.Description>Description</Card.Description>
  </Card.Header>
  <Card.Content>
    Content here
  </Card.Content>
  <Card.Footer>
    Footer actions
  </Card.Footer>
</Card>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={cardProps} />
    </>
  );
}
