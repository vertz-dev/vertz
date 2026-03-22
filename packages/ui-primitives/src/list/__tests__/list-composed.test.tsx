import { describe, expect, it } from 'bun:test';
import { withStyles } from '../../composed/with-styles';
import type { ListClasses } from '../list-composed';
import { ComposedList } from '../list-composed';

const classes: ListClasses = {
  root: 'list-root',
  item: 'list-item',
  dragHandle: 'list-drag-handle',
};

// Helper functions — the Vertz compiler transforms JSX inside these
function RenderListRoot() {
  return (
    <ComposedList classes={classes}>
      <ComposedList.Item>Item A</ComposedList.Item>
    </ComposedList>
  );
}

function RenderListRootWithClass() {
  return (
    <ComposedList classes={classes} className="custom">
      <ComposedList.Item>hi</ComposedList.Item>
    </ComposedList>
  );
}

function RenderListNoClasses() {
  return (
    <ComposedList>
      <ComposedList.Item>content</ComposedList.Item>
    </ComposedList>
  );
}

function RenderListItemWithClass() {
  return (
    <ComposedList classes={classes}>
      <ComposedList.Item className="extra">item</ComposedList.Item>
    </ComposedList>
  );
}

function RenderDragHandle() {
  return (
    <ComposedList classes={classes}>
      <ComposedList.Item>
        <ComposedList.DragHandle>grip</ComposedList.DragHandle>
        content
      </ComposedList.Item>
    </ComposedList>
  );
}

function RenderFullList() {
  return (
    <ComposedList classes={classes}>
      <ComposedList.Item>First</ComposedList.Item>
      <ComposedList.Item>Second</ComposedList.Item>
      <ComposedList.Item>
        <ComposedList.DragHandle>drag</ComposedList.DragHandle>
        Third
      </ComposedList.Item>
    </ComposedList>
  );
}

describe('ComposedList', () => {
  describe('Root', () => {
    it('renders as <ul>', () => {
      const el = RenderListRoot();
      expect(el.tagName).toBe('UL');
    });

    it('applies root class from classes prop', () => {
      const el = RenderListRoot();
      expect(el.className).toContain('list-root');
    });

    it('appends user className to root class', () => {
      const el = RenderListRootWithClass();
      expect(el.className).toContain('list-root');
      expect(el.className).toContain('custom');
    });

    it('renders without crashing when no classes provided', () => {
      const el = RenderListNoClasses();
      expect(el.tagName).toBe('UL');
    });
  });

  describe('Item', () => {
    it('renders as <li>', () => {
      const el = RenderListRoot();
      const item = el.querySelector('li');
      expect(item).not.toBeNull();
    });

    it('applies item class from context', () => {
      const el = RenderListRoot();
      const item = el.querySelector('li');
      expect(item?.className).toContain('list-item');
    });

    it('appends user className', () => {
      const el = RenderListItemWithClass();
      const item = el.querySelector('li');
      expect(item?.className).toContain('list-item');
      expect(item?.className).toContain('extra');
    });

    it('renders children', () => {
      const el = RenderListRoot();
      const item = el.querySelector('li');
      expect(item?.textContent).toContain('Item A');
    });
  });

  describe('DragHandle', () => {
    it('renders children inside a container', () => {
      const el = RenderDragHandle();
      const handle = el.querySelector('[data-list-drag-handle]');
      expect(handle).not.toBeNull();
      expect(handle?.textContent).toBe('grip');
    });

    it('applies dragHandle class from context', () => {
      const el = RenderDragHandle();
      const handle = el.querySelector('[data-list-drag-handle]');
      expect(handle?.className).toContain('list-drag-handle');
    });
  });

  describe('Full structure', () => {
    it('renders complete list with all sub-components', () => {
      const el = RenderFullList();
      expect(el.tagName).toBe('UL');
      expect(el.className).toContain('list-root');

      const items = el.querySelectorAll('li');
      expect(items.length).toBe(3);

      const handle = el.querySelector('[data-list-drag-handle]');
      expect(handle).not.toBeNull();
    });
  });

  describe('withStyles integration', () => {
    it('styled list preserves sub-components', () => {
      const StyledList = withStyles(ComposedList, classes);
      expect(StyledList.Item).toBeDefined();
      expect(StyledList.DragHandle).toBeDefined();
    });
  });
});
