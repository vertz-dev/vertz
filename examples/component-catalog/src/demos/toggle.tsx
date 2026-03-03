import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { toggle } = themeComponents.primitives;

export function ToggleDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        <div class={demoStyles.row}>{toggle()}</div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Pressed by default</div>
        <div class={demoStyles.row}>{toggle({ defaultPressed: true })}</div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Disabled</div>
        <div class={demoStyles.row}>{toggle({ disabled: true })}</div>
      </div>
    </div>
  );
}
