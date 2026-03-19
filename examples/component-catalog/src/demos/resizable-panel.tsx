import { ResizablePanel } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function ResizablePanelDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Horizontal</div>
        <div style="height: 12rem; width: 100%; max-width: 36rem; border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden;">
          <ResizablePanel orientation="horizontal">
            <ResizablePanel.Panel defaultSize={50}>
              <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted-foreground); font-size: 14px;">
                Panel A
              </div>
            </ResizablePanel.Panel>
            <ResizablePanel.Handle />
            <ResizablePanel.Panel defaultSize={50}>
              <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted-foreground); font-size: 14px;">
                Panel B
              </div>
            </ResizablePanel.Panel>
          </ResizablePanel>
        </div>
      </div>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Vertical</div>
        <div style="height: 16rem; width: 100%; max-width: 36rem; border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden;">
          <ResizablePanel orientation="vertical">
            <ResizablePanel.Panel defaultSize={40}>
              <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted-foreground); font-size: 14px;">
                Top
              </div>
            </ResizablePanel.Panel>
            <ResizablePanel.Handle />
            <ResizablePanel.Panel defaultSize={60}>
              <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-muted-foreground); font-size: 14px;">
                Bottom
              </div>
            </ResizablePanel.Panel>
          </ResizablePanel>
        </div>
      </div>
    </div>
  );
}
