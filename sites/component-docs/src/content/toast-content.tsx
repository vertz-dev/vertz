import { Button, Toast } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { toastProps } from '../props/toast-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Button
          intent="outline"
          onClick={() => {
            const toast = Toast();
            toast.announce('This is a toast notification.');
          }}
        >
          Show Toast
        </Button>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Toast } from 'vertz/components';

const toast = Toast();
toast.announce('This is a toast notification.');`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={toastProps} />
    </>
  );
}
