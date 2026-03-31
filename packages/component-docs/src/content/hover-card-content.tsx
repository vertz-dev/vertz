import { HoverCard } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { hoverCardProps } from '../props/hover-card-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <HoverCard>
          <HoverCard.Trigger>
            <span
              style={{
                textDecoration: 'underline',
                cursor: 'pointer',
                color: 'var(--color-primary)',
              }}
            >
              Hover over me
            </span>
          </HoverCard.Trigger>
          <HoverCard.Content>
            <div style={{ padding: '8px' }}>
              <p style={{ margin: '0', fontSize: '14px' }}>
                This is a preview card that appears on hover.
              </p>
            </div>
          </HoverCard.Content>
        </HoverCard>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { HoverCard } from 'vertz/components';

<HoverCard>
  <HoverCard.Trigger>
    <span>Hover over me</span>
  </HoverCard.Trigger>
  <HoverCard.Content>
    Preview content here
  </HoverCard.Content>
</HoverCard>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={hoverCardProps} />
    </>
  );
}
