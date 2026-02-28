import { demoStyles } from '../styles/catalog';
import { themeComponents } from '../styles/theme';

const { slider } = themeComponents.primitives;

export function SliderDemo() {
  // Default slider
  const defaultSlider = slider({ defaultValue: 50 });

  // Slider with value display and step snapping
  const valueLabel = document.createElement('span');
  valueLabel.textContent = '25';
  valueLabel.style.cssText = 'font-size: 0.875rem; color: var(--color-muted-foreground); min-width: 2ch; text-align: right;';

  const steppedSlider = slider({
    defaultValue: 25,
    min: 0,
    max: 100,
    step: 5,
    onValueChange: (val) => { valueLabel.textContent = String(val); },
  });

  return (
    <div class={demoStyles.col}>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>Default</div>
        <div style="width: 300px">
          {defaultSlider.root}
        </div>
      </div>
      <div class={demoStyles.section}>
        <div class={demoStyles.sectionTitle}>With step (5) and value display</div>
        <div style="display: flex; align-items: center; gap: 12px; width: 300px">
          {steppedSlider.root}
          {valueLabel}
        </div>
      </div>
    </div>
  );
}
