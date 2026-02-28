import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { sheet } = themeComponents.primitives;

export function SheetDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Sides</div>
        <div class={demoStyles.row}>
          {(() => {
            const s = sheet({ side: 'left' });
            s.trigger.textContent = '';
            s.trigger.append(Button({ intent: 'outline', size: 'sm', children: 'Left' }));
            s.title.textContent = 'Sheet Left';
            const desc = document.createElement('p');
            desc.textContent = 'This sheet slides in from the left.';
            s.content.append(s.title, desc);
            return s.trigger;
          })()}
          {(() => {
            const s = sheet({ side: 'right' });
            s.trigger.textContent = '';
            s.trigger.append(Button({ intent: 'outline', size: 'sm', children: 'Right' }));
            s.title.textContent = 'Sheet Right';
            const desc = document.createElement('p');
            desc.textContent = 'This sheet slides in from the right.';
            s.content.append(s.title, desc);
            return s.trigger;
          })()}
          {(() => {
            const s = sheet({ side: 'top' });
            s.trigger.textContent = '';
            s.trigger.append(Button({ intent: 'outline', size: 'sm', children: 'Top' }));
            s.title.textContent = 'Sheet Top';
            const desc = document.createElement('p');
            desc.textContent = 'This sheet slides in from the top.';
            s.content.append(s.title, desc);
            return s.trigger;
          })()}
          {(() => {
            const s = sheet({ side: 'bottom' });
            s.trigger.textContent = '';
            s.trigger.append(Button({ intent: 'outline', size: 'sm', children: 'Bottom' }));
            s.title.textContent = 'Sheet Bottom';
            const desc = document.createElement('p');
            desc.textContent = 'This sheet slides in from the bottom.';
            s.content.append(s.title, desc);
            return s.trigger;
          })()}
        </div>
      </div>
    </div>
  );
}
