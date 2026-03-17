import { Toggle } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function ToggleDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div className={demoStyles.row}>
          <Toggle>Toggle</Toggle>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Pressed by default</div>
        <div className={demoStyles.row}>
          <Toggle defaultPressed>Active</Toggle>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Disabled</div>
        <div className={demoStyles.row}>
          <Toggle disabled>Disabled</Toggle>
        </div>
      </div>
    </div>
  );
}
