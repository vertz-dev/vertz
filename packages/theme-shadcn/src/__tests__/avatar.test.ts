import { describe, expect, it } from 'bun:test';
import { configureTheme } from '../configure';
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

describe('Avatar component (composed)', () => {
  const theme = configureTheme();
  const { Avatar } = theme.components;

  it('Avatar renders a div with root class', () => {
    const el = Avatar({}) as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain(theme.styles.avatar.root);
  });

  it('Avatar appends user class', () => {
    const el = Avatar({ className: 'custom-avatar' }) as HTMLElement;
    expect(el.className).toContain('custom-avatar');
    expect(el.className).toContain(theme.styles.avatar.root);
  });

  it('Avatar resolves children', () => {
    const el = Avatar({ children: 'content' }) as HTMLElement;
    expect(el.textContent).toContain('content');
  });

  it('Avatar has Image and Fallback sub-components', () => {
    expect(Avatar.Image).toBeDefined();
    expect(Avatar.Fallback).toBeDefined();
  });
});
