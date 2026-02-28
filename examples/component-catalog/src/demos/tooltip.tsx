import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { tooltip } = themeComponents.primitives;

export function TooltipDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic tooltip</div>
        <div class={demoStyles.row}>
          {(() => {
            const t = tooltip({ content: 'Add to library' });
            t.trigger.textContent = '';
            t.trigger.append(Button({ intent: 'outline', size: 'md', children: 'Hover me' }));
            return t.trigger;
          })()}
        </div>
      </div>
    </div>
  );
}
