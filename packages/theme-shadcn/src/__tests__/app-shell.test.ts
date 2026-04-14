import { describe, expect, it } from '@vertz/test';
import { isPathActive } from '../components/primitives/path-active';
import { createAppShell } from '../styles/app-shell';

// ── Style factory ─────────────────────────────────────────

describe('createAppShell styles', () => {
  const styles = createAppShell();

  it('returns all expected blocks', () => {
    expect(typeof styles.root).toBe('string');
    expect(typeof styles.sidebar).toBe('string');
    expect(typeof styles.brand).toBe('string');
    expect(typeof styles.nav).toBe('string');
    expect(typeof styles.navItem).toBe('string');
    expect(typeof styles.navItemActive).toBe('string');
    expect(typeof styles.content).toBe('string');
    expect(typeof styles.user).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(styles.root.length).toBeGreaterThan(0);
    expect(styles.sidebar.length).toBeGreaterThan(0);
    expect(styles.brand.length).toBeGreaterThan(0);
    expect(styles.nav.length).toBeGreaterThan(0);
    expect(styles.navItem.length).toBeGreaterThan(0);
    expect(styles.navItemActive.length).toBeGreaterThan(0);
    expect(styles.content.length).toBeGreaterThan(0);
    expect(styles.user.length).toBeGreaterThan(0);
  });

  it('generates CSS output', () => {
    expect(typeof styles.css).toBe('string');
    expect(styles.css.length).toBeGreaterThan(0);
  });
});

// ── isPathActive — prefix matching ────────────────────────

describe('isPathActive', () => {
  describe('exact matching', () => {
    it('matches identical paths', () => {
      expect(isPathActive('/dashboard', '/dashboard', 'exact')).toBe(true);
    });

    it('does not match different paths', () => {
      expect(isPathActive('/settings', '/dashboard', 'exact')).toBe(false);
    });

    it('does not match sub-paths', () => {
      expect(isPathActive('/dashboard/stats', '/dashboard', 'exact')).toBe(false);
    });

    it('matches root path exactly', () => {
      expect(isPathActive('/', '/', 'exact')).toBe(true);
    });

    it('does not match non-root when href is root', () => {
      expect(isPathActive('/dashboard', '/', 'exact')).toBe(false);
    });
  });

  describe('prefix matching', () => {
    it('matches exact path', () => {
      expect(isPathActive('/dashboard', '/dashboard', 'prefix')).toBe(true);
    });

    it('matches child path with slash boundary', () => {
      expect(isPathActive('/dashboard/stats', '/dashboard', 'prefix')).toBe(true);
    });

    it('does not match path that starts with href but no segment boundary', () => {
      // "/projects-archive" should NOT match href="/projects"
      expect(isPathActive('/projects-archive', '/projects', 'prefix')).toBe(false);
    });

    it('does not match unrelated path', () => {
      expect(isPathActive('/settings', '/dashboard', 'prefix')).toBe(false);
    });

    it('root href only matches root pathname', () => {
      // This is the critical edge case — "/" should NOT match all routes
      expect(isPathActive('/', '/', 'prefix')).toBe(true);
      expect(isPathActive('/dashboard', '/', 'prefix')).toBe(false);
      expect(isPathActive('/settings/profile', '/', 'prefix')).toBe(false);
    });

    it('matches deeply nested child paths', () => {
      expect(isPathActive('/projects/123/tasks/456', '/projects', 'prefix')).toBe(true);
    });
  });
});
