import { Tabs } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2, DocParagraph } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { tabsContentProps, tabsProps, tabsTriggerProps } from '../props/tabs-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <Tabs defaultValue="account">
          <Tabs.List>
            <Tabs.Trigger value="account">Account</Tabs.Trigger>
            <Tabs.Trigger value="password">Password</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="account">
            <DocParagraph>Make changes to your account here.</DocParagraph>
          </Tabs.Content>
          <Tabs.Content value="password">
            <DocParagraph>Change your password here.</DocParagraph>
          </Tabs.Content>
        </Tabs>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Tabs } from '@vertz/ui/components';

<Tabs defaultValue="tab1">
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">Content 1</Tabs.Content>
  <Tabs.Content value="tab2">Content 2</Tabs.Content>
</Tabs>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={tabsProps} />

      <DocH2>Tabs.Trigger Props</DocH2>
      <PropsTable props={tabsTriggerProps} />

      <DocH2>Tabs.Content Props</DocH2>
      <PropsTable props={tabsContentProps} />
    </>
  );
}
