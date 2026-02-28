import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { popover } = themeComponents.primitives;

export function PopoverDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic popover</div>
        {(() => {
          const p = popover({});
          p.trigger.textContent = '';
          p.trigger.append(Button({ intent: 'outline', size: 'md', children: 'Open Popover' }));
          p.content.style.cssText = 'padding: 16px; width: 200px';
          p.content.innerHTML =
            '<p style="color: var(--color-foreground); font-size: 14px; margin: 0">This is the popover content. Place any elements here.</p>';
          return p.trigger;
        })()}
      </div>
    </div>
  );
}
