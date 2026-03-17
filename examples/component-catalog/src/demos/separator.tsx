import { Separator } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function SeparatorDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Horizontal separator</div>
        <p style="color: var(--color-foreground); margin-bottom: 8px">Content above</p>
        <Separator />
        <p style="color: var(--color-foreground); margin-top: 8px">Content below</p>
      </div>
    </div>
  );
}
