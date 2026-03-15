import { describe, expect, it } from 'bun:test';
import { ComposedDialog } from '../../dialog/dialog-composed';
import { withStyles } from '../with-styles';

describe('withStyles', () => {
  describe('Given withStyles(Dialog, classes)', () => {
    describe('When used as a component', () => {
      it('Then pre-applies classes without requiring classes prop', () => {
        const triggerBtn = document.createElement('button');
        triggerBtn.textContent = 'Open';

        const StyledDialog = withStyles(ComposedDialog, {
          overlay: 'styled-overlay',
          content: 'styled-content',
          close: 'styled-close',
          header: 'styled-header',
          title: 'styled-title',
          description: 'styled-description',
          footer: 'styled-footer',
        });

        const root = StyledDialog({
          children: () => {
            const triggerEl = StyledDialog.Trigger({ children: [triggerBtn] });
            const titleEl = StyledDialog.Title({ children: ['Title'] });
            const contentEl = StyledDialog.Content({ children: [titleEl] });
            return [triggerEl, contentEl];
          },
        });

        document.body.appendChild(root);
        triggerBtn.click();

        const overlay = root.querySelector('[data-dialog-overlay]') as HTMLElement;
        expect(overlay!.className).toBe('styled-overlay');

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(panel!.className).toContain('styled-content');

        const title = panel!.querySelector('h2') as HTMLElement;
        expect(title!.className).toBe('styled-title');

        document.body.removeChild(root);
      });

      it('Then exposes all sub-components (Trigger, Content, Title, etc.)', () => {
        const StyledDialog = withStyles(ComposedDialog, {
          overlay: 'a',
          content: 'b',
          close: 'c',
          header: 'd',
          title: 'e',
          description: 'f',
          footer: 'g',
        });

        expect(StyledDialog.Trigger).toBe(ComposedDialog.Trigger);
        expect(StyledDialog.Content).toBe(ComposedDialog.Content);
        expect(StyledDialog.Title).toBe(ComposedDialog.Title);
        expect(StyledDialog.Description).toBe(ComposedDialog.Description);
        expect(StyledDialog.Header).toBe(ComposedDialog.Header);
        expect(StyledDialog.Footer).toBe(ComposedDialog.Footer);
        expect(StyledDialog.Close).toBe(ComposedDialog.Close);
      });
    });
  });

  describe('Given two withStyles calls with different classes', () => {
    describe('When both are rendered', () => {
      it('Then each applies its own classes independently (multi-theme)', () => {
        const ShadcnDialog = withStyles(ComposedDialog, {
          overlay: 'shadcn-overlay',
          content: 'shadcn-content',
          close: 'shadcn-close',
          header: 'shadcn-header',
          title: 'shadcn-title',
          description: 'shadcn-description',
          footer: 'shadcn-footer',
        });

        const MaterialDialog = withStyles(ComposedDialog, {
          overlay: 'material-overlay',
          content: 'material-content',
          close: 'material-close',
          header: 'material-header',
          title: 'material-title',
          description: 'material-description',
          footer: 'material-footer',
        });

        const btn1 = document.createElement('button');
        const btn2 = document.createElement('button');

        const root1 = ShadcnDialog({
          children: () => {
            const t = ShadcnDialog.Trigger({ children: [btn1] });
            const c = ShadcnDialog.Content({ children: [] });
            return [t, c];
          },
        });

        const root2 = MaterialDialog({
          children: () => {
            const t = MaterialDialog.Trigger({ children: [btn2] });
            const c = MaterialDialog.Content({ children: [] });
            return [t, c];
          },
        });

        document.body.appendChild(root1);
        document.body.appendChild(root2);
        btn1.click();
        btn2.click();

        const overlay1 = root1.querySelector('[data-dialog-overlay]') as HTMLElement;
        const overlay2 = root2.querySelector('[data-dialog-overlay]') as HTMLElement;
        expect(overlay1!.className).toBe('shadcn-overlay');
        expect(overlay2!.className).toBe('material-overlay');

        document.body.removeChild(root1);
        document.body.removeChild(root2);
      });
    });
  });
});
