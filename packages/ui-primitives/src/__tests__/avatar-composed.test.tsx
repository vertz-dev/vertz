import { describe, expect, it } from 'bun:test';
import type { AvatarClasses } from '../avatar/avatar-composed';
import { ComposedAvatar } from '../avatar/avatar-composed';
import { withStyles } from '../composed/with-styles';

const classes: AvatarClasses = {
  root: 'avatar-root',
  image: 'avatar-image',
  fallback: 'avatar-fallback',
};

function RenderAvatarRoot() {
  return <ComposedAvatar classes={classes}>av</ComposedAvatar>;
}
function RenderAvatarPlain() {
  return <ComposedAvatar>av</ComposedAvatar>;
}
function RenderAvatarWithClass() {
  return (
    <ComposedAvatar classes={classes} className="custom">
      av
    </ComposedAvatar>
  );
}
function RenderAvatarImage() {
  return (
    <ComposedAvatar classes={classes}>
      <ComposedAvatar.Image src="/photo.jpg" alt="User" />
    </ComposedAvatar>
  );
}
function RenderAvatarImageWithClass() {
  return (
    <ComposedAvatar classes={classes}>
      <ComposedAvatar.Image src="/photo.jpg" alt="User" className="extra" />
    </ComposedAvatar>
  );
}
function RenderAvatarFallback() {
  return (
    <ComposedAvatar classes={classes}>
      <ComposedAvatar.Fallback>JD</ComposedAvatar.Fallback>
    </ComposedAvatar>
  );
}
function RenderAvatarFallbackWithClass() {
  return (
    <ComposedAvatar classes={classes}>
      <ComposedAvatar.Fallback className="extra">JD</ComposedAvatar.Fallback>
    </ComposedAvatar>
  );
}
function RenderUnstyled() {
  return (
    <ComposedAvatar>
      <ComposedAvatar.Fallback>AB</ComposedAvatar.Fallback>
    </ComposedAvatar>
  );
}

describe('ComposedAvatar', () => {
  describe('Root', () => {
    it('renders a div', () => {
      const el = RenderAvatarPlain();
      expect(el.tagName).toBe('DIV');
    });

    it('applies root class from classes prop', () => {
      const el = RenderAvatarRoot();
      const inner = el.querySelector('.avatar-root') ?? el;
      expect(inner.className).toContain('avatar-root');
    });

    it('appends user className', () => {
      const el = RenderAvatarWithClass();
      const inner = el.querySelector('.avatar-root') ?? el;
      expect(inner.className).toContain('avatar-root');
      expect(inner.className).toContain('custom');
    });
  });

  describe('Image sub-component', () => {
    it('renders as img with image class from context', () => {
      const el = RenderAvatarImage();
      const img = el.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.className).toContain('avatar-image');
      expect(img?.getAttribute('src')).toBe('/photo.jpg');
      expect(img?.getAttribute('alt')).toBe('User');
    });

    it('appends user className to image', () => {
      const el = RenderAvatarImageWithClass();
      const img = el.querySelector('img');
      expect(img?.className).toContain('avatar-image');
      expect(img?.className).toContain('extra');
    });
  });

  describe('Fallback sub-component', () => {
    it('renders as div with fallback class from context', () => {
      const el = RenderAvatarFallback();
      const fallback = el.querySelector('.avatar-fallback');
      expect(fallback).not.toBeNull();
      expect(fallback?.textContent).toBe('JD');
    });

    it('appends user className to fallback', () => {
      const el = RenderAvatarFallbackWithClass();
      const fallback = el.querySelector('.avatar-fallback');
      expect(fallback?.className).toContain('avatar-fallback');
      expect(fallback?.className).toContain('extra');
    });
  });

  describe('withStyles integration', () => {
    it('styled avatar preserves sub-components', () => {
      const StyledAvatar = withStyles(ComposedAvatar, classes);
      expect(StyledAvatar.Image).toBeDefined();
      expect(StyledAvatar.Fallback).toBeDefined();
    });
  });

  describe('Without classes (unstyled)', () => {
    it('renders without crashing when no classes provided', () => {
      const el = RenderUnstyled();
      expect(el.tagName).toBe('DIV');
      expect(el.textContent).toContain('AB');
    });
  });
});
