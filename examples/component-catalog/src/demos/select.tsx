import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Select } = themeComponents.primitives;

export function SelectDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Basic select</div>
        <div>
          <Select defaultValue="Select a fruit...">
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
          <Select defaultValue="Select a food...">
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
