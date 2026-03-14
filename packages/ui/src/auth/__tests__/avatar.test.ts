import { describe, expect, it } from 'bun:test';
import { __element, __staticText } from '../../dom/element';
import { Avatar } from '../avatar';

describe('Avatar', () => {
  it('renders an <img> element inside a container div when src is provided', () => {
    const el = Avatar({ src: '/photo.jpg' });
    expect(el.tagName).toBe('DIV');
    const img = el.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('/photo.jpg');
  });

  it('sets alt attribute from props', () => {
    const el = Avatar({ src: '/photo.jpg', alt: 'Jane Doe' });
    const img = el.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('Jane Doe');
  });

  it('renders default user icon SVG when no src and no fallback', () => {
    const el = Avatar({});
    expect(el.innerHTML).toContain('<svg');
    expect(el.querySelector('img')).toBeNull();
  });

  it('renders fallback content when no src and fallback function is provided', () => {
    const fallbackSpan = __element('span');
    fallbackSpan.textContent = 'JD';
    const el = Avatar({ fallback: () => fallbackSpan });
    expect(el.textContent).toBe('JD');
    expect(el.querySelector('img')).toBeNull();
  });

  it('renders string fallback when no src', () => {
    const el = Avatar({ fallback: 'AB' });
    expect(el.textContent).toBe('AB');
  });

  it('applies sm size styles', () => {
    const el = Avatar({ size: 'sm' });
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('width:32px');
    expect(style).toContain('height:32px');
  });

  it('applies md size styles by default', () => {
    const el = Avatar({});
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('width:40px');
    expect(style).toContain('height:40px');
  });

  it('applies lg size styles', () => {
    const el = Avatar({ size: 'lg' });
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('width:56px');
    expect(style).toContain('height:56px');
  });

  it('applies custom class to container', () => {
    const el = Avatar({ class: 'custom-class' });
    expect(el.getAttribute('class')).toBe('custom-class');
  });

  it('switches to fallback when img fires onerror', () => {
    const el = Avatar({ src: '/broken.jpg' });
    const img = el.querySelector('img');
    expect(img).not.toBeNull();

    // Simulate onerror
    img?.dispatchEvent(new Event('error'));

    // After error, img should be gone, fallback icon should be present
    expect(el.querySelector('img')).toBeNull();
    expect(el.innerHTML).toContain('<svg');
  });

  it('switches to custom fallback when img fires onerror', () => {
    const fallbackEl = __element('span');
    fallbackEl.appendChild(__staticText('FB'));
    const el = Avatar({ src: '/broken.jpg', fallback: () => fallbackEl });
    const img = el.querySelector('img');

    // Simulate onerror
    img?.dispatchEvent(new Event('error'));

    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('FB');
  });

  it('renders rounded container with overflow hidden', () => {
    const el = Avatar({ src: '/photo.jpg' });
    const style = el.getAttribute('style') ?? '';
    expect(style).toContain('border-radius:9999px');
    expect(style).toContain('overflow:hidden');
  });
});
