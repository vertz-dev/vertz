import { Progress } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function ProgressDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Progress bars</div>
        <div className={demoStyles.col}>
          <div>
            <span style="color: var(--color-muted-foreground); font-size: 12px">0%</span>
            <Progress defaultValue={0} />
          </div>
          <div>
            <span style="color: var(--color-muted-foreground); font-size: 12px">33%</span>
            <Progress defaultValue={33} />
          </div>
          <div>
            <span style="color: var(--color-muted-foreground); font-size: 12px">66%</span>
            <Progress defaultValue={66} />
          </div>
          <div>
            <span style="color: var(--color-muted-foreground); font-size: 12px">100%</span>
            <Progress defaultValue={100} />
          </div>
        </div>
      </div>
    </div>
  );
}
