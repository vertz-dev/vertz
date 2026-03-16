import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { Toast } = themeComponents.primitives;

export function ToastDemo() {
  const t = Toast({});

  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Trigger toast</div>
        <div className={demoStyles.row}>
          <Button
            intent="outline"
            size="md"
            onClick={() => {
              t.announce('Event has been created. You can undo this action.');
            }}
          >
            Show Toast
          </Button>
        </div>
      </div>
      {t.region}
    </div>
  );
}
