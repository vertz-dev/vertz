import { Calendar } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function CalendarDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div>
          <Calendar />
        </div>
      </div>
    </div>
  );
}
