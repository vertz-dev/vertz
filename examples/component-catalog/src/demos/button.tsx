import { Button } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function ButtonDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Intents</div>
        <div className={demoStyles.row}>
          <Button intent="primary" size="md">
            Primary
          </Button>
          <Button intent="secondary" size="md">
            Secondary
          </Button>
          <Button intent="outline" size="md">
            Outline
          </Button>
          <Button intent="ghost" size="md">
            Ghost
          </Button>
          <Button intent="destructive" size="md">
            Destructive
          </Button>
          <Button intent="link" size="md">
            Link
          </Button>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Sizes</div>
        <div className={demoStyles.row}>
          <Button intent="primary" size="sm">
            Small
          </Button>
          <Button intent="primary" size="md">
            Medium
          </Button>
          <Button intent="primary" size="lg">
            Large
          </Button>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Disabled</div>
        <div className={demoStyles.row}>
          <Button intent="primary" size="md" disabled>
            Disabled
          </Button>
          <Button intent="outline" size="md" disabled>
            Disabled
          </Button>
        </div>
      </div>
    </div>
  );
}
