import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Label, Input } = themeComponents;

export function LabelDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <Label>Email address</Label>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>With input</div>
        <div className={demoStyles.col}>
          <Label for="email">Email</Label>
          <Input name="email" placeholder="you@example.com" />
        </div>
      </div>
    </div>
  );
}
