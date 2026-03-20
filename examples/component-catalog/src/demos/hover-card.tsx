import { HoverCard } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function HoverCardDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <HoverCard>
          <HoverCard.Trigger>
            <span style="text-decoration: underline; cursor: pointer; color: var(--color-foreground); font-size: 14px; font-weight: 500;">
              @vertz
            </span>
          </HoverCard.Trigger>
          <HoverCard.Content>
            <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: var(--color-foreground);">
              Vertz Framework
            </h4>
            <p style="font-size: 13px; color: var(--color-muted-foreground); margin: 0 0 8px;">
              The full-stack TypeScript framework designed for LLM-first development.
            </p>
            <p style="font-size: 12px; color: var(--color-muted-foreground); margin: 0;">
              Joined December 2025
            </p>
          </HoverCard.Content>
        </HoverCard>
      </div>
    </div>
  );
}
