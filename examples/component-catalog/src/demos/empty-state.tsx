import { Button, EmptyState } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function EmptyStateDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Full</div>
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
      </div>

      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Minimal</div>
        <EmptyState>
          <EmptyState.Title>No results</EmptyState.Title>
          <EmptyState.Description>Try adjusting your search or filters.</EmptyState.Description>
        </EmptyState>
      </div>
    </div>
  );
}
