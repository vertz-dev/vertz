import { Button, Card as CardSuite } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function CardDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Full card</div>
        <CardSuite.Card>
          <CardSuite.CardHeader>
            <CardSuite.CardTitle>Card Title</CardSuite.CardTitle>
            <CardSuite.CardDescription>Card description goes here.</CardSuite.CardDescription>
          </CardSuite.CardHeader>
          <CardSuite.CardContent>
            This is the card content area. You can put anything here.
          </CardSuite.CardContent>
          <CardSuite.CardFooter>
            <Button intent="outline" size="sm">
              Cancel
            </Button>
            <Button intent="primary" size="sm">
              Save
            </Button>
          </CardSuite.CardFooter>
        </CardSuite.Card>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Simple card</div>
        <CardSuite.Card>
          <CardSuite.CardContent>A simple card with only content.</CardSuite.CardContent>
        </CardSuite.Card>
      </div>
    </div>
  );
}
