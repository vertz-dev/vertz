import { Calendar } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function CalendarDemo() {
  let selectedDate: Date | null = null;

  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default (single select)</div>
        <Calendar
          mode="single"
          onValueChange={(date) => {
            selectedDate = date as Date | null;
          }}
        />
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-muted-foreground)' }}>
          {selectedDate ? `Selected: ${(selectedDate as Date).toLocaleDateString()}` : 'No date selected'}
        </p>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>With min/max date</div>
        <Calendar
          mode="single"
          minDate={new Date(2026, 2, 10)}
          maxDate={new Date(2026, 2, 25)}
          defaultMonth={new Date(2026, 2, 1)}
        />
      </div>
    </div>
  );
}
