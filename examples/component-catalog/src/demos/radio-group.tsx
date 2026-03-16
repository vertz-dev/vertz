import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { RadioGroup } = themeComponents.primitives;

export function RadioGroupDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Options</div>
        <RadioGroup defaultValue="comfortable">
          <RadioGroup.Item value="default">Default</RadioGroup.Item>
          <RadioGroup.Item value="comfortable">Comfortable</RadioGroup.Item>
          <RadioGroup.Item value="compact">Compact</RadioGroup.Item>
        </RadioGroup>
      </div>
    </div>
  );
}
