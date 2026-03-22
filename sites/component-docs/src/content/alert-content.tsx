import { Alert } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { alertProps } from '../props/alert-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Alert>
          <Alert.Title>Heads up!</Alert.Title>
          <Alert.Description>You can add components to your app using the CLI.</Alert.Description>
        </Alert>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Alert } from 'vertz/components';

<Alert>
  <Alert.Title>Title</Alert.Title>
  <Alert.Description>Description</Alert.Description>
</Alert>`}
        lang="tsx"
      />

      <DocH2>Examples</DocH2>

      <DocH3>Destructive</DocH3>
      <ComponentPreview>
        <Alert variant="destructive">
          <Alert.Title>Error</Alert.Title>
          <Alert.Description>Your session has expired. Please log in again.</Alert.Description>
        </Alert>
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={alertProps} />
    </>
  );
}
