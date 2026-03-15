import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Avatar: AvatarSuite } = themeComponents;

export function AvatarDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>With fallback</div>
        <div className={demoStyles.row}>
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
