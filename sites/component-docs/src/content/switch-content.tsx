import { Label, Switch } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { switchProps } from '../props/switch-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Switch />
          <Label>Airplane Mode</Label>
        </div>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Switch, Label } from 'vertz/components';

<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
  <Switch />
  <Label>Airplane Mode</Label>
</div>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={switchProps} />
    </>
  );
}
