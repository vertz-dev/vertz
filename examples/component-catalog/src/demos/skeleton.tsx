import { Skeleton } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function SkeletonDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Card skeleton</div>
        <div className={demoStyles.col}>
          <div className={demoStyles.row}>
            <Skeleton.Circle size="40px" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <Skeleton width="200px" height="16px" />
              <Skeleton width="150px" height="16px" />
            </div>
          </div>
          <Skeleton width="100%" height="120px" />
          <Skeleton width="80%" height="16px" />
        </div>
      </div>

      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Text skeleton</div>
        <Skeleton.Text />
      </div>

      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Circle skeleton</div>
        <div className={demoStyles.row}>
          <Skeleton.Circle />
          <Skeleton.Circle size="48px" />
          <Skeleton.Circle size="64px" />
        </div>
      </div>
    </div>
  );
}
