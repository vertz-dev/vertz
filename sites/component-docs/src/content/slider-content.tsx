import { Slider } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { sliderProps } from '../props/slider-props';

export const description = 'An input for selecting a value from a range by dragging a handle.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ width: '300px' }}>
          <Slider defaultValue={50} max={100} step={1} />
        </div>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Slider } from '@vertz/ui/components';

<Slider defaultValue={50} max={100} step={1} />`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={sliderProps} />
    </>
  );
}
