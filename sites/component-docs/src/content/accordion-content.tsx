import { Accordion } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { accordionItemProps, accordionProps } from '../props/accordion-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ width: '100%', maxWidth: '500px' }}>
          <Accordion type="single" defaultValue={['item-1']}>
            <Accordion.Item value="item-1">
              <Accordion.Trigger>Is it accessible?</Accordion.Trigger>
              <Accordion.Content>Yes. It adheres to the WAI-ARIA design pattern.</Accordion.Content>
            </Accordion.Item>
            <Accordion.Item value="item-2">
              <Accordion.Trigger>Is it styled?</Accordion.Trigger>
              <Accordion.Content>
                Yes. It comes with default styles that match the theme.
              </Accordion.Content>
            </Accordion.Item>
            <Accordion.Item value="item-3">
              <Accordion.Trigger>Is it animated?</Accordion.Trigger>
              <Accordion.Content>
                Yes. It uses smooth height transitions for expand/collapse.
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
        </div>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Accordion } from 'vertz/components';

<Accordion type="single" defaultValue={['item-1']}>
  <Accordion.Item value="item-1">
    <Accordion.Trigger>Section 1</Accordion.Trigger>
    <Accordion.Content>Content 1</Accordion.Content>
  </Accordion.Item>
  <Accordion.Item value="item-2">
    <Accordion.Trigger>Section 2</Accordion.Trigger>
    <Accordion.Content>Content 2</Accordion.Content>
  </Accordion.Item>
</Accordion>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={accordionProps} />

      <DocH2>Accordion.Item Props</DocH2>
      <PropsTable props={accordionItemProps} />
    </>
  );
}
