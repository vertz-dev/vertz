import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Badge } = themeComponents;

export function BadgeDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Colors</div>
        <div class={demoStyles.row}>
          <Badge color="gray">Gray</Badge>
          <Badge color="blue">Blue</Badge>
          <Badge color="green">Green</Badge>
          <Badge color="yellow">Yellow</Badge>
          <Badge color="red">Red</Badge>
        </div>
      </div>
    </div>
  );
}
