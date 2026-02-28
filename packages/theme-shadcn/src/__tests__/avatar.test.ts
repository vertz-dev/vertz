import { describe, expect, it } from 'bun:test';
import { createAvatarComponents } from '../components/avatar';
import { createAvatarStyles } from '../styles/avatar';

describe('avatar styles', () => {
  const avatar = createAvatarStyles();

  it('has root, image, and fallback blocks', () => {
    expect(typeof avatar.root).toBe('string');
    expect(typeof avatar.image).toBe('string');
    expect(typeof avatar.fallback).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(avatar.root.length).toBeGreaterThan(0);
    expect(avatar.image.length).toBeGreaterThan(0);
    expect(avatar.fallback.length).toBeGreaterThan(0);
  });

  it('has size variant blocks for root', () => {
    expect(typeof avatar.rootSm).toBe('string');
    expect(typeof avatar.rootLg).toBe('string');
    expect(typeof avatar.rootXl).toBe('string');
    expect(avatar.rootSm.length).toBeGreaterThan(0);
    expect(avatar.rootLg.length).toBeGreaterThan(0);
    expect(avatar.rootXl.length).toBeGreaterThan(0);
  });

  it('has size variant blocks for fallback', () => {
    expect(typeof avatar.fallbackSm).toBe('string');
    expect(typeof avatar.fallbackLg).toBe('string');
    expect(typeof avatar.fallbackXl).toBe('string');
    expect(avatar.fallbackSm.length).toBeGreaterThan(0);
    expect(avatar.fallbackLg.length).toBeGreaterThan(0);
    expect(avatar.fallbackXl.length).toBeGreaterThan(0);
  });
});

describe('Avatar components', () => {
  const styles = createAvatarStyles();
  const { Avatar, AvatarImage, AvatarFallback } = createAvatarComponents(styles);

  it('Avatar returns an HTMLDivElement with root class', () => {
    const el = Avatar({});
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.className).toContain(styles.root);
  });

  it('Avatar appends user class', () => {
    const el = Avatar({ class: 'custom-avatar' });
    expect(el.className).toContain('custom-avatar');
    expect(el.className).toContain(styles.root);
  });

  it('Avatar resolves children', () => {
    const el = Avatar({ children: 'content' });
    expect(el.textContent).toBe('content');
  });

  it('AvatarImage returns an HTMLImageElement with src and alt', () => {
    const el = AvatarImage({ src: 'https://example.com/photo.jpg', alt: 'User photo' });
    expect(el).toBeInstanceOf(HTMLImageElement);
    expect(el.src).toBe('https://example.com/photo.jpg');
    expect(el.alt).toBe('User photo');
    expect(el.className).toContain(styles.image);
  });

  it('AvatarImage appends user class', () => {
    const el = AvatarImage({ src: 'img.jpg', alt: 'test', class: 'extra' });
    expect(el.className).toContain('extra');
    expect(el.className).toContain(styles.image);
  });

  it('AvatarFallback returns an HTMLDivElement with fallback class', () => {
    const el = AvatarFallback({});
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.className).toContain(styles.fallback);
  });

  it('AvatarFallback renders children', () => {
    const el = AvatarFallback({ children: 'JD' });
    expect(el.textContent).toBe('JD');
  });

  it('AvatarFallback appends user class', () => {
    const el = AvatarFallback({ class: 'custom-fallback' });
    expect(el.className).toContain('custom-fallback');
    expect(el.className).toContain(styles.fallback);
  });
});
