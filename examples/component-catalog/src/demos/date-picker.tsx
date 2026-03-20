import { Button, DatePicker } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function DatePickerDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div>
          <DatePicker>
            <DatePicker.Trigger>
              <Button intent="outline" size="md">
                Pick a date
              </Button>
            </DatePicker.Trigger>
            <DatePicker.Content />
          </DatePicker>
        </div>
      </div>
    </div>
  );
}
