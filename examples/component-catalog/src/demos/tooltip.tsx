import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { Tooltip } = themeComponents.primitives;

export function TooltipDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic tooltip</div>
        <div class={demoStyles.row}>
          <Tooltip>
            <Tooltip.Trigger>
              <Button intent="outline" size="md">Hover me</Button>
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
