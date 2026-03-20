import { Textarea } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { PropsTable } from '../components/props-table';
import { textareaProps } from '../props/textarea-props';

export const description = 'Displays a multi-line text input field.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Textarea placeholder="Type your message here..." />
      </ComponentPreview>

      <h2
        style={{
          fontSize: '22px',
          fontWeight: '600',
          lineHeight: '1.3',
          color: 'var(--color-foreground)',
          margin: '32px 0 16px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        Installation
      </h2>
      <pre
        style={{
          margin: '0 0 16px',
          padding: '16px',
          fontSize: '13px',
          lineHeight: '1.5',
          overflow: 'auto',
          borderRadius: '8px',
          backgroundColor: 'var(--color-muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </pre>

      <h2
        style={{
          fontSize: '22px',
          fontWeight: '600',
          lineHeight: '1.3',
          color: 'var(--color-foreground)',
          margin: '32px 0 16px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        Usage
      </h2>
      <pre
        style={{
          margin: '0 0 16px',
          padding: '16px',
          fontSize: '13px',
          lineHeight: '1.5',
          overflow: 'auto',
          borderRadius: '8px',
          backgroundColor: 'var(--color-muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <code>
          {`import { Textarea } from '@vertz/ui/components';

<Textarea placeholder="Type your message..." />`}
        </code>
      </pre>

      <h2
        style={{
          fontSize: '22px',
          fontWeight: '600',
          lineHeight: '1.3',
          color: 'var(--color-foreground)',
          margin: '32px 0 16px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        Examples
      </h2>

      <h3
        style={{
          fontSize: '18px',
          fontWeight: '600',
          lineHeight: '1.4',
          color: 'var(--color-foreground)',
          margin: '24px 0 12px',
        }}
      >
        With Rows
      </h3>
      <ComponentPreview>
        <Textarea placeholder="With 6 rows" rows={6} />
      </ComponentPreview>

      <h3
        style={{
          fontSize: '18px',
          fontWeight: '600',
          lineHeight: '1.4',
          color: 'var(--color-foreground)',
          margin: '24px 0 12px',
        }}
      >
        Disabled
      </h3>
      <ComponentPreview>
        <Textarea disabled placeholder="Disabled textarea" />
      </ComponentPreview>

      <h2
        style={{
          fontSize: '22px',
          fontWeight: '600',
          lineHeight: '1.3',
          color: 'var(--color-foreground)',
          margin: '32px 0 16px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        API Reference
      </h2>
      <PropsTable props={textareaProps} />
    </>
  );
}
