import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Skeleton: SkeletonSuite } = themeComponents;

export function SkeletonDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Card skeleton</div>
        <div class={demoStyles.col}>
          <div class={demoStyles.row}>
            {SkeletonSuite.Skeleton({ width: '40px', height: '40px' })}
            <div style="display: flex; flex-direction: column; gap: 4px; flex: 1">
              {SkeletonSuite.Skeleton({ width: '200px', height: '16px' })}
              {SkeletonSuite.Skeleton({ width: '150px', height: '16px' })}
            </div>
          </div>
          {SkeletonSuite.Skeleton({ width: '100%', height: '120px' })}
          {SkeletonSuite.Skeleton({ width: '80%', height: '16px' })}
        </div>
      </div>
    </div>
  );
}
