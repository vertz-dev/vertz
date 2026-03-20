import { ScrollArea } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { scrollAreaProps } from '../props/scroll-area-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <ScrollArea>
          <div style={{ height: '200px', padding: '16px' }}>
            <p style={{ margin: '0 0 8px' }}>Scrollable content goes here.</p>
            <p style={{ margin: '0 0 8px' }}>Add enough content to trigger scrolling.</p>
            <p style={{ margin: '0 0 8px' }}>The scrollbar is custom-styled.</p>
            <p style={{ margin: '0 0 8px' }}>It works across all browsers.</p>
            <p style={{ margin: '0 0 8px' }}>Consistent look and feel.</p>
          </div>
        </ScrollArea>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { ScrollArea } from '@vertz/ui/components';

<ScrollArea>
  <div style={{ height: '200px' }}>
    Scrollable content here...
  </div>
</ScrollArea>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={scrollAreaProps} />
    </>
  );
}
