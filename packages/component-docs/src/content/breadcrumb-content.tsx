import { Breadcrumb } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { breadcrumbProps } from '../props/breadcrumb-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Breadcrumb>
          <Breadcrumb.Item href="/">Home</Breadcrumb.Item>
          <Breadcrumb.Item href="/components">Components</Breadcrumb.Item>
          <Breadcrumb.Item current>Breadcrumb</Breadcrumb.Item>
        </Breadcrumb>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Breadcrumb } from 'vertz/components';

<Breadcrumb>
  <Breadcrumb.Item href="/">Home</Breadcrumb.Item>
  <Breadcrumb.Item href="/settings">Settings</Breadcrumb.Item>
  <Breadcrumb.Item current>Profile</Breadcrumb.Item>
</Breadcrumb>`}
        lang="tsx"
      />

      <DocH2>Examples</DocH2>

      <DocH3>Custom Separator</DocH3>
      <ComponentPreview>
        <Breadcrumb separator=">">
          <Breadcrumb.Item href="/">Home</Breadcrumb.Item>
          <Breadcrumb.Item href="/products">Products</Breadcrumb.Item>
          <Breadcrumb.Item current>Widget</Breadcrumb.Item>
        </Breadcrumb>
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={breadcrumbProps} />
    </>
  );
}
