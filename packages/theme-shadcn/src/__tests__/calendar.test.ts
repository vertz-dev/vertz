import { describe, expect, it } from 'bun:test';
import { createThemedCalendar } from '../components/primitives/calendar';
import { createCalendarStyles } from '../styles/calendar';

describe('calendar styles', () => {
  const styles = createCalendarStyles();

  it('has all expected blocks', () => {
    expect(typeof styles.root).toBe('string');
    expect(typeof styles.header).toBe('string');
    expect(typeof styles.title).toBe('string');
    expect(typeof styles.navButton).toBe('string');
    expect(typeof styles.grid).toBe('string');
    expect(typeof styles.headCell).toBe('string');
    expect(typeof styles.cell).toBe('string');
    expect(typeof styles.dayButton).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(styles.root.length).toBeGreaterThan(0);
    expect(styles.header.length).toBeGreaterThan(0);
    expect(styles.title.length).toBeGreaterThan(0);
    expect(styles.navButton.length).toBeGreaterThan(0);
    expect(styles.dayButton.length).toBeGreaterThan(0);
  });

  it('has combined CSS', () => {
    expect(typeof styles.css).toBe('string');
    expect(styles.css.length).toBeGreaterThan(0);
  });
});

describe('themed Calendar', () => {
  const styles = createCalendarStyles();
  const calendar = createThemedCalendar(styles);

  it('applies root class', () => {
    const result = calendar();
    expect(result.root.className).toContain(styles.root);
  });

  it('applies header and title classes', () => {
    const result = calendar();
    expect(result.header.className).toContain(styles.header);
    expect(result.title.className).toContain(styles.title);
  });

  it('applies nav button classes', () => {
    const result = calendar();
    expect(result.prevButton.className).toContain(styles.navButton);
    expect(result.nextButton.className).toContain(styles.navButton);
  });

  it('applies grid class', () => {
    const result = calendar();
    expect(result.grid.className).toContain(styles.grid);
  });

  it('returns grid with role="grid"', () => {
    const result = calendar();
    expect(result.grid.getAttribute('role')).toBe('grid');
  });
});
