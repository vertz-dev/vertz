import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { toast } = themeComponents.primitives;

export function ToastDemo() {
  const t = toast({});

  // Append toast region to body so fixed positioning works correctly
  document.body.appendChild(t.region);

  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Trigger toast</div>
        <div class={demoStyles.row}>
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
    </div>
  );
}
