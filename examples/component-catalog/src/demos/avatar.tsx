import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Avatar: AvatarSuite } = themeComponents;

export function AvatarDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With fallback</div>
        <div class={demoStyles.row}>
          <AvatarSuite.Avatar>
            <AvatarSuite.AvatarFallback>JD</AvatarSuite.AvatarFallback>
          </AvatarSuite.Avatar>
          <AvatarSuite.Avatar>
            <AvatarSuite.AvatarFallback>AB</AvatarSuite.AvatarFallback>
          </AvatarSuite.Avatar>
          <AvatarSuite.Avatar>
            <AvatarSuite.AvatarFallback>CN</AvatarSuite.AvatarFallback>
          </AvatarSuite.Avatar>
        </div>
      </div>
    </div>
  );
}
