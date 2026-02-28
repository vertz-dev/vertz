import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Badge } = themeComponents;

export function BadgeDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Colors</div>
        <div class={demoStyles.row}>
          {Badge({ color: 'gray', children: 'Gray' })}
          {Badge({ color: 'blue', children: 'Blue' })}
          {Badge({ color: 'green', children: 'Green' })}
          {Badge({ color: 'yellow', children: 'Yellow' })}
          {Badge({ color: 'red', children: 'Red' })}
        </div>
      </div>
    </div>
  );
}
