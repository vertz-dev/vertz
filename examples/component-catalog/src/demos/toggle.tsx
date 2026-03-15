import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { toggle } = themeComponents.primitives;

export function ToggleDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div className={demoStyles.row}>{toggle()}</div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Pressed by default</div>
        <div className={demoStyles.row}>{toggle({ defaultPressed: true })}</div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Disabled</div>
        <div className={demoStyles.row}>{toggle({ disabled: true })}</div>
      </div>
    </div>
  );
}
