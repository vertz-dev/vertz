import type { ComponentEntry } from '../demos';
import { demoStyles } from '../styles/catalog';

export function DemoPage(entry: ComponentEntry) {
  return (
    <div>
      <div class={demoStyles.demoLabel}>{entry.name}</div>
      <div class={demoStyles.demoDescription}>{entry.description}</div>
      <div class={demoStyles.demoBox}>
        {entry.demo()}
      </div>
    </div>
  );
}
