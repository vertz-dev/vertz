import { describe, expect, it } from 'bun:test';
import { Avatar } from '../avatar';
import { itWithNativeCompiler } from './native-compiler-test-utils.test';

describe('Avatar', () => {
  it('renders an img element inside a container div when src is provided', () => {
    const el = Avatar({ src: '/photo.jpg' }) as HTMLElement;
    expect(el.tagName).toBe('DIV');
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/photo.jpg');
  });

  it('sets alt attribute from props', () => {
    const el = Avatar({ src: '/photo.jpg', alt: 'Jane Doe' }) as HTMLElement;
    const img = el.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('Jane Doe');
  });

  it('renders default user icon SVG when no src and no fallback', () => {
    const el = Avatar({}) as HTMLElement;
    expect(el.innerHTML).toContain('<svg');
    // img is always in DOM but hidden when no src
    const img = el.querySelector('img');
    expect(img?.getAttribute('style')).toContain('display: none');
  });

  it('renders fallback content when no src and fallback function is provided', () => {
    const el = Avatar({ fallback: () => 'JD' }) as HTMLElement;
    expect(el.textContent).toContain('JD');
    // img is always in DOM but hidden when no src
    const img = el.querySelector('img');
    expect(img?.getAttribute('style')).toContain('display: none');
  });

  it('renders string fallback when no src', () => {
    const el = Avatar({ fallback: 'AB' }) as HTMLElement;
    expect(el.textContent).toBe('AB');
  });

  it('applies sm size styles', () => {
    const el = Avatar({ size: 'sm' }) as HTMLElement;
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('width: 32px');
    expect(style).toContain('height: 32px');
  });

  it('applies md size styles by default', () => {
    const el = Avatar({}) as HTMLElement;
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('width: 40px');
    expect(style).toContain('height: 40px');
  });

  it('applies lg size styles', () => {
    const el = Avatar({ size: 'lg' }) as HTMLElement;
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('width: 56px');
    expect(style).toContain('height: 56px');
  });

  it('applies custom class to container', () => {
    const el = Avatar({ class: 'custom-class' }) as HTMLElement;
    expect(el.getAttribute('class')).toBe('custom-class');
  });

  itWithNativeCompiler('switches to fallback when img fires onerror', () => {
    const el = Avatar({ src: '/broken.jpg' }) as HTMLElement;
    const img = el.querySelector('img');
    expect(img).not.toBeNull();

    img?.dispatchEvent(new Event('error'));

    // img is hidden, fallback is shown
    expect(img?.getAttribute('style')).toContain('display: none');
    expect(el.innerHTML).toContain('<svg');
  });

  itWithNativeCompiler('switches to custom fallback when img fires onerror', () => {
    const el = Avatar({ src: '/broken.jpg', fallback: () => 'FB' }) as HTMLElement;
    const img = el.querySelector('img');

    img?.dispatchEvent(new Event('error'));

    // img is hidden, fallback is shown
    expect(img?.getAttribute('style')).toContain('display: none');
    expect(el.textContent).toContain('FB');
  });

  it('renders rounded container with overflow hidden', () => {
    const el = Avatar({ src: '/photo.jpg' }) as HTMLElement;
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('border-radius: 9999px');
    expect(style).toContain('overflow: hidden');
  });
});
