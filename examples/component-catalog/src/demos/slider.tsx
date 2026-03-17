import { Slider } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function SliderDemo() {
  let steppedValue = 25;

  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <div style="width: 300px">
          <Slider defaultValue={50} />
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>With step (5) and value display</div>
        <div style="display: flex; align-items: center; gap: 12px; width: 300px">
          <Slider
            defaultValue={25}
            min={0}
            max={100}
            step={5}
            onValueChange={(val) => {
              steppedValue = val;
            }}
          />
          <span style="font-size: 0.875rem; color: var(--color-muted-foreground); min-width: 2ch; text-align: right;">
            {steppedValue}
          </span>
        </div>
      </div>
    </div>
  );
}
