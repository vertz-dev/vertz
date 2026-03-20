import { Badge } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { badgeProps } from '../props/badge-props';

export const description = 'Displays a badge or a component that looks like a badge.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Badge>Badge</Badge>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Badge } from '@vertz/ui/components';

<Badge>Badge</Badge>`}
        </code>
      </CodeFence>

      <DocH2>Examples</DocH2>

      <DocH3>Colors</DocH3>
      <ComponentPreview>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Badge color="gray">Gray</Badge>
          <Badge color="blue">Blue</Badge>
          <Badge color="green">Green</Badge>
          <Badge color="yellow">Yellow</Badge>
          <Badge color="red">Red</Badge>
        </div>
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={badgeProps} />
    </>
  );
}
