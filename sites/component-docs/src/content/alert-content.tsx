import { Alert } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { alertProps } from '../props/alert-props';

export const description = 'Displays a callout for important information.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Alert.Alert>
          <Alert.AlertTitle>Heads up!</Alert.AlertTitle>
          <Alert.AlertDescription>
            You can add components to your app using the CLI.
          </Alert.AlertDescription>
        </Alert.Alert>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Alert } from '@vertz/ui/components';

<Alert.Alert>
  <Alert.AlertTitle>Title</Alert.AlertTitle>
  <Alert.AlertDescription>Description</Alert.AlertDescription>
</Alert.Alert>`}
        </code>
      </CodeFence>

      <DocH2>Examples</DocH2>

      <DocH3>Destructive</DocH3>
      <ComponentPreview>
        <Alert.Alert variant="destructive">
          <Alert.AlertTitle>Error</Alert.AlertTitle>
          <Alert.AlertDescription>
            Your session has expired. Please log in again.
          </Alert.AlertDescription>
        </Alert.Alert>
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={alertProps} />
    </>
  );
}
