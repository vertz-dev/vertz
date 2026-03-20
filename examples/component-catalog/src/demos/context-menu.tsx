import { ContextMenu } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function ContextMenuDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Right-click to open</div>
        <ContextMenu>
          <ContextMenu.Trigger>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '10rem',
                width: '100%',
                maxWidth: '20rem',
                border: '2px dashed var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--color-muted-foreground)',
                fontSize: '14px',
              }}
            >
              Right click here
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Content>
            <ContextMenu.Label>Actions</ContextMenu.Label>
            <ContextMenu.Separator />
            <ContextMenu.Group label="Edit">
              <ContextMenu.Item value="cut">Cut</ContextMenu.Item>
              <ContextMenu.Item value="copy">Copy</ContextMenu.Item>
              <ContextMenu.Item value="paste">Paste</ContextMenu.Item>
            </ContextMenu.Group>
            <ContextMenu.Separator />
            <ContextMenu.Group label="View">
              <ContextMenu.Item value="reload">Reload</ContextMenu.Item>
              <ContextMenu.Item value="inspect">Inspect</ContextMenu.Item>
            </ContextMenu.Group>
          </ContextMenu.Content>
        </ContextMenu>
      </div>
    </div>
  );
}
