import { Button, Input, Label, Popover } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function PopoverDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Basic popover</div>
        <Popover>
          <Popover.Trigger>
            <Button intent="outline" size="md">
              Open popover
            </Button>
          </Popover.Trigger>
          <Popover.Content>
            <div style={{ padding: '16px', width: '280px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 4px' }}>Dimensions</h4>
              <p
                style={{
                  color: 'var(--color-muted-foreground)',
                  fontSize: '14px',
                  margin: '0 0 16px',
                }}
              >
                Set the dimensions for the layer.
              </p>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Label for="pop-width">Width</Label>
                  <Input id="pop-width" name="width" defaultValue="100%" />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Label for="pop-maxw">Max. width</Label>
                  <Input id="pop-maxw" name="maxWidth" defaultValue="300px" />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Label for="pop-height">Height</Label>
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
