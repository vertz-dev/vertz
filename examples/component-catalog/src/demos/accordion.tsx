import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Accordion } = themeComponents.primitives;

export function AccordionDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        <div style="width: 100%; max-width: 28rem;">
          <Accordion>
            <Accordion.Item value="item-1">
              <Accordion.Trigger>Is it accessible?</Accordion.Trigger>
              <Accordion.Content>
                Yes. It adheres to the WAI-ARIA design pattern.
              </Accordion.Content>
            </Accordion.Item>
            <Accordion.Item value="item-2">
              <Accordion.Trigger>Is it styled?</Accordion.Trigger>
              <Accordion.Content>
                Yes. It comes with default styles that match the other components' aesthetic.
              </Accordion.Content>
            </Accordion.Item>
            <Accordion.Item value="item-3">
              <Accordion.Trigger>Is it animated?</Accordion.Trigger>
              <Accordion.Content>
                Yes. It's animated by default, but you can disable it if you prefer.
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
        </div>
      </div>
    </div>
  );
}
