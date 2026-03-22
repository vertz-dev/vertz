import { describe, expect, it } from 'bun:test';
import { ComposedList } from '../list-composed';

const classes = {
  root: 'list-root',
  item: 'list-item',
};

function RenderAnimatedList() {
  return (
    <ComposedList classes={classes} animate>
      <ComposedList.Item>First</ComposedList.Item>
      <ComposedList.Item>Second</ComposedList.Item>
    </ComposedList>
  );
}

function RenderAnimatedListWithConfig() {
  return (
    <ComposedList classes={classes} animate={{ duration: 300, easing: 'ease-in-out' }}>
      <ComposedList.Item>First</ComposedList.Item>
    </ComposedList>
  );
}

function RenderNonAnimatedList() {
  return (
    <ComposedList classes={classes}>
      <ComposedList.Item>First</ComposedList.Item>
    </ComposedList>
  );
}

describe('ComposedList animation integration', () => {
  it('renders animated list without errors', () => {
    const el = RenderAnimatedList();
    expect(el.tagName).toBe('UL');
    expect(el.querySelectorAll('li').length).toBe(2);
  });

  it('renders with custom animation config without errors', () => {
    const el = RenderAnimatedListWithConfig();
    expect(el.tagName).toBe('UL');
  });

  it('renders non-animated list without errors', () => {
    const el = RenderNonAnimatedList();
    expect(el.tagName).toBe('UL');
  });
});
