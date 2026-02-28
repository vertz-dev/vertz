import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { Button, Input, Label } = themeComponents;
const { Popover } = themeComponents.primitives;

export function PopoverDemo() {
  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Basic popover</div>
        <Popover>
          <Popover.Trigger>
            <Button intent="outline" size="md">Open popover</Button>
          </Popover.Trigger>
          <Popover.Content>
            <div style="padding: 16px; width: 280px;">
              <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 4px;">Dimensions</h4>
              <p style="color: var(--color-muted-foreground); font-size: 14px; margin: 0 0 16px;">
                Set the dimensions for the layer.
              </p>
              <div style="display: grid; gap: 8px;">
                <div style="display: grid; grid-template-columns: 80px 1fr; align-items: center; gap: 8px;">
                  <Label htmlFor="pop-width">Width</Label>
                  <Input id="pop-width" name="width" defaultValue="100%" />
                </div>
                <div style="display: grid; grid-template-columns: 80px 1fr; align-items: center; gap: 8px;">
                  <Label htmlFor="pop-maxw">Max. width</Label>
                  <Input id="pop-maxw" name="maxWidth" defaultValue="300px" />
                </div>
                <div style="display: grid; grid-template-columns: 80px 1fr; align-items: center; gap: 8px;">
                  <Label htmlFor="pop-height">Height</Label>
                  <Input id="pop-height" name="height" defaultValue="25px" />
                </div>
              </div>
            </div>
          </Popover.Content>
        </Popover>
      </div>
    </div>
  );
}
