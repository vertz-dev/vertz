import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Alert: AlertSuite } = themeComponents;

export function AlertDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        {AlertSuite.Alert({
          children: [
            AlertSuite.AlertTitle({ children: 'Heads up!' }),
            AlertSuite.AlertDescription({
              children: 'You can add components to your app using the cli.',
            }),
          ] as any,
        })}
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Destructive</div>
        {AlertSuite.Alert({
          variant: 'destructive',
          children: [
            AlertSuite.AlertTitle({ children: 'Error' }),
            AlertSuite.AlertDescription({
              children: 'Your session has expired. Please log in again.',
            }),
          ] as any,
        })}
      </div>
    </div>
  );
}
