import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { dialog } = themeComponents.primitives;

export function DialogDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic dialog</div>
        {(() => {
          const d = dialog({});
          d.trigger.textContent = '';
          d.trigger.append(Button({ intent: 'outline', size: 'md', children: 'Open Dialog' }));
          d.title.textContent = 'Edit Profile';
          const desc = document.createElement('p');
          desc.textContent = 'Make changes to your profile here. Click save when done.';
          desc.style.cssText = 'color: var(--color-muted-foreground); font-size: 14px; margin-top: 8px';
          d.content.append(d.title, desc);
          return d.trigger;
        })()}
      </div>
    </div>
  );
}
