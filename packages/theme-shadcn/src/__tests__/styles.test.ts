import { describe, expect, it } from 'bun:test';
import { variants } from '@vertz/ui';
import { badgeConfig, createBadge } from '../styles/badge';
import { buttonConfig, createButton } from '../styles/button';
import { createCard } from '../styles/card';
import { createFormGroup } from '../styles/form-group';
import { createInput } from '../styles/input';
import { createLabel } from '../styles/label';
import { createSeparator } from '../styles/separator';

describe('button', () => {
  const button = createButton();

  it('returns a non-empty class name string', () => {
    const className = button({ intent: 'primary', size: 'md' });
    expect(typeof className).toBe('string');
    expect(className.length).toBeGreaterThan(0);
  });

  it('accepts all intent variants', () => {
    for (const intent of ['primary', 'secondary', 'destructive', 'ghost', 'outline'] as const) {
      expect(typeof button({ intent })).toBe('string');
    }
  });

  it('accepts all size variants', () => {
    for (const size of ['sm', 'md', 'lg', 'icon'] as const) {
      expect(typeof button({ size })).toBe('string');
    }
  });

  it('uses default variants when called without args', () => {
    const className = button();
    expect(typeof className).toBe('string');
    expect(className.length).toBeGreaterThan(0);
  });

  it('buttonConfig can be spread for customization', () => {
    const customButton = variants({
      ...buttonConfig,
      variants: {
        ...buttonConfig.variants,
        intent: {
          ...buttonConfig.variants.intent,
          brand: ['bg:primary', 'text:primary-foreground', 'rounded:full'],
        },
      },
    });
    expect(typeof customButton({ intent: 'brand' })).toBe('string');
    expect(typeof customButton({ intent: 'primary' })).toBe('string');
  });
});

describe('badge', () => {
  const badge = createBadge();

  it('returns a non-empty class name string', () => {
    const className = badge({ color: 'blue' });
    expect(typeof className).toBe('string');
    expect(className.length).toBeGreaterThan(0);
  });

  it('accepts all color variants', () => {
    for (const color of ['blue', 'green', 'yellow', 'red', 'gray'] as const) {
      expect(typeof badge({ color })).toBe('string');
    }
  });

  it('uses default color when called without args', () => {
    expect(typeof badge()).toBe('string');
  });

  it('badgeConfig can be spread for customization', () => {
    const customBadge = variants({
      ...badgeConfig,
      variants: {
        ...badgeConfig.variants,
        color: {
          ...badgeConfig.variants.color,
          purple: ['bg:accent', 'text:accent-foreground'],
        },
      },
    });
    expect(typeof customBadge({ color: 'purple' })).toBe('string');
  });
});

describe('card', () => {
  const card = createCard();

  it('has root, header, title, description, content, and footer class names', () => {
    expect(typeof card.root).toBe('string');
    expect(typeof card.header).toBe('string');
    expect(typeof card.title).toBe('string');
    expect(typeof card.description).toBe('string');
    expect(typeof card.content).toBe('string');
    expect(typeof card.footer).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(card.root.length).toBeGreaterThan(0);
    expect(card.header.length).toBeGreaterThan(0);
    expect(card.title.length).toBeGreaterThan(0);
    expect(card.content.length).toBeGreaterThan(0);
    expect(card.footer.length).toBeGreaterThan(0);
  });
});

describe('input', () => {
  const input = createInput();

  it('has a non-empty class name string', () => {
    expect(typeof input.base).toBe('string');
    expect(input.base.length).toBeGreaterThan(0);
  });
});

describe('label', () => {
  const label = createLabel();

  it('has a non-empty class name string', () => {
    expect(typeof label.base).toBe('string');
    expect(label.base.length).toBeGreaterThan(0);
  });
});

describe('separator', () => {
  const separator = createSeparator();

  it('has a non-empty class name string', () => {
    expect(typeof separator.base).toBe('string');
    expect(separator.base.length).toBeGreaterThan(0);
  });
});

describe('formGroup', () => {
  const formGroup = createFormGroup();

  it('has base and error class names', () => {
    expect(typeof formGroup.base).toBe('string');
    expect(typeof formGroup.error).toBe('string');
    expect(formGroup.base.length).toBeGreaterThan(0);
    expect(formGroup.error.length).toBeGreaterThan(0);
  });
});
