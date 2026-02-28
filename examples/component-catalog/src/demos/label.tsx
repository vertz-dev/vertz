import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Label, Input } = themeComponents;

export function LabelDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        {Label({ children: 'Email address' })}
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With input</div>
        <div class={demoStyles.col}>
          {Label({ for: 'email', children: 'Email' })}
          {Input({ name: 'email', placeholder: 'you@example.com' })}
        </div>
      </div>
    </div>
  );
}
