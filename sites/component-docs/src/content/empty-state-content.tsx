import { Button, EmptyState } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { emptyStateProps } from '../props/empty-state-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <EmptyState>
          <EmptyState.Icon>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </EmptyState.Icon>
          <EmptyState.Title>No messages</EmptyState.Title>
          <EmptyState.Description>
            Your inbox is empty. New messages will appear here.
          </EmptyState.Description>
          <EmptyState.Action>
            <Button intent="primary" size="sm">
              Compose
            </Button>
          </EmptyState.Action>
        </EmptyState>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Button, EmptyState } from 'vertz/components';

<EmptyState>
  <EmptyState.Icon><InboxIcon /></EmptyState.Icon>
  <EmptyState.Title>No messages</EmptyState.Title>
  <EmptyState.Description>Your inbox is empty.</EmptyState.Description>
  <EmptyState.Action>
    <Button intent="primary" size="sm">Compose</Button>
  </EmptyState.Action>
</EmptyState>`}
        </code>
      </CodeFence>

      <DocH2>Examples</DocH2>

      <DocH3>Minimal</DocH3>
      <ComponentPreview>
        <EmptyState>
          <EmptyState.Title>No results</EmptyState.Title>
          <EmptyState.Description>Try adjusting your search or filters.</EmptyState.Description>
        </EmptyState>
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={emptyStateProps} />
    </>
  );
}
