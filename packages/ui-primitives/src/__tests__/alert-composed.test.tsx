import { describe, expect, it } from '@vertz/test';
import type { AlertClasses } from '../alert/alert-composed';
import { ComposedAlert } from '../alert/alert-composed';
import { withStyles } from '../composed/with-styles';

const classes: AlertClasses = {
  root: 'alert-root',
  title: 'alert-title',
  description: 'alert-desc',
};

function RenderAlertRoot() {
  return <ComposedAlert classes={classes}>warning</ComposedAlert>;
}
function RenderAlertPlain() {
  return <ComposedAlert>message</ComposedAlert>;
}
function RenderAlertWithClass() {
  return (
    <ComposedAlert classes={classes} className="custom">
      hi
    </ComposedAlert>
  );
}
function RenderAlertTitle() {
  return (
    <ComposedAlert classes={classes}>
      <ComposedAlert.Title>Error</ComposedAlert.Title>
    </ComposedAlert>
  );
}
function RenderAlertDescription() {
  return (
    <ComposedAlert classes={classes}>
      <ComposedAlert.Description>Something went wrong.</ComposedAlert.Description>
    </ComposedAlert>
  );
}
function RenderTitleWithClass() {
  return (
    <ComposedAlert classes={classes}>
      <ComposedAlert.Title className="extra">t</ComposedAlert.Title>
    </ComposedAlert>
  );
}
function RenderDescriptionWithClass() {
  return (
    <ComposedAlert classes={classes}>
      <ComposedAlert.Description className="extra">d</ComposedAlert.Description>
    </ComposedAlert>
  );
}
function RenderDestructive() {
  const destructiveClasses: AlertClasses = {
    root: 'alert-root alert-destructive',
    title: 'alert-title',
    description: 'alert-desc',
  };
  return <ComposedAlert classes={destructiveClasses}>danger</ComposedAlert>;
}
function RenderFullAlert() {
  return (
    <ComposedAlert classes={classes}>
      <ComposedAlert.Title>Warning</ComposedAlert.Title>
      <ComposedAlert.Description>Check your input.</ComposedAlert.Description>
    </ComposedAlert>
  );
}

describe('ComposedAlert', () => {
  describe('Root', () => {
    it('renders a div with role="alert"', () => {
      const el = RenderAlertPlain();
      expect(el.tagName).toBe('DIV');
      expect(el.getAttribute('role')).toBe('alert');
    });

    it('applies root class from classes prop', () => {
      const el = RenderAlertRoot();
      const inner = el.querySelector('[role="alert"]') ?? el;
      expect(inner.className).toContain('alert-root');
    });

    it('appends user className to root class', () => {
      const el = RenderAlertWithClass();
      const inner = el.querySelector('[role="alert"]') ?? el;
      expect(inner.className).toContain('alert-root');
      expect(inner.className).toContain('custom');
    });

    it('resolves children', () => {
      const el = RenderAlertPlain();
      expect(el.textContent).toContain('message');
    });
  });

  describe('Sub-components receive classes from context', () => {
    it('Title renders as h5 with title class', () => {
      const el = RenderAlertTitle();
      const title = el.querySelector('h5');
      expect(title).not.toBeNull();
      expect(title?.className).toContain('alert-title');
      expect(title?.textContent).toBe('Error');
    });

    it('Description renders as div with description class', () => {
      const el = RenderAlertDescription();
      const desc = el.querySelector('.alert-desc');
      expect(desc).not.toBeNull();
      expect(desc?.textContent).toBe('Something went wrong.');
    });
  });

  describe('Sub-components append user classes', () => {
    it('Title appends user className', () => {
      const el = RenderTitleWithClass();
      const title = el.querySelector('h5');
      expect(title?.className).toContain('alert-title');
      expect(title?.className).toContain('extra');
    });

    it('Description appends user className', () => {
      const el = RenderDescriptionWithClass();
      const desc = el.querySelector('.alert-desc');
      expect(desc?.className).toContain('alert-desc');
      expect(desc?.className).toContain('extra');
    });
  });

  describe('Variant styling via classes', () => {
    it('supports destructive variant by combining root classes', () => {
      const el = RenderDestructive();
      const inner = el.querySelector('[role="alert"]') ?? el;
      expect(inner.className).toContain('alert-root');
      expect(inner.className).toContain('alert-destructive');
    });
  });

  describe('withStyles integration', () => {
    it('styled alert preserves sub-components', () => {
      const StyledAlert = withStyles(ComposedAlert, classes);
      expect(StyledAlert.Title).toBeDefined();
      expect(StyledAlert.Description).toBeDefined();
    });
  });

  describe('Full alert structure', () => {
    it('renders complete alert with all sub-components', () => {
      const el = RenderFullAlert();
      // role="alert" is on el itself (querySelector doesn't match the element)
      expect(el.getAttribute('role')).toBe('alert');
      expect(el.querySelector('h5')?.textContent).toBe('Warning');
      expect(el.querySelector('.alert-desc')?.textContent).toBe('Check your input.');
    });
  });
});
