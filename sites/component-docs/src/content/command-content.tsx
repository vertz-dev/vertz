import { Command } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { commandItemProps, commandProps } from '../props/command-props';

export const description = 'A command palette for fast, searchable actions.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Command placeholder="Type a command...">
          <Command.Input />
          <Command.List>
            <Command.Empty>No results found.</Command.Empty>
            <Command.Group label="Suggestions">
              <Command.Item value="calendar">Calendar</Command.Item>
              <Command.Item value="search">Search</Command.Item>
              <Command.Item value="settings">Settings</Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Command } from '@vertz/ui/components';

<Command placeholder="Type a command...">
  <Command.Input />
  <Command.List>
    <Command.Empty>No results found.</Command.Empty>
    <Command.Group label="Suggestions">
      <Command.Item value="calendar">Calendar</Command.Item>
      <Command.Item value="search">Search</Command.Item>
    </Command.Group>
  </Command.List>
</Command>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={commandProps} />

      <DocH2>Command.Item Props</DocH2>
      <PropsTable props={commandItemProps} />
    </>
  );
}
