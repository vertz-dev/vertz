import { describe, expect, it } from 'bun:test';
import { Badge } from '../badge';

describe('Badge', () => {
  it('renders as a span element', () => {
    const { badge } = Badge.Root();
    expect(badge).toBeInstanceOf(HTMLSpanElement);
  });

  it('has unique ID starting with badge-', () => {
    const { badge } = Badge.Root();
    expect(badge.id).toMatch(/^badge-/);
  });

  it('sets data-slot="badge"', () => {
    const { badge } = Badge.Root();
    expect(badge.getAttribute('data-slot')).toBe('badge');
  });

  it('sets data-variant="default" when no variant specified', () => {
    const { badge } = Badge.Root();
    expect(badge.getAttribute('data-variant')).toBe('default');
  });

  it('sets data-variant="secondary" for secondary variant', () => {
    const { badge } = Badge.Root({ variant: 'secondary' });
    expect(badge.getAttribute('data-variant')).toBe('secondary');
  });

  it('sets data-variant="outline" for outline variant', () => {
    const { badge } = Badge.Root({ variant: 'outline' });
    expect(badge.getAttribute('data-variant')).toBe('outline');
  });

  it('sets data-variant="destructive" for destructive variant', () => {
    const { badge } = Badge.Root({ variant: 'destructive' });
    expect(badge.getAttribute('data-variant')).toBe('destructive');
  });
});
