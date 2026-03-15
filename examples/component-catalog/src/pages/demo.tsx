import type { ComponentEntry } from '../demos';
import { demoStyles } from '../styles/catalog';

export function DemoPage(entry: ComponentEntry) {
  return (
    <div>
      <div className={demoStyles.demoLabel}>{entry.name}</div>
      <div className={demoStyles.demoDescription}>{entry.description}</div>
      <div className={demoStyles.demoBox}>{entry.demo()}</div>
    </div>
  );
}
