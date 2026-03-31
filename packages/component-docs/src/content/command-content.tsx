import { Command } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { commandItemProps, commandProps } from '../props/command-props';
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
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Command } from 'vertz/components';

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
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={commandProps} />

      <DocH2>Command.Item Props</DocH2>
      <PropsTable props={commandItemProps} />
    </>
  );
}
