import { Breadcrumb } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { breadcrumbProps } from '../props/breadcrumb-props';

export const description = 'Displays the path to the current resource using a hierarchy of links.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Components', href: '/components' },
            { label: 'Breadcrumb' },
          ]}
        />
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Breadcrumb } from '@vertz/ui/components';

<Breadcrumb
  items={[
    { label: 'Home', href: '/' },
    { label: 'Settings', href: '/settings' },
    { label: 'Profile' },
  ]}
/>`}
        </code>
      </CodeFence>

      <DocH2>Examples</DocH2>

      <DocH3>Custom Separator</DocH3>
      <ComponentPreview>
        <Breadcrumb
          separator=">"
          items={[
            { label: 'Home', href: '/' },
            { label: 'Products', href: '/products' },
            { label: 'Widget' },
          ]}
        />
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={breadcrumbProps} />
    </>
  );
}
