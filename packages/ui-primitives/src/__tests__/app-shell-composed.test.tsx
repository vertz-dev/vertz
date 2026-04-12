import { describe, expect, it } from '@vertz/test';
import type { AppShellClasses } from '../app-shell/app-shell-composed';
import { ComposedAppShell } from '../app-shell/app-shell-composed';
import { withStyles } from '../composed/with-styles';

const classes: AppShellClasses = {
  root: 'shell-root',
  sidebar: 'shell-sidebar',
  brand: 'shell-brand',
  nav: 'shell-nav',
  navItem: 'shell-nav-item',
  navItemActive: 'shell-nav-item-active',
  content: 'shell-content',
  user: 'shell-user',
};

// Helper functions — Vertz compiler transforms JSX inside these

function RenderRoot() {
  return <ComposedAppShell classes={classes}>hello</ComposedAppShell>;
}
function RenderRootWithClass() {
  return (
    <ComposedAppShell classes={classes} className="custom">
      hi
    </ComposedAppShell>
  );
}
function RenderRootNoClasses() {
  return <ComposedAppShell>content</ComposedAppShell>;
}
function RenderSidebar() {
  return (
    <ComposedAppShell classes={classes}>
      <ComposedAppShell.Sidebar>sidebar</ComposedAppShell.Sidebar>
    </ComposedAppShell>
  );
}
function RenderBrand() {
  return (
    <ComposedAppShell classes={classes}>
      <ComposedAppShell.Brand>My App</ComposedAppShell.Brand>
    </ComposedAppShell>
  );
}
function RenderNav() {
  return (
    <ComposedAppShell classes={classes}>
      <ComposedAppShell.Nav>nav items</ComposedAppShell.Nav>
    </ComposedAppShell>
  );
}
function RenderContent() {
  return (
    <ComposedAppShell classes={classes}>
      <ComposedAppShell.Content>page content</ComposedAppShell.Content>
    </ComposedAppShell>
  );
}
function RenderUser() {
  return (
    <ComposedAppShell classes={classes}>
      <ComposedAppShell.User>John</ComposedAppShell.User>
    </ComposedAppShell>
  );
}
function RenderSidebarWithClass() {
  return (
    <ComposedAppShell classes={classes}>
      <ComposedAppShell.Sidebar className="extra">s</ComposedAppShell.Sidebar>
    </ComposedAppShell>
  );
}
function RenderBrandWithClass() {
  return (
    <ComposedAppShell classes={classes}>
      <ComposedAppShell.Brand className="extra">b</ComposedAppShell.Brand>
    </ComposedAppShell>
  );
}
function RenderFullShell() {
  return (
    <ComposedAppShell classes={classes}>
      <ComposedAppShell.Sidebar>
        <ComposedAppShell.Brand>App</ComposedAppShell.Brand>
        <ComposedAppShell.Nav>nav</ComposedAppShell.Nav>
        <ComposedAppShell.User>user</ComposedAppShell.User>
      </ComposedAppShell.Sidebar>
      <ComposedAppShell.Content>main</ComposedAppShell.Content>
    </ComposedAppShell>
  );
}
function RenderUnstyled() {
  return (
    <ComposedAppShell>
      <ComposedAppShell.Sidebar>s</ComposedAppShell.Sidebar>
    </ComposedAppShell>
  );
}

describe('ComposedAppShell', () => {
  describe('Root', () => {
    it('renders a div with data-part="app-shell"', () => {
      const el = RenderRoot();
      expect(el.tagName).toBe('DIV');
      expect(el.getAttribute('data-part')).toBe('app-shell');
    });

    it('applies root class from classes prop', () => {
      const el = RenderRoot();
      expect(el.className).toContain('shell-root');
    });

    it('appends user className to root class', () => {
      const el = RenderRootWithClass();
      expect(el.className).toContain('shell-root');
      expect(el.className).toContain('custom');
    });

    it('renders children', () => {
      const el = RenderRootNoClasses();
      expect(el.textContent).toContain('content');
    });
  });

  describe('Sub-components receive classes from context', () => {
    it('Sidebar renders as aside with sidebar class and data-part', () => {
      const el = RenderSidebar();
      const sidebar = el.querySelector('aside');
      expect(sidebar).not.toBeNull();
      expect(sidebar?.className).toContain('shell-sidebar');
      expect(sidebar?.getAttribute('data-part')).toBe('sidebar');
      expect(sidebar?.textContent).toBe('sidebar');
    });

    it('Brand renders as div with brand class and data-part', () => {
      const el = RenderBrand();
      const brand = el.querySelector('[data-part="brand"]');
      expect(brand).not.toBeNull();
      expect(brand?.className).toContain('shell-brand');
      expect(brand?.textContent).toBe('My App');
    });

    it('Nav renders as nav element with nav class and data-part', () => {
      const el = RenderNav();
      const nav = el.querySelector('nav');
      expect(nav).not.toBeNull();
      expect(nav?.className).toContain('shell-nav');
      expect(nav?.getAttribute('data-part')).toBe('nav');
      expect(nav?.textContent).toBe('nav items');
    });

    it('Content renders as main element with content class and data-part', () => {
      const el = RenderContent();
      const content = el.querySelector('main');
      expect(content).not.toBeNull();
      expect(content?.className).toContain('shell-content');
      expect(content?.getAttribute('data-part')).toBe('content');
      expect(content?.textContent).toBe('page content');
    });

    it('User renders as div with user class and data-part', () => {
      const el = RenderUser();
      const user = el.querySelector('[data-part="user"]');
      expect(user).not.toBeNull();
      expect(user?.className).toContain('shell-user');
      expect(user?.textContent).toBe('John');
    });
  });

  describe('Sub-components append user classes', () => {
    it('Sidebar appends user className', () => {
      const el = RenderSidebarWithClass();
      const sidebar = el.querySelector('aside');
      expect(sidebar?.className).toContain('shell-sidebar');
      expect(sidebar?.className).toContain('extra');
    });

    it('Brand appends user className', () => {
      const el = RenderBrandWithClass();
      const brand = el.querySelector('[data-part="brand"]');
      expect(brand?.className).toContain('shell-brand');
      expect(brand?.className).toContain('extra');
    });
  });

  describe('withStyles integration', () => {
    it('styled AppShell preserves sub-components', () => {
      const StyledShell = withStyles(ComposedAppShell, classes);
      expect(StyledShell.Sidebar).toBeDefined();
      expect(StyledShell.Brand).toBeDefined();
      expect(StyledShell.Nav).toBeDefined();
      expect(StyledShell.Content).toBeDefined();
      expect(StyledShell.User).toBeDefined();
    });
  });

  describe('Full shell structure', () => {
    it('renders complete shell with all sub-components', () => {
      const el = RenderFullShell();
      expect(el.className).toContain('shell-root');
      expect(el.getAttribute('data-part')).toBe('app-shell');
      expect(el.querySelector('aside[data-part="sidebar"]')).not.toBeNull();
      expect(el.querySelector('[data-part="brand"]')).not.toBeNull();
      expect(el.querySelector('nav[data-part="nav"]')).not.toBeNull();
      expect(el.querySelector('[data-part="user"]')).not.toBeNull();
      expect(el.querySelector('main[data-part="content"]')).not.toBeNull();
    });
  });

  describe('Without classes (unstyled)', () => {
    it('renders without crashing when no classes provided', () => {
      const el = RenderUnstyled();
      expect(el.tagName).toBe('DIV');
      expect(el.getAttribute('data-part')).toBe('app-shell');
    });
  });
});
