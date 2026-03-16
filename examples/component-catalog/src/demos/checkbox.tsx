import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Checkbox } = themeComponents.primitives;

export function CheckboxDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div className={demoStyles.row}>
          <label style="display: flex; align-items: center; gap: 8px; color: var(--color-foreground)">
            <Checkbox />
            Accept terms and conditions
          </label>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Checked by default</div>
        <div className={demoStyles.row}>
          <label style="display: flex; align-items: center; gap: 8px; color: var(--color-foreground)">
            <Checkbox defaultChecked />
            Email notifications
          </label>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Disabled</div>
        <div className={demoStyles.row}>
          <label style="display: flex; align-items: center; gap: 8px; color: var(--color-muted-foreground); opacity: 0.5">
            <Checkbox disabled />
            Disabled option
          </label>
        </div>
      </div>
    </div>
  );
}
