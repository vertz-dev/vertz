import { Textarea } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function TextareaDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <Textarea />
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>With placeholder</div>
        <Textarea placeholder="Type your message here..." />
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Disabled</div>
        <Textarea placeholder="Disabled textarea" disabled />
      </div>
    </div>
  );
}
