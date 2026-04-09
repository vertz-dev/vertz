import { describe, expect, it } from '@vertz/test';
import { withStyles } from '../composed/with-styles';
import type { FormGroupClasses } from '../form-group/form-group-composed';
import { ComposedFormGroup } from '../form-group/form-group-composed';

const classes: FormGroupClasses = {
  base: 'form-group-base',
  error: 'form-group-error',
};

function RenderFormGroupRoot() {
  return <ComposedFormGroup classes={classes}>field</ComposedFormGroup>;
}
function RenderFormGroupPlain() {
  return <ComposedFormGroup>field content</ComposedFormGroup>;
}
function RenderFormGroupWithClass() {
  return (
    <ComposedFormGroup classes={classes} className="custom">
      field
    </ComposedFormGroup>
  );
}
function RenderFormError() {
  return (
    <ComposedFormGroup classes={classes}>
      <ComposedFormGroup.FormError>Required field</ComposedFormGroup.FormError>
    </ComposedFormGroup>
  );
}
function RenderFormErrorWithClass() {
  return (
    <ComposedFormGroup classes={classes}>
      <ComposedFormGroup.FormError className="extra">err</ComposedFormGroup.FormError>
    </ComposedFormGroup>
  );
}
function RenderUnstyled() {
  return (
    <ComposedFormGroup>
      <ComposedFormGroup.FormError>err</ComposedFormGroup.FormError>
    </ComposedFormGroup>
  );
}

describe('ComposedFormGroup', () => {
  describe('Root', () => {
    it('renders a div', () => {
      const el = RenderFormGroupPlain();
      expect(el.tagName).toBe('DIV');
    });

    it('applies base class from classes prop', () => {
      const el = RenderFormGroupRoot();
      const inner = el.querySelector('.form-group-base') ?? el;
      expect(inner.className).toContain('form-group-base');
    });

    it('appends user className', () => {
      const el = RenderFormGroupWithClass();
      const inner = el.querySelector('.form-group-base') ?? el;
      expect(inner.className).toContain('form-group-base');
      expect(inner.className).toContain('custom');
    });

    it('resolves children', () => {
      const el = RenderFormGroupPlain();
      expect(el.textContent).toContain('field content');
    });
  });

  describe('FormError sub-component', () => {
    it('renders as span with error class from context', () => {
      const el = RenderFormError();
      const error = el.querySelector('.form-group-error');
      expect(error).not.toBeNull();
      expect(error?.tagName).toBe('SPAN');
      expect(error?.textContent).toBe('Required field');
    });

    it('appends user className', () => {
      const el = RenderFormErrorWithClass();
      const error = el.querySelector('.form-group-error');
      expect(error).not.toBeNull();
      expect(error?.className).toContain('form-group-error');
      expect(error?.className).toContain('extra');
    });
  });

  describe('withStyles integration', () => {
    it('styled form group preserves sub-components', () => {
      const StyledFormGroup = withStyles(ComposedFormGroup, classes);
      expect(StyledFormGroup.FormError).toBeDefined();
    });
  });

  describe('Without classes (unstyled)', () => {
    it('renders without crashing when no classes provided', () => {
      const el = RenderUnstyled();
      expect(el.tagName).toBe('DIV');
      expect(el.textContent).toContain('err');
    });
  });
});
