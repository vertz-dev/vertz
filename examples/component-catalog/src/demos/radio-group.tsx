import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { radioGroup } = themeComponents.primitives;

export function RadioGroupDemo() {
  const radio = radioGroup({ name: 'plan', defaultValue: 'comfortable' });
  radio.Item('default', 'Default');
  radio.Item('comfortable', 'Comfortable');
  radio.Item('compact', 'Compact');

  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Options</div>
        {radio.root}
      </div>
    </div>
  );
}
