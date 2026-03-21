import { describe, expect, it } from 'bun:test';
import { configureTheme } from '../configure';

const theme = configureTheme();

function RenderEmptyState() {
  const EmptyState = theme.components.EmptyState;
  return (
    <EmptyState>
      <EmptyState.Icon>
        <span data-testid="icon">ic</span>
      </EmptyState.Icon>
      <EmptyState.Title>No items</EmptyState.Title>
      <EmptyState.Description>Nothing here yet.</EmptyState.Description>
      <EmptyState.Action>
        <button type="button">Create</button>
      </EmptyState.Action>
    </EmptyState>
  );
}

function RenderEmptyStateMinimal() {
  const EmptyState = theme.components.EmptyState;
  return (
    <EmptyState>
      <EmptyState.Title>Empty</EmptyState.Title>
    </EmptyState>
  );
}

describe('EmptyState component (themed)', () => {
  it('renders root with theme classes', () => {
    const el = RenderEmptyState() as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.className).toContain(theme.styles.emptyState.root);
  });

  it('renders title as h3 with theme classes', () => {
    const el = RenderEmptyState();
    const h3 = el.querySelector('h3');
    expect(h3).not.toBeNull();
    expect(h3?.className).toContain(theme.styles.emptyState.title);
    expect(h3?.textContent).toBe('No items');
  });

  it('renders description as p with theme classes', () => {
    const el = RenderEmptyState();
    const p = el.querySelector('p');
    expect(p).not.toBeNull();
    expect(p?.className).toContain(theme.styles.emptyState.description);
  });

  it('renders icon slot with theme classes', () => {
    const el = RenderEmptyState();
    const icon = el.querySelector(`div.${CSS.escape(theme.styles.emptyState.icon)}`);
    expect(icon).not.toBeNull();
  });

  it('renders action slot', () => {
    const el = RenderEmptyState();
    expect(el.querySelector('button')?.textContent).toBe('Create');
  });

  it('preserves sub-components via withStyles', () => {
    const EmptyState = theme.components.EmptyState;
    expect(EmptyState.Icon).toBeDefined();
    expect(EmptyState.Title).toBeDefined();
    expect(EmptyState.Description).toBeDefined();
    expect(EmptyState.Action).toBeDefined();
  });

  it('renders minimal usage with just Title', () => {
    const el = RenderEmptyStateMinimal();
    expect(el.querySelector('h3')?.textContent).toBe('Empty');
  });
});
