import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { accordion } = themeComponents.primitives;

export function AccordionDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        {(() => {
          const a = accordion({});
          const item1 = a.Item('item-1');
          item1.trigger.textContent = 'Is it accessible?';
          item1.content.textContent = 'Yes. It adheres to the WAI-ARIA design pattern.';
          const item2 = a.Item('item-2');
          item2.trigger.textContent = 'Is it styled?';
          item2.content.textContent = 'Yes. It comes with default styles via @vertz/theme-shadcn.';
          const item3 = a.Item('item-3');
          item3.trigger.textContent = 'Is it animated?';
          item3.content.textContent = 'Yes. Expand/collapse transitions are built in.';
          a.root.append(item1.item, item2.item, item3.item);
          return a.root;
        })()}
      </div>
    </div>
  );
}
