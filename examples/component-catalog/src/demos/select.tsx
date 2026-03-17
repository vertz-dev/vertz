import { Select } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function SelectDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Basic select</div>
        <div>
          <Select placeholder="Select a fruit...">
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="apple">Apple</Select.Item>
              <Select.Item value="banana">Banana</Select.Item>
              <Select.Item value="cherry">Cherry</Select.Item>
              <Select.Item value="grape">Grape</Select.Item>
            </Select.Content>
          </Select>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>With groups</div>
        <div>
          <Select placeholder="Select a food...">
            <Select.Trigger />
            <Select.Content>
              <Select.Group label="Fruits">
                <Select.Item value="apple">Apple</Select.Item>
                <Select.Item value="banana">Banana</Select.Item>
              </Select.Group>
              <Select.Separator />
              <Select.Group label="Vegetables">
                <Select.Item value="carrot">Carrot</Select.Item>
                <Select.Item value="broccoli">Broccoli</Select.Item>
              </Select.Group>
            </Select.Content>
          </Select>
        </div>
      </div>
    </div>
  );
}
