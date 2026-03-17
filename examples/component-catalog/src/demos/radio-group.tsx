import { RadioGroup } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

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
