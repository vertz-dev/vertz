import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Label } = themeComponents;
const { switch: createSwitch } = themeComponents.primitives;

export function SwitchDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        <div class={demoStyles.row}>
          {createSwitch({}).root}
          <Label>Airplane mode</Label>
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Checked by default</div>
        <div class={demoStyles.row}>
          {createSwitch({ defaultChecked: true }).root}
          <Label>Dark mode</Label>
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Small size</div>
        <div class={demoStyles.row}>
          {createSwitch({ size: 'sm' } as any).root}
          <Label>Compact</Label>
        </div>
      </div>
    </div>
  );
}
