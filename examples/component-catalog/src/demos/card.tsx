import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Card: CardSuite, Button } = themeComponents;

export function CardDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Full card</div>
        {CardSuite.Card({
          children: [
            CardSuite.CardHeader({
              children: [
                CardSuite.CardTitle({ children: 'Card Title' }),
                CardSuite.CardDescription({ children: 'Card description goes here.' }),
              ] as any,
            }),
            CardSuite.CardContent({
              children: 'This is the card content area. You can put anything here.',
            }),
            CardSuite.CardFooter({
              children: [
                Button({ intent: 'outline', size: 'sm', children: 'Cancel' }),
                Button({ intent: 'primary', size: 'sm', children: 'Save' }),
              ] as any,
            }),
          ] as any,
        })}
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Simple card</div>
        {CardSuite.Card({
          children: CardSuite.CardContent({
            children: 'A simple card with only content.',
          }),
        })}
      </div>
    </div>
  );
}
