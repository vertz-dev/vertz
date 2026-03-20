import { HoverCard } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function HoverCardDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <HoverCard>
          <HoverCard.Trigger>
            <span
              style={{
                textDecoration: 'underline',
                cursor: 'pointer',
                color: 'var(--color-foreground)',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              @vertz
            </span>
          </HoverCard.Trigger>
          <HoverCard.Content>
            <div style={{ padding: '16px', width: '280px' }}>
              <h4
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  margin: '0 0 4px',
                  color: 'var(--color-foreground)',
                }}
              >
                Vertz Framework
              </h4>
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--color-muted-foreground)',
                  margin: '0 0 8px',
                }}
              >
                The full-stack TypeScript framework designed for LLM-first development.
              </p>
              <p style={{ fontSize: '12px', color: 'var(--color-muted-foreground)', margin: '0' }}>
                Joined December 2025
              </p>
            </div>
          </HoverCard.Content>
        </HoverCard>
      </div>
    </div>
  );
}
