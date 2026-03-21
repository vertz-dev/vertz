import { describe, expect, it } from 'bun:test';
import { configureTheme } from '../configure';

const theme = configureTheme();
const { Button, Badge, Input, Label, Separator, Textarea, Card, FormGroup, Alert } =
  theme.components;

describe('Button component', () => {
  it('returns a button element', () => {
    const el = Button({ children: 'Click me' });
    expect(el.tagName).toBe('BUTTON');
  });

  it('applies theme class', () => {
    const el = Button({});
    expect(el.className.length).toBeGreaterThan(0);
  });

  it('appends user class to theme class', () => {
    const el = Button({ className: 'my-custom' });
    expect(el.className).toContain('my-custom');
    expect(el.className.split(' ').length).toBeGreaterThan(1);
  });

  it('sets disabled attribute', () => {
    const el = Button({ disabled: true });
    expect(el.getAttribute('disabled')).not.toBeNull();
  });

  it('defaults type to button', () => {
    const el = Button({});
    expect(el.getAttribute('type')).toBe('button');
  });

  it('allows type override', () => {
    const el = Button({ type: 'submit' });
    expect(el.getAttribute('type')).toBe('submit');
  });

  it('resolves string children', () => {
    const el = Button({ children: 'Hello' });
    expect(el.textContent).toBe('Hello');
  });
});

describe('Badge component', () => {
  it('returns a span element', () => {
    const el = Badge({});
    expect(el.tagName).toBe('SPAN');
  });

  it('applies theme class', () => {
    const el = Badge({});
    expect(el.className.length).toBeGreaterThan(0);
  });

  it('appends user class', () => {
    const el = Badge({ className: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className.split(' ').length).toBeGreaterThan(1);
  });

  it('resolves string children', () => {
    const el = Badge({ children: 'New' });
    expect(el.textContent).toBe('New');
  });
});

describe('Card component (composed)', () => {
  it('Card renders a div with root class', () => {
    const el = Card({}) as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain(theme.styles.card.root);
  });

  it('Card appends user class', () => {
    const el = Card({ className: 'custom-card' }) as HTMLElement;
    expect(el.className).toContain('custom-card');
    expect(el.className).toContain(theme.styles.card.root);
  });

  it('Card resolves children', () => {
    const el = Card({ children: 'content' }) as HTMLElement;
    expect(el.textContent).toContain('content');
  });

  it('Card has all expected sub-components', () => {
    expect(Card.Header).toBeDefined();
    expect(Card.Title).toBeDefined();
    expect(Card.Description).toBeDefined();
    expect(Card.Content).toBeDefined();
    expect(Card.Footer).toBeDefined();
    expect(Card.Action).toBeDefined();
  });
});

describe('Input component', () => {
  it('returns an input element', () => {
    const el = Input({});
    expect(el.tagName).toBe('INPUT');
  });

  it('applies theme class', () => {
    const el = Input({});
    expect(el.className).toContain(theme.styles.input.base);
  });

  it('appends user class', () => {
    const el = Input({ className: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className).toContain(theme.styles.input.base);
  });

  it('forwards name attribute', () => {
    const el = Input({ name: 'email' });
    expect(el.getAttribute('name')).toBe('email');
  });

  it('forwards placeholder attribute', () => {
    const el = Input({ placeholder: 'Enter email' });
    expect(el.getAttribute('placeholder')).toBe('Enter email');
  });

  it('forwards type attribute', () => {
    const el = Input({ type: 'password' });
    expect(el.getAttribute('type')).toBe('password');
  });

  it('forwards disabled attribute', () => {
    const el = Input({ disabled: true });
    expect(el.getAttribute('disabled')).not.toBeNull();
  });
});

describe('Label component', () => {
  it('returns a label element', () => {
    const el = Label({});
    expect(el.tagName).toBe('LABEL');
  });

  it('applies theme class', () => {
    const el = Label({});
    expect(el.className).toContain(theme.styles.label.base);
  });

  it('appends user class', () => {
    const el = Label({ className: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className).toContain(theme.styles.label.base);
  });

  it('forwards for attribute', () => {
    const el = Label({ for: 'email-input' });
    expect(el.getAttribute('for')).toBe('email-input');
  });

  it('resolves string children', () => {
    const el = Label({ children: 'Email' });
    expect(el.textContent).toBe('Email');
  });
});

describe('Separator component', () => {
  it('returns an hr element', () => {
    const el = Separator({});
    expect(el.tagName).toBe('HR');
  });

  it('applies theme class', () => {
    const el = Separator({});
    expect(el.className).toContain(theme.styles.separator.base);
  });

  it('appends user class', () => {
    const el = Separator({ className: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className).toContain(theme.styles.separator.base);
  });

  it('sets role="separator" and aria-orientation', () => {
    const el = Separator({});
    expect(el.getAttribute('role')).toBe('separator');
    expect(el.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('sets aria-orientation to vertical', () => {
    const el = Separator({ orientation: 'vertical' });
    expect(el.getAttribute('aria-orientation')).toBe('vertical');
  });
});

describe('FormGroup component (composed)', () => {
  it('FormGroup renders a div with base class', () => {
    const el = FormGroup({}) as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain(theme.styles.formGroup.base);
  });

  it('FormGroup appends user class', () => {
    const el = FormGroup({ className: 'custom' }) as HTMLElement;
    expect(el.className).toContain('custom');
    expect(el.className).toContain(theme.styles.formGroup.base);
  });

  it('FormGroup resolves children', () => {
    const el = FormGroup({ children: 'field content' }) as HTMLElement;
    expect(el.textContent).toContain('field content');
  });

  it('FormGroup has FormError sub-component', () => {
    expect(FormGroup.FormError).toBeDefined();
  });
});

describe('Textarea component', () => {
  it('returns a textarea element', () => {
    const el = Textarea({});
    expect(el.tagName).toBe('TEXTAREA');
  });

  it('applies theme class', () => {
    const el = Textarea({});
    expect(el.className).toContain(theme.styles.textarea.base);
  });

  it('appends user class', () => {
    const el = Textarea({ className: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className).toContain(theme.styles.textarea.base);
  });

  it('forwards name attribute', () => {
    const el = Textarea({ name: 'bio' });
    expect(el.getAttribute('name')).toBe('bio');
  });

  it('forwards placeholder attribute', () => {
    const el = Textarea({ placeholder: 'Enter bio' });
    expect(el.getAttribute('placeholder')).toBe('Enter bio');
  });

  it('forwards disabled attribute', () => {
    const el = Textarea({ disabled: true });
    expect(el.getAttribute('disabled')).not.toBeNull();
  });

  it('forwards rows attribute', () => {
    const el = Textarea({ rows: 5 });
    expect(el.getAttribute('rows')).toBe('5');
  });
});

describe('Alert component (composed)', () => {
  it('Alert renders with role="alert" and root class', () => {
    const el = Alert({}) as HTMLElement;
    expect(el.getAttribute('role')).toBe('alert');
    expect(el.className).toContain(theme.styles.alert.root);
  });

  it('Alert destructive variant applies destructive class', () => {
    const el = Alert({ variant: 'destructive' }) as HTMLElement;
    expect(el.className).toContain(theme.styles.alert.root);
    expect(el.className).toContain(theme.styles.alert.destructive);
  });

  it('Alert default variant does not apply destructive class', () => {
    const el = Alert({}) as HTMLElement;
    expect(el.className).not.toContain(theme.styles.alert.destructive);
  });

  it('Alert appends user class', () => {
    const el = Alert({ className: 'custom-alert' }) as HTMLElement;
    expect(el.className).toContain('custom-alert');
    expect(el.className).toContain(theme.styles.alert.root);
  });

  it('Alert resolves children', () => {
    const el = Alert({ children: 'Warning message' }) as HTMLElement;
    expect(el.textContent).toContain('Warning message');
  });

  it('Alert has Title and Description sub-components', () => {
    expect(Alert.Title).toBeDefined();
    expect(Alert.Description).toBeDefined();
  });
});
