import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Input } = themeComponents;

export function InputDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        <Input />
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With placeholder</div>
        <Input placeholder="Enter your email..." />
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Disabled</div>
        <Input placeholder="Disabled input" disabled />
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With type</div>
        <div class={demoStyles.row}>
          <Input type="password" placeholder="Password" />
          <Input type="number" placeholder="0" />
        </div>
      </div>
    </div>
  );
}
