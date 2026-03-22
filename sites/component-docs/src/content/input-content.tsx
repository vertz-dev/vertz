import { Input } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { inputProps } from '../props/input-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Input placeholder="Enter text..." />
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Input } from 'vertz/components';

<Input placeholder="Enter text..." />`}
        lang="tsx"
      />

      <DocH2>Examples</DocH2>

      <DocH3>Email</DocH3>
      <ComponentPreview>
        <Input type="email" placeholder="Email address" />
      </ComponentPreview>

      <DocH3>Password</DocH3>
      <ComponentPreview>
        <Input type="password" placeholder="Password" />
      </ComponentPreview>

      <DocH3>Disabled</DocH3>
      <ComponentPreview>
        <Input disabled placeholder="Disabled input" />
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={inputProps} />
    </>
  );
}
