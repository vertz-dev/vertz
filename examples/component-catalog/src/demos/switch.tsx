import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Label } = themeComponents;
const { Switch } = themeComponents.primitives;

export function SwitchDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div className={demoStyles.row}>
          <Switch />
          <Label>Airplane mode</Label>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Checked by default</div>
        <div className={demoStyles.row}>
          <Switch defaultChecked />
          <Label>Dark mode</Label>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Small size</div>
        <div className={demoStyles.row}>
          <Switch size="sm" />
          <Label>Compact</Label>
        </div>
      </div>
    </div>
  );
}
