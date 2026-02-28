import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Alert: AlertSuite } = themeComponents;

export function AlertDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        <AlertSuite.Alert>
          <AlertSuite.AlertTitle>Heads up!</AlertSuite.AlertTitle>
          <AlertSuite.AlertDescription>
            You can add components to your app using the cli.
          </AlertSuite.AlertDescription>
        </AlertSuite.Alert>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Destructive</div>
        <AlertSuite.Alert variant="destructive">
          <AlertSuite.AlertTitle>Error</AlertSuite.AlertTitle>
          <AlertSuite.AlertDescription>
            Your session has expired. Please log in again.
          </AlertSuite.AlertDescription>
        </AlertSuite.Alert>
      </div>
    </div>
  );
}
