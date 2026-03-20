import { Input } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { PropsTable } from '../components/props-table';
import { inputProps } from '../props/input-props';

export const description = 'Displays an input field for user text entry.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Input placeholder="Enter text..." />
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
          {`import { Input } from '@vertz/ui/components';

<Input placeholder="Enter text..." />`}
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
        Email
      </h3>
      <ComponentPreview>
        <Input type="email" placeholder="Email address" />
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
        Password
      </h3>
      <ComponentPreview>
        <Input type="password" placeholder="Password" />
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
        <Input disabled placeholder="Disabled input" />
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
      <PropsTable props={inputProps} />
    </>
  );
}
