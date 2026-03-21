import { describe, expect, it } from 'bun:test';
import { withStyles } from '../composed/with-styles';
import type { EmptyStateClasses } from '../empty-state/empty-state-composed';
import { ComposedEmptyState } from '../empty-state/empty-state-composed';

const classes: EmptyStateClasses = {
  root: 'es-root',
  icon: 'es-icon',
  title: 'es-title',
  description: 'es-desc',
  action: 'es-action',
};

// Helper functions — Vertz compiler transforms JSX children into thunks
function RenderRoot() {
  return <ComposedEmptyState classes={classes}>hello</ComposedEmptyState>;
}
function RenderRootWithClassName() {
  return (
    <ComposedEmptyState classes={classes} className="custom">
      hi
    </ComposedEmptyState>
  );
}
function RenderRootNoClasses() {
  return <ComposedEmptyState>content</ComposedEmptyState>;
}
function RenderIcon() {
  return (
    <ComposedEmptyState classes={classes}>
      <ComposedEmptyState.Icon>
        <span data-testid="icon">ic</span>
      </ComposedEmptyState.Icon>
    </ComposedEmptyState>
  );
}
function RenderTitle() {
  return (
    <ComposedEmptyState classes={classes}>
      <ComposedEmptyState.Title>No items</ComposedEmptyState.Title>
    </ComposedEmptyState>
  );
}
function RenderDescription() {
  return (
    <ComposedEmptyState classes={classes}>
      <ComposedEmptyState.Description>Nothing here.</ComposedEmptyState.Description>
    </ComposedEmptyState>
  );
}
function RenderAction() {
  return (
    <ComposedEmptyState classes={classes}>
      <ComposedEmptyState.Action>
        <button type="button">Create</button>
      </ComposedEmptyState.Action>
    </ComposedEmptyState>
  );
}
function RenderTitleOnly() {
  return (
    <ComposedEmptyState>
      <ComposedEmptyState.Title>Empty</ComposedEmptyState.Title>
    </ComposedEmptyState>
  );
}
function RenderTitleWithClassName() {
  return (
    <ComposedEmptyState classes={classes}>
      <ComposedEmptyState.Title className="local">T</ComposedEmptyState.Title>
    </ComposedEmptyState>
  );
}
function RenderFullEmptyState() {
  return (
    <ComposedEmptyState classes={classes}>
      <ComposedEmptyState.Icon>
        <span data-testid="icon">icon</span>
      </ComposedEmptyState.Icon>
      <ComposedEmptyState.Title>No items</ComposedEmptyState.Title>
      <ComposedEmptyState.Description>Nothing here yet.</ComposedEmptyState.Description>
      <ComposedEmptyState.Action>
        <button type="button">Create</button>
      </ComposedEmptyState.Action>
    </ComposedEmptyState>
  );
}

describe('ComposedEmptyState', () => {
  describe('Root', () => {
    it('renders a div with no special role', () => {
      const el = RenderRoot();
      expect(el.tagName).toBe('DIV');
      expect(el.getAttribute('role')).toBeNull();
    });

    it('applies classes.root to the root element', () => {
      const el = RenderRoot();
      expect(el.className).toContain('es-root');
    });

    it('appends user className to root class', () => {
      const el = RenderRootWithClassName();
      expect(el.className).toContain('es-root');
      expect(el.className).toContain('custom');
    });

    it('renders without crashing when no classes provided', () => {
      const el = RenderRootNoClasses();
      expect(el.tagName).toBe('DIV');
      expect(el.textContent).toContain('content');
    });
  });

  describe('Sub-components receive classes from context', () => {
    it('Icon renders a div with icon class', () => {
      const el = RenderIcon();
      const icon = el.querySelector('.es-icon');
      expect(icon).not.toBeNull();
      expect(icon?.tagName).toBe('DIV');
      expect(icon?.querySelector('[data-testid="icon"]')).not.toBeNull();
    });

    it('Title renders as h3 with title class', () => {
      const el = RenderTitle();
      const title = el.querySelector('h3');
      expect(title).not.toBeNull();
      expect(title?.className).toContain('es-title');
      expect(title?.textContent).toBe('No items');
    });

    it('Description renders as p with description class', () => {
      const el = RenderDescription();
      const desc = el.querySelector('p');
      expect(desc).not.toBeNull();
      expect(desc?.className).toContain('es-desc');
      expect(desc?.textContent).toBe('Nothing here.');
    });

    it('Action renders a div with action class', () => {
      const el = RenderAction();
      const action = el.querySelector('.es-action');
      expect(action).not.toBeNull();
      expect(action?.querySelector('button')?.textContent).toBe('Create');
    });
  });

  describe('Minimal usage', () => {
    it('renders root with only title child', () => {
      const el = RenderTitleOnly();
      expect(el.querySelector('h3')?.textContent).toBe('Empty');
      expect(el.querySelector('p')).toBeNull();
    });
  });

  describe('Sub-components append user className', () => {
    it('Title merges context class with local className', () => {
      const el = RenderTitleWithClassName();
      const title = el.querySelector('h3');
      expect(title?.className).toContain('es-title');
      expect(title?.className).toContain('local');
    });
  });

  describe('Full EmptyState structure', () => {
    it('renders all sub-components in correct hierarchy', () => {
      const el = RenderFullEmptyState();
      expect(el.className).toContain('es-root');
      expect(el.querySelector('.es-icon')).not.toBeNull();
      expect(el.querySelector('h3')?.textContent).toBe('No items');
      expect(el.querySelector('p')?.textContent).toBe('Nothing here yet.');
      expect(el.querySelector('.es-action button')?.textContent).toBe('Create');
    });
  });

  describe('withStyles integration', () => {
    it('styled EmptyState preserves sub-components', () => {
      const Styled = withStyles(ComposedEmptyState, classes);
      expect(Styled.Icon).toBeDefined();
      expect(Styled.Title).toBeDefined();
      expect(Styled.Description).toBeDefined();
      expect(Styled.Action).toBeDefined();
    });
  });
});
