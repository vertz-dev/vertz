import { ToggleGroup } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function ToggleGroupDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Single selection</div>
        <div className={demoStyles.row}>
          <ToggleGroup type="single" defaultValue={['center']}>
            <ToggleGroup.Item value="left">Left</ToggleGroup.Item>
            <ToggleGroup.Item value="center">Center</ToggleGroup.Item>
            <ToggleGroup.Item value="right">Right</ToggleGroup.Item>
          </ToggleGroup>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Multiple selection</div>
        <div className={demoStyles.row}>
          <ToggleGroup type="multiple" defaultValue={['bold', 'italic']}>
            <ToggleGroup.Item value="bold">Bold</ToggleGroup.Item>
            <ToggleGroup.Item value="italic">Italic</ToggleGroup.Item>
            <ToggleGroup.Item value="underline">Underline</ToggleGroup.Item>
          </ToggleGroup>
        </div>
      </div>
    </div>
  );
}
