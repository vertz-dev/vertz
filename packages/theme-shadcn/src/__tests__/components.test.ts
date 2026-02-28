import { describe, expect, it } from 'bun:test';
import { createAlertComponents } from '../components/alert';
import { createBadgeComponent } from '../components/badge';
import { createButtonComponent } from '../components/button';
import { createCardComponents } from '../components/card';
import { createFormGroupComponents } from '../components/form-group';
import { createInputComponent } from '../components/input';
import { createLabelComponent } from '../components/label';
import { createSeparatorComponent } from '../components/separator';
import { createTextareaComponent } from '../components/textarea';
import { createAlert } from '../styles/alert';
import { createBadge } from '../styles/badge';
import { createButton } from '../styles/button';
import { createCard } from '../styles/card';
import { createFormGroup } from '../styles/form-group';
import { createInput } from '../styles/input';
import { createLabel } from '../styles/label';
import { createSeparator } from '../styles/separator';
import { createTextarea } from '../styles/textarea';

describe('Button component', () => {
  const buttonStyles = createButton();
  const Button = createButtonComponent(buttonStyles);

  it('returns an HTMLButtonElement', () => {
    const el = Button({ children: 'Click me' });
    expect(el).toBeInstanceOf(HTMLButtonElement);
  });

  it('applies theme class', () => {
    const el = Button({});
    expect(el.className.length).toBeGreaterThan(0);
  });

  it('appends user class to theme class', () => {
    const el = Button({ class: 'my-custom' });
    expect(el.className).toContain('my-custom');
    // Theme class should also be there
    expect(el.className.split(' ').length).toBeGreaterThan(1);
  });

  it('sets disabled attribute', () => {
    const el = Button({ disabled: true });
    expect(el.disabled).toBe(true);
  });

  it('defaults type to button', () => {
    const el = Button({});
    expect(el.type).toBe('button');
  });

  it('allows type override', () => {
    const el = Button({ type: 'submit' });
    expect(el.type).toBe('submit');
  });

  it('resolves string children', () => {
    const el = Button({ children: 'Hello' });
    expect(el.textContent).toBe('Hello');
  });

  it('resolves node children', () => {
    const span = document.createElement('span');
    span.textContent = 'inner';
    const el = Button({ children: span });
    expect(el.querySelector('span')).toBeTruthy();
    expect(el.querySelector('span')?.textContent).toBe('inner');
  });

  it('forwards extra HTML attributes', () => {
    const el = Button({ 'aria-label': 'test' });
    expect(el.getAttribute('aria-label')).toBe('test');
  });
});

describe('Badge component', () => {
  const badgeStyles = createBadge();
  const Badge = createBadgeComponent(badgeStyles);

  it('returns an HTMLSpanElement', () => {
    const el = Badge({});
    expect(el).toBeInstanceOf(HTMLSpanElement);
  });

  it('applies theme class', () => {
    const el = Badge({});
    expect(el.className.length).toBeGreaterThan(0);
  });

  it('appends user class', () => {
    const el = Badge({ class: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className.split(' ').length).toBeGreaterThan(1);
  });

  it('resolves string children', () => {
    const el = Badge({ children: 'New' });
    expect(el.textContent).toBe('New');
  });
});

describe('Card components', () => {
  const cardStyles = createCard();
  const { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } =
    createCardComponents(cardStyles);

  it('Card returns an HTMLDivElement with root class', () => {
    const el = Card({});
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.className).toContain(cardStyles.root);
  });

  it('CardHeader returns an HTMLDivElement with header class', () => {
    const el = CardHeader({});
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.className).toContain(cardStyles.header);
  });

  it('CardTitle returns an HTMLHeadingElement (h3) with title class', () => {
    const el = CardTitle({});
    expect(el).toBeInstanceOf(HTMLHeadingElement);
    expect(el.tagName).toBe('H3');
    expect(el.className).toContain(cardStyles.title);
  });

  it('CardDescription returns an HTMLParagraphElement with description class', () => {
    const el = CardDescription({});
    expect(el).toBeInstanceOf(HTMLParagraphElement);
    expect(el.className).toContain(cardStyles.description);
  });

  it('CardContent returns an HTMLDivElement with content class', () => {
    const el = CardContent({});
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.className).toContain(cardStyles.content);
  });

  it('CardFooter returns an HTMLDivElement with footer class', () => {
    const el = CardFooter({});
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.className).toContain(cardStyles.footer);
  });

  it('Card appends user class', () => {
    const el = Card({ class: 'custom-card' });
    expect(el.className).toContain('custom-card');
    expect(el.className).toContain(cardStyles.root);
  });

  it('Card resolves children', () => {
    const el = Card({ children: 'content' });
    expect(el.textContent).toBe('content');
  });

  it('CardAction returns an HTMLDivElement with action class', () => {
    const components = createCardComponents(cardStyles);
    const el = components.CardAction({});
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.className).toContain(cardStyles.action);
  });
});

describe('Input component', () => {
  const inputStyles = createInput();
  const Input = createInputComponent(inputStyles);

  it('returns an HTMLInputElement', () => {
    const el = Input({});
    expect(el).toBeInstanceOf(HTMLInputElement);
  });

  it('applies theme class', () => {
    const el = Input({});
    expect(el.className).toContain(inputStyles.base);
  });

  it('appends user class', () => {
    const el = Input({ class: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className).toContain(inputStyles.base);
  });

  it('forwards name attribute', () => {
    const el = Input({ name: 'email' });
    expect(el.name).toBe('email');
  });

  it('forwards placeholder attribute', () => {
    const el = Input({ placeholder: 'Enter email' });
    expect(el.placeholder).toBe('Enter email');
  });

  it('forwards type attribute', () => {
    const el = Input({ type: 'password' });
    expect(el.type).toBe('password');
  });

  it('forwards disabled attribute', () => {
    const el = Input({ disabled: true });
    expect(el.disabled).toBe(true);
  });

  it('forwards value attribute', () => {
    const el = Input({ value: 'hello' });
    expect(el.value).toBe('hello');
  });
});

describe('Label component', () => {
  const labelStyles = createLabel();
  const Label = createLabelComponent(labelStyles);

  it('returns an HTMLLabelElement', () => {
    const el = Label({});
    expect(el).toBeInstanceOf(HTMLLabelElement);
  });

  it('applies theme class', () => {
    const el = Label({});
    expect(el.className).toContain(labelStyles.base);
  });

  it('appends user class', () => {
    const el = Label({ class: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className).toContain(labelStyles.base);
  });

  it('forwards for attribute as htmlFor', () => {
    const el = Label({ for: 'email-input' });
    expect(el.htmlFor).toBe('email-input');
  });

  it('resolves string children', () => {
    const el = Label({ children: 'Email' });
    expect(el.textContent).toBe('Email');
  });
});

describe('Separator component', () => {
  const separatorStyles = createSeparator();
  const Separator = createSeparatorComponent(separatorStyles);

  it('returns an HTMLHRElement', () => {
    const el = Separator({});
    expect(el).toBeInstanceOf(HTMLHRElement);
  });

  it('applies theme class', () => {
    const el = Separator({});
    expect(el.className).toContain(separatorStyles.base);
  });

  it('appends user class', () => {
    const el = Separator({ class: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className).toContain(separatorStyles.base);
  });
});

describe('FormGroup components', () => {
  const formGroupStyles = createFormGroup();
  const { FormGroup, FormError } = createFormGroupComponents(formGroupStyles);

  it('FormGroup returns an HTMLDivElement', () => {
    const el = FormGroup({});
    expect(el).toBeInstanceOf(HTMLDivElement);
  });

  it('FormGroup applies theme class', () => {
    const el = FormGroup({});
    expect(el.className).toContain(formGroupStyles.base);
  });

  it('FormGroup appends user class', () => {
    const el = FormGroup({ class: 'custom' });
    expect(el.className).toContain('custom');
    expect(el.className).toContain(formGroupStyles.base);
  });

  it('FormGroup resolves children', () => {
    const el = FormGroup({ children: 'field content' });
    expect(el.textContent).toBe('field content');
  });

  it('FormError returns an HTMLSpanElement', () => {
    const el = FormError({});
    expect(el).toBeInstanceOf(HTMLSpanElement);
  });

  it('FormError applies theme class', () => {
    const el = FormError({});
    expect(el.className).toContain(formGroupStyles.error);
  });

  it('FormError appends user class', () => {
    const el = FormError({ class: 'custom' });
    expect(el.className).toContain('custom');
    expect(el.className).toContain(formGroupStyles.error);
  });

  it('FormError resolves children', () => {
    const el = FormError({ children: 'Required field' });
    expect(el.textContent).toBe('Required field');
  });
});

describe('Textarea component', () => {
  const textareaStyles = createTextarea();
  const Textarea = createTextareaComponent(textareaStyles);

  it('returns an HTMLTextAreaElement', () => {
    const el = Textarea({});
    expect(el).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('applies theme class', () => {
    const el = Textarea({});
    expect(el.className).toContain(textareaStyles.base);
  });

  it('appends user class', () => {
    const el = Textarea({ class: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className).toContain(textareaStyles.base);
  });

  it('forwards name attribute', () => {
    const el = Textarea({ name: 'bio' });
    expect(el.name).toBe('bio');
  });

  it('forwards placeholder attribute', () => {
    const el = Textarea({ placeholder: 'Enter bio' });
    expect(el.placeholder).toBe('Enter bio');
  });

  it('forwards disabled attribute', () => {
    const el = Textarea({ disabled: true });
    expect(el.disabled).toBe(true);
  });

  it('forwards value attribute', () => {
    const el = Textarea({ value: 'hello' });
    expect(el.value).toBe('hello');
  });

  it('forwards rows attribute', () => {
    const el = Textarea({ rows: 5 });
    expect(String(el.rows)).toBe('5');
  });

  it('forwards extra HTML attributes', () => {
    const el = Textarea({ 'aria-label': 'description' });
    expect(el.getAttribute('aria-label')).toBe('description');
  });
});

describe('Alert components', () => {
  const alertStyles = createAlert();
  const { Alert, AlertTitle, AlertDescription } = createAlertComponents(alertStyles);

  it('Alert returns an HTMLDivElement with role="alert"', () => {
    const el = Alert({});
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.getAttribute('role')).toBe('alert');
  });

  it('Alert applies root class by default', () => {
    const el = Alert({});
    expect(el.className).toContain(alertStyles.root);
  });

  it('Alert applies destructive class for destructive variant', () => {
    const el = Alert({ variant: 'destructive' });
    expect(el.className).toContain(alertStyles.root);
    expect(el.className).toContain(alertStyles.destructive);
  });

  it('Alert appends user class', () => {
    const el = Alert({ class: 'custom-alert' });
    expect(el.className).toContain('custom-alert');
    expect(el.className).toContain(alertStyles.root);
  });

  it('Alert resolves children', () => {
    const el = Alert({ children: 'Warning message' });
    expect(el.textContent).toBe('Warning message');
  });

  it('AlertTitle returns an HTMLHeadingElement (h5) with title class', () => {
    const el = AlertTitle({});
    expect(el).toBeInstanceOf(HTMLHeadingElement);
    expect(el.tagName).toBe('H5');
    expect(el.className).toContain(alertStyles.title);
  });

  it('AlertTitle appends user class', () => {
    const el = AlertTitle({ class: 'custom-title' });
    expect(el.className).toContain('custom-title');
    expect(el.className).toContain(alertStyles.title);
  });

  it('AlertTitle resolves children', () => {
    const el = AlertTitle({ children: 'Error' });
    expect(el.textContent).toBe('Error');
  });

  it('AlertDescription returns an HTMLDivElement with description class', () => {
    const el = AlertDescription({});
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.className).toContain(alertStyles.description);
  });

  it('AlertDescription appends user class', () => {
    const el = AlertDescription({ class: 'custom-desc' });
    expect(el.className).toContain('custom-desc');
    expect(el.className).toContain(alertStyles.description);
  });

  it('AlertDescription resolves children', () => {
    const el = AlertDescription({ children: 'Something went wrong.' });
    expect(el.textContent).toBe('Something went wrong.');
  });
});
