import { Button, Collapsible } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function CollapsibleDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div style="width: 100%; max-width: 24rem;">
          <Collapsible>
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0;">
              <span style="font-size: 14px; font-weight: 600; color: var(--color-foreground);">
                @peduarte starred 3 repositories
              </span>
              <Collapsible.Trigger>
                <Button intent="ghost" size="sm">
                  Toggle
                </Button>
              </Collapsible.Trigger>
            </div>
            <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.75rem 1rem; font-size: 14px; color: var(--color-foreground);">
              @vertz/ui
            </div>
            <Collapsible.Content>
              <div style="display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.5rem;">
                <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.75rem 1rem; font-size: 14px; color: var(--color-foreground);">
                  @vertz/server
                </div>
                <div style="border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.75rem 1rem; font-size: 14px; color: var(--color-foreground);">
                  @vertz/cli
                </div>
              </div>
            </Collapsible.Content>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
