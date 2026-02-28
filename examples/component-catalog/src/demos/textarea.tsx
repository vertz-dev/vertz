import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Textarea } = themeComponents;

export function TextareaDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        {Textarea({})}
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With placeholder</div>
        {Textarea({ placeholder: 'Type your message here...' })}
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Disabled</div>
        {Textarea({ placeholder: 'Disabled textarea', disabled: true })}
      </div>
    </div>
  );
}
