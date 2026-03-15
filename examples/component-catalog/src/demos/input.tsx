import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Input } = themeComponents;

export function InputDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <Input />
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>With placeholder</div>
        <Input placeholder="Enter your email..." />
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Disabled</div>
        <Input placeholder="Disabled input" disabled />
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>With type</div>
        <div className={demoStyles.row}>
          <Input type="password" placeholder="Password" />
          <Input type="number" placeholder="0" />
        </div>
      </div>
    </div>
  );
}
