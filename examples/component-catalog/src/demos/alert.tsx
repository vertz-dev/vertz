import { Alert as AlertSuite } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function AlertDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <AlertSuite.Alert>
          <AlertSuite.AlertTitle>Heads up!</AlertSuite.AlertTitle>
          <AlertSuite.AlertDescription>
            You can add components to your app using the cli.
          </AlertSuite.AlertDescription>
        </AlertSuite.Alert>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Destructive</div>
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
