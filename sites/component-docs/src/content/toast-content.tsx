import { Button, Toast } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
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

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Toast } from '@vertz/ui/components';

const toast = Toast();
toast.announce('This is a toast notification.');`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={toastProps} />
    </>
  );
}
