import { Button, Card } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { cardProps } from '../props/card-props';

export const description = 'Displays a card with header, content, and footer.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Card.Card>
          <Card.CardHeader>
            <Card.CardTitle>Card Title</Card.CardTitle>
            <Card.CardDescription>Card Description</Card.CardDescription>
          </Card.CardHeader>
          <Card.CardContent>
            <p style={{ fontSize: '14px', color: 'var(--color-muted-foreground)', margin: '0' }}>
              Card content goes here.
            </p>
          </Card.CardContent>
          <Card.CardFooter>
            <Button intent="outline" size="sm">
              Cancel
            </Button>
            <Button size="sm">Save</Button>
          </Card.CardFooter>
        </Card.Card>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Card } from '@vertz/ui/components';

<Card.Card>
  <Card.CardHeader>
    <Card.CardTitle>Title</Card.CardTitle>
    <Card.CardDescription>Description</Card.CardDescription>
  </Card.CardHeader>
  <Card.CardContent>
    Content here
  </Card.CardContent>
  <Card.CardFooter>
    Footer actions
  </Card.CardFooter>
</Card.Card>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={cardProps} />
    </>
  );
}
