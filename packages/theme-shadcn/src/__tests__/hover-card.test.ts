import { describe, expect, it } from 'bun:test';
import { createThemedHoverCard } from '../components/primitives/hover-card';
import { createHoverCardStyles } from '../styles/hover-card';

describe('hover-card styles', () => {
  const styles = createHoverCardStyles();

  it('has content block', () => {
    expect(typeof styles.content).toBe('string');
    expect(styles.content.length).toBeGreaterThan(0);
  });

  it('has combined CSS', () => {
    expect(typeof styles.css).toBe('string');
    expect(styles.css.length).toBeGreaterThan(0);
  });
});

describe('themed HoverCard', () => {
  const styles = createHoverCardStyles();
  const hoverCard = createThemedHoverCard(styles);

  it('applies content class', () => {
    const result = hoverCard();
    expect(result.content.className).toContain(styles.content);
  });

  it('returns trigger and content elements', () => {
    const result = hoverCard();
    expect(result.trigger).toBeInstanceOf(HTMLElement);
    expect(result.content).toBeInstanceOf(HTMLDivElement);
  });

  it('preserves primitive state', () => {
    const result = hoverCard();
    expect(result.state.open.peek()).toBe(false);
  });
});
