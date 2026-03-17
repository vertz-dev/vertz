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
  const Calendar = createThemedCalendar(styles);

  it('applies root class to the container', () => {
    const root = Calendar({});
    expect(root.className).toContain(styles.root);
  });

  it('applies header and title classes', () => {
    const root = Calendar({});
    const navButtons = Array.from(root.querySelectorAll('button')).filter(
      (b) => !b.hasAttribute('data-date'),
    );
    expect(navButtons.length).toBe(2);
    expect(navButtons[0]?.className).toContain(styles.navButton);
  });

  it('applies grid class', () => {
    const root = Calendar({});
    const grid = root.querySelector('[role="grid"]');
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain(styles.grid);
  });

  it('renders a grid with role="grid"', () => {
    const root = Calendar({});
    const grid = root.querySelector('[role="grid"]');
    expect(grid?.getAttribute('role')).toBe('grid');
  });

  it('applies dayButton class to day buttons', () => {
    const root = Calendar({});
    const dayBtns = root.querySelectorAll('td button');
    expect(dayBtns.length).toBeGreaterThan(0);
    expect(dayBtns[0]?.className).toContain(styles.dayButton);
  });

  it('applies headCell class to column headers', () => {
    const root = Calendar({});
    const ths = root.querySelectorAll('th');
    expect(ths.length).toBe(7);
    expect(ths[0]?.className).toContain(styles.headCell);
  });

  it('applies cell class to grid cells', () => {
    const root = Calendar({});
    const tds = root.querySelectorAll('td');
    expect(tds.length).toBeGreaterThan(0);
    expect(tds[0]?.className).toContain(styles.cell);
  });
});
