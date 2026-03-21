import { Slider } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { sliderProps } from '../props/slider-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ width: '300px' }}>
          <Slider defaultValue={50} max={100} step={1} />
        </div>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Slider } from 'vertz/components';

<Slider defaultValue={50} max={100} step={1} />`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={sliderProps} />
    </>
  );
}
