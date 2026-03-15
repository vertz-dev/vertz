import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { Tooltip } = themeComponents.primitives;

export function TooltipDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Basic tooltip</div>
        <div className={demoStyles.row}>
          <Tooltip>
            <Tooltip.Trigger>
              <Button intent="outline" size="md">
                Hover me
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p style="margin: 0;">Add to library</p>
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
