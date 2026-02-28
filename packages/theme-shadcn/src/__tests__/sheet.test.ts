import { describe, expect, it } from 'bun:test';
import { createThemedSheet } from '../components/primitives/sheet';
import { createSheetStyles } from '../styles/sheet';

describe('sheet styles', () => {
  const sheet = createSheetStyles();

  it('has overlay and all 4 panel direction blocks', () => {
    expect(typeof sheet.overlay).toBe('string');
    expect(typeof sheet.panelLeft).toBe('string');
    expect(typeof sheet.panelRight).toBe('string');
    expect(typeof sheet.panelTop).toBe('string');
    expect(typeof sheet.panelBottom).toBe('string');
  });

  it('has title, description, and close blocks', () => {
    expect(typeof sheet.title).toBe('string');
    expect(typeof sheet.description).toBe('string');
    expect(typeof sheet.close).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(sheet.overlay.length).toBeGreaterThan(0);
    expect(sheet.panelLeft.length).toBeGreaterThan(0);
    expect(sheet.panelRight.length).toBeGreaterThan(0);
    expect(sheet.panelTop.length).toBeGreaterThan(0);
    expect(sheet.panelBottom.length).toBeGreaterThan(0);
    expect(sheet.title.length).toBeGreaterThan(0);
    expect(sheet.description.length).toBeGreaterThan(0);
    expect(sheet.close.length).toBeGreaterThan(0);
  });

  it('CSS contains horizontal slide animations', () => {
    expect(sheet.css).toContain('vz-slide-in-from-left');
    expect(sheet.css).toContain('vz-slide-in-from-right');
    expect(sheet.css).toContain('vz-slide-out-to-left');
    expect(sheet.css).toContain('vz-slide-out-to-right');
  });
});

describe('themed Sheet', () => {
  const styles = createSheetStyles();
  const sheet = createThemedSheet(styles);

  it('defaults to right side', () => {
    const result = sheet();
    expect(result.content.className).toContain(styles.panelRight);
  });

  it('applies left panel class', () => {
    const result = sheet({ side: 'left' });
    expect(result.content.className).toContain(styles.panelLeft);
  });

  it('applies right panel class', () => {
    const result = sheet({ side: 'right' });
    expect(result.content.className).toContain(styles.panelRight);
  });

  it('applies top panel class', () => {
    const result = sheet({ side: 'top' });
    expect(result.content.className).toContain(styles.panelTop);
  });

  it('applies bottom panel class', () => {
    const result = sheet({ side: 'bottom' });
    expect(result.content.className).toContain(styles.panelBottom);
  });

  it('applies overlay class', () => {
    const result = sheet();
    expect(result.overlay.className).toContain(styles.overlay);
  });

  it('applies title and close classes', () => {
    const result = sheet();
    expect(result.title.className).toContain(styles.title);
    expect(result.close.className).toContain(styles.close);
  });
});
