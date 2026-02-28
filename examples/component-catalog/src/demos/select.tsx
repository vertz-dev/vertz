import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { select } = themeComponents.primitives;

export function SelectDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic select</div>
        <div>
          {(() => {
            const s = select({ placeholder: 'Select a fruit...' });
            s.Item('apple', 'Apple');
            s.Item('banana', 'Banana');
            s.Item('cherry', 'Cherry');
            s.Item('grape', 'Grape');
            return s.trigger;
          })()}
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With groups</div>
        <div>
          {(() => {
            const s = select({ placeholder: 'Select a food...' });
            const fruits = s.Group('Fruits');
            fruits.Item('apple', 'Apple');
            fruits.Item('banana', 'Banana');
            const veggies = s.Group('Vegetables');
            veggies.Item('carrot', 'Carrot');
            veggies.Item('broccoli', 'Broccoli');
            return s.trigger;
          })()}
        </div>
      </div>
    </div>
  );
}
