import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Label, Input } = themeComponents;

export function LabelDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        <Label>Email address</Label>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With input</div>
        <div class={demoStyles.col}>
          <Label htmlFor="email">Email</Label>
          <Input name="email" placeholder="you@example.com" />
        </div>
      </div>
    </div>
  );
}
