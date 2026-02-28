import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;
const { toast } = themeComponents.primitives;

export function ToastDemo() {
  const t = toast({});

  // Append toast region to body so fixed positioning works correctly
  document.body.appendChild(t.region);

  const btn = Button({ intent: 'outline', size: 'md', children: 'Show Toast' });
  btn.addEventListener('click', () => {
    t.announce('Event has been created. You can undo this action.');
  });

  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Trigger toast</div>
        <div class={demoStyles.row}>
          {btn}
        </div>
      </div>
    </div>
  );
}
