import { describe, expect, it } from 'bun:test';
import { createThemedDrawer } from '../components/primitives/drawer';
import { createDrawerStyles } from '../styles/drawer';

describe('drawer styles', () => {
  const drawer = createDrawerStyles();

  it('has overlay and all 4 panel direction blocks', () => {
    expect(typeof drawer.overlay).toBe('string');
    expect(typeof drawer.panelLeft).toBe('string');
    expect(typeof drawer.panelRight).toBe('string');
    expect(typeof drawer.panelTop).toBe('string');
    expect(typeof drawer.panelBottom).toBe('string');
  });

  it('has title, description, handle, and close blocks', () => {
    expect(typeof drawer.title).toBe('string');
    expect(typeof drawer.description).toBe('string');
    expect(typeof drawer.handle).toBe('string');
    expect(typeof drawer.close).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(drawer.overlay.length).toBeGreaterThan(0);
    expect(drawer.panelLeft.length).toBeGreaterThan(0);
    expect(drawer.panelRight.length).toBeGreaterThan(0);
    expect(drawer.panelTop.length).toBeGreaterThan(0);
    expect(drawer.panelBottom.length).toBeGreaterThan(0);
    expect(drawer.title.length).toBeGreaterThan(0);
    expect(drawer.description.length).toBeGreaterThan(0);
    expect(drawer.handle.length).toBeGreaterThan(0);
    expect(drawer.close.length).toBeGreaterThan(0);
  });
});

describe('themed Drawer', () => {
  const styles = createDrawerStyles();
  const drawer = createThemedDrawer(styles);

  it('defaults to bottom side', () => {
    const result = drawer();
    expect(result.content.className).toContain(styles.panelBottom);
  });

  it('applies left panel class', () => {
    const result = drawer({ side: 'left' });
    expect(result.content.className).toContain(styles.panelLeft);
  });

  it('applies right panel class', () => {
    const result = drawer({ side: 'right' });
    expect(result.content.className).toContain(styles.panelRight);
  });

  it('applies top panel class', () => {
    const result = drawer({ side: 'top' });
    expect(result.content.className).toContain(styles.panelTop);
  });

  it('applies bottom panel class', () => {
    const result = drawer({ side: 'bottom' });
    expect(result.content.className).toContain(styles.panelBottom);
  });

  it('has handle element with handle class', () => {
    const result = drawer();
    expect(result.handle).toBeInstanceOf(HTMLDivElement);
    expect(result.handle.className).toContain(styles.handle);
    expect(result.content.firstChild).toBe(result.handle);
  });

  it('has description with aria-describedby link', () => {
    const result = drawer();
    expect(result.description).toBeInstanceOf(HTMLParagraphElement);
    expect(result.description.className).toContain(styles.description);
    expect(result.description.id).toBe(`${result.content.id}-description`);
    expect(result.content.getAttribute('aria-describedby')).toBe(result.description.id);
  });

  it('applies overlay, title, and close classes', () => {
    const result = drawer();
    expect(result.overlay.className).toContain(styles.overlay);
    expect(result.title.className).toContain(styles.title);
    expect(result.close.className).toContain(styles.close);
  });
});
