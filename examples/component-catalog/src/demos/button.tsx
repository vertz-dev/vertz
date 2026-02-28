import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;

export function ButtonDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Intents</div>
        <div class={demoStyles.row}>
          {Button({ intent: 'primary', size: 'md', children: 'Primary' })}
          {Button({ intent: 'secondary', size: 'md', children: 'Secondary' })}
          {Button({ intent: 'outline', size: 'md', children: 'Outline' })}
          {Button({ intent: 'ghost', size: 'md', children: 'Ghost' })}
          {Button({ intent: 'destructive', size: 'md', children: 'Destructive' })}
          {Button({ intent: 'link', size: 'md', children: 'Link' })}
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Sizes</div>
        <div class={demoStyles.row}>
          {Button({ intent: 'primary', size: 'sm', children: 'Small' })}
          {Button({ intent: 'primary', size: 'md', children: 'Medium' })}
          {Button({ intent: 'primary', size: 'lg', children: 'Large' })}
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Disabled</div>
        <div class={demoStyles.row}>
          {Button({ intent: 'primary', size: 'md', children: 'Disabled', disabled: true })}
          {Button({ intent: 'outline', size: 'md', children: 'Disabled', disabled: true })}
        </div>
      </div>
    </div>
  );
}
