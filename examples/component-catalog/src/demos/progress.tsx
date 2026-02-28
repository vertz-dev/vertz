import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { progress } = themeComponents.primitives;

export function ProgressDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Progress bars</div>
        <div class={demoStyles.col}>
          <div>
            <span style="color: var(--color-muted-foreground); font-size: 12px">0%</span>
            {progress({ defaultValue: 0 }).root}
          </div>
          <div>
            <span style="color: var(--color-muted-foreground); font-size: 12px">33%</span>
            {progress({ defaultValue: 33 }).root}
          </div>
          <div>
            <span style="color: var(--color-muted-foreground); font-size: 12px">66%</span>
            {progress({ defaultValue: 66 }).root}
          </div>
          <div>
            <span style="color: var(--color-muted-foreground); font-size: 12px">100%</span>
            {progress({ defaultValue: 100 }).root}
          </div>
        </div>
      </div>
    </div>
  );
}
