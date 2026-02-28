import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Avatar: AvatarSuite } = themeComponents;

export function AvatarDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With fallback</div>
        <div class={demoStyles.row}>
          {AvatarSuite.Avatar({
            children: AvatarSuite.AvatarFallback({ children: 'JD' }),
          })}
          {AvatarSuite.Avatar({
            children: AvatarSuite.AvatarFallback({ children: 'AB' }),
          })}
          {AvatarSuite.Avatar({
            children: AvatarSuite.AvatarFallback({ children: 'CN' }),
          })}
        </div>
      </div>
    </div>
  );
}
