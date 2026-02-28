import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Card: CardSuite, Button } = themeComponents;

export function CardDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Full card</div>
        <CardSuite.Card>
          <CardSuite.CardHeader>
            <CardSuite.CardTitle>Card Title</CardSuite.CardTitle>
            <CardSuite.CardDescription>Card description goes here.</CardSuite.CardDescription>
          </CardSuite.CardHeader>
          <CardSuite.CardContent>
            This is the card content area. You can put anything here.
          </CardSuite.CardContent>
          <CardSuite.CardFooter>
            <Button intent="outline" size="sm">Cancel</Button>
            <Button intent="primary" size="sm">Save</Button>
          </CardSuite.CardFooter>
        </CardSuite.Card>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Simple card</div>
        <CardSuite.Card>
          <CardSuite.CardContent>
            A simple card with only content.
          </CardSuite.CardContent>
        </CardSuite.Card>
      </div>
    </div>
  );
}
