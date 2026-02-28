import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { checkbox } = themeComponents.primitives;

export function CheckboxDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        <div class={demoStyles.row}>
          <label style="display: flex; align-items: center; gap: 8px; color: var(--color-foreground)">
            {checkbox({}).root}
            Accept terms and conditions
          </label>
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Checked by default</div>
        <div class={demoStyles.row}>
          <label style="display: flex; align-items: center; gap: 8px; color: var(--color-foreground)">
            {checkbox({ defaultChecked: true }).root}
            Email notifications
          </label>
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Disabled</div>
        <div class={demoStyles.row}>
          <label style="display: flex; align-items: center; gap: 8px; color: var(--color-muted-foreground); opacity: 0.5">
            {checkbox({ disabled: true }).root}
            Disabled option
          </label>
        </div>
      </div>
    </div>
  );
}
