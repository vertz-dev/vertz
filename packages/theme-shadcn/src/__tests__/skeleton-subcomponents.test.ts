import { describe, expect, it } from 'bun:test';
import { configureTheme } from '../configure';

const theme = configureTheme();
const Skeleton = theme.components.Skeleton;

describe('Skeleton.Text (themed)', () => {
  it('renders with theme text line class', () => {
    const el = Skeleton.Text({});
    expect(el.tagName).toBe('DIV');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders 3 lines by default', () => {
    const el = Skeleton.Text({});
    expect(el.children.length).toBe(3);
  });

  it('last line has default 75% width', () => {
    const el = Skeleton.Text({});
    const last = el.children[2] as HTMLElement;
    expect(last.style.width).toBe('75%');
  });

  it('applies textRoot class to container', () => {
    const el = Skeleton.Text({});
    expect(el.className).toContain(theme.styles.skeleton.textRoot);
  });

  it('applies textLine class to each line', () => {
    const el = Skeleton.Text({});
    for (let i = 0; i < el.children.length; i++) {
      expect((el.children[i] as HTMLElement).className).toContain(theme.styles.skeleton.textLine);
    }
  });
});

describe('Skeleton.Circle (themed)', () => {
  it('renders with circle class', () => {
    const el = Skeleton.Circle({});
    expect(el.tagName).toBe('DIV');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toContain(theme.styles.skeleton.circleRoot);
  });

  it('defaults to 2.5rem size', () => {
    const el = Skeleton.Circle({});
    expect(el.style.width).toBe('2.5rem');
    expect(el.style.height).toBe('2.5rem');
  });

  it('accepts custom size', () => {
    const el = Skeleton.Circle({ size: '48px' });
    expect(el.style.width).toBe('48px');
    expect(el.style.height).toBe('48px');
  });
});
