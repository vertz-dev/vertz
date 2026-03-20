import { Button } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { PropsTable } from '../components/props-table';
import { buttonProps } from '../props/button-props';

export const description = 'Displays a button or a component that looks like a button.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Button intent="primary" size="md">
          Click me
        </Button>
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
          {`import { Button } from '@vertz/ui/components';

<Button intent="primary">Click me</Button>`}
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
        Secondary
      </h3>
      <ComponentPreview>
        <Button intent="secondary">Secondary</Button>
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
        Destructive
      </h3>
      <ComponentPreview>
        <Button intent="destructive">Destructive</Button>
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
        Outline
      </h3>
      <ComponentPreview>
        <Button intent="outline">Outline</Button>
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
        Ghost
      </h3>
      <ComponentPreview>
        <Button intent="ghost">Ghost</Button>
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
        Link
      </h3>
      <ComponentPreview>
        <Button intent="link">Link</Button>
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
        Sizes
      </h3>
      <ComponentPreview>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
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
        <Button disabled>Disabled</Button>
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
      <PropsTable props={buttonProps} />
    </>
  );
}
