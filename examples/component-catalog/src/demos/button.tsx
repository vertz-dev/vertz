import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button } = themeComponents;

export function ButtonDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Intents</div>
        <div class={demoStyles.row}>
          <Button intent="primary" size="md">Primary</Button>
          <Button intent="secondary" size="md">Secondary</Button>
          <Button intent="outline" size="md">Outline</Button>
          <Button intent="ghost" size="md">Ghost</Button>
          <Button intent="destructive" size="md">Destructive</Button>
          <Button intent="link" size="md">Link</Button>
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Sizes</div>
        <div class={demoStyles.row}>
          <Button intent="primary" size="sm">Small</Button>
          <Button intent="primary" size="md">Medium</Button>
          <Button intent="primary" size="lg">Large</Button>
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Disabled</div>
        <div class={demoStyles.row}>
          <Button intent="primary" size="md" disabled>Disabled</Button>
          <Button intent="outline" size="md" disabled>Disabled</Button>
        </div>
      </div>
    </div>
  );
}
