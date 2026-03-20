import { Menubar } from '@vertz/ui/components';
import { demoStyles } from '../styles/catalog';

export function MenubarDemo() {
  return (
    <div className={demoStyles.col}>
      <div className={demoStyles.section}>
        <div className={demoStyles.sectionTitle}>Default</div>
        <Menubar>
          <Menubar.Menu value="file">
            <Menubar.Trigger>File</Menubar.Trigger>
            <Menubar.Content>
              <Menubar.Item value="new-tab">New Tab</Menubar.Item>
              <Menubar.Item value="new-window">New Window</Menubar.Item>
              <Menubar.Separator />
              <Menubar.Item value="share">Share</Menubar.Item>
              <Menubar.Separator />
              <Menubar.Item value="print">Print</Menubar.Item>
            </Menubar.Content>
          </Menubar.Menu>
          <Menubar.Menu value="edit">
            <Menubar.Trigger>Edit</Menubar.Trigger>
            <Menubar.Content>
              <Menubar.Item value="undo">Undo</Menubar.Item>
              <Menubar.Item value="redo">Redo</Menubar.Item>
              <Menubar.Separator />
              <Menubar.Group label="Selection">
                <Menubar.Item value="cut">Cut</Menubar.Item>
                <Menubar.Item value="copy">Copy</Menubar.Item>
                <Menubar.Item value="paste">Paste</Menubar.Item>
              </Menubar.Group>
            </Menubar.Content>
          </Menubar.Menu>
          <Menubar.Menu value="view">
            <Menubar.Trigger>View</Menubar.Trigger>
            <Menubar.Content>
              <Menubar.Label>Appearance</Menubar.Label>
              <Menubar.Separator />
              <Menubar.Item value="zoom-in">Zoom In</Menubar.Item>
              <Menubar.Item value="zoom-out">Zoom Out</Menubar.Item>
              <Menubar.Separator />
              <Menubar.Item value="fullscreen">Toggle Fullscreen</Menubar.Item>
            </Menubar.Content>
          </Menubar.Menu>
        </Menubar>
      </div>
    </div>
  );
}
