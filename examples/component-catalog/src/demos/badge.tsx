import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Badge } = themeComponents;

export function BadgeDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Colors</div>
        <div className={demoStyles.row}>
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
