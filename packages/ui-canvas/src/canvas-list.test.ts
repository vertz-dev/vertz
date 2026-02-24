import { describe, expect, it } from 'bun:test';
import { signal } from '@vertz/ui';
import { Container } from 'pixi.js';
import { canvasList } from './canvas-list';
import { jsxCanvas } from './jsx-canvas';

describe('Feature: canvasList — reactive list rendering for canvas', () => {
  describe('Given a signal array of items with a key function', () => {
    describe('When canvasList is called', () => {
      it('then creates display objects for each item and adds them to parent', () => {
        const parent = new Container();
        const items = signal([
          { id: 'a', x: 10 },
          { id: 'b', x: 20 },
        ]);

        canvasList(
          parent,
          () => items.value,
          (item) => jsxCanvas('Container', { x: item.x }),
          (item) => item.id,
        );

        expect(parent.children.length).toBe(2);
        expect(parent.children[0].x).toBe(10);
        expect(parent.children[1].x).toBe(20);
      });
    });
  });

  describe('Given a list that grows', () => {
    describe('When a new item is added to the signal', () => {
      it('then a new display object is created and added to parent', () => {
        const parent = new Container();
        const items = signal([{ id: 'a', x: 10 }]);

        canvasList(
          parent,
          () => items.value,
          (item) => jsxCanvas('Container', { x: item.x }),
          (item) => item.id,
        );

        expect(parent.children.length).toBe(1);

        items.value = [...items.value, { id: 'b', x: 20 }];
        expect(parent.children.length).toBe(2);
        expect(parent.children[1].x).toBe(20);
      });
    });
  });

  describe('Given a list that shrinks', () => {
    describe('When an item is removed from the signal', () => {
      it('then the corresponding display object is removed and destroyed', () => {
        const parent = new Container();
        const items = signal([
          { id: 'a', x: 10 },
          { id: 'b', x: 20 },
        ]);

        canvasList(
          parent,
          () => items.value,
          (item) => jsxCanvas('Container', { x: item.x }),
          (item) => item.id,
        );

        const removedChild = parent.children[1];
        items.value = [{ id: 'a', x: 10 }];

        expect(parent.children.length).toBe(1);
        expect(removedChild.destroyed).toBe(true);
      });
    });
  });

  describe('Given items are reordered', () => {
    describe('When the signal array order changes', () => {
      it('then display objects are reordered without re-creating', () => {
        const parent = new Container();
        const items = signal([
          { id: 'a', x: 10 },
          { id: 'b', x: 20 },
          { id: 'c', x: 30 },
        ]);

        canvasList(
          parent,
          () => items.value,
          (item) => jsxCanvas('Container', { x: item.x }),
          (item) => item.id,
        );

        const childA = parent.children[0];
        const childB = parent.children[1];
        const childC = parent.children[2];

        // Reverse order
        items.value = [
          { id: 'c', x: 30 },
          { id: 'b', x: 20 },
          { id: 'a', x: 10 },
        ];

        // Same objects, reordered
        expect(parent.children[0]).toBe(childC);
        expect(parent.children[1]).toBe(childB);
        expect(parent.children[2]).toBe(childA);
        // None destroyed
        expect(childA.destroyed).toBe(false);
        expect(childB.destroyed).toBe(false);
        expect(childC.destroyed).toBe(false);
      });
    });
  });

  describe('Given an empty list', () => {
    describe('When canvasList is called', () => {
      it('then no children are added to parent', () => {
        const parent = new Container();
        const items = signal<{ id: string; x: number }[]>([]);

        canvasList(
          parent,
          () => items.value,
          (item) => jsxCanvas('Container', { x: item.x }),
          (item) => item.id,
        );

        expect(parent.children.length).toBe(0);
      });
    });
  });

  describe('Given a list that is completely replaced', () => {
    describe('When all items change', () => {
      it('then old items are destroyed and new items are created', () => {
        const parent = new Container();
        const items = signal([
          { id: 'a', x: 10 },
          { id: 'b', x: 20 },
        ]);

        canvasList(
          parent,
          () => items.value,
          (item) => jsxCanvas('Container', { x: item.x }),
          (item) => item.id,
        );

        const oldA = parent.children[0];
        const oldB = parent.children[1];

        items.value = [
          { id: 'c', x: 30 },
          { id: 'd', x: 40 },
        ];

        expect(oldA.destroyed).toBe(true);
        expect(oldB.destroyed).toBe(true);
        expect(parent.children.length).toBe(2);
        expect(parent.children[0].x).toBe(30);
        expect(parent.children[1].x).toBe(40);
      });
    });
  });

  describe('Given a dispose function is returned', () => {
    describe('When dispose is called', () => {
      it('then all children are removed and destroyed', () => {
        const parent = new Container();
        const items = signal([
          { id: 'a', x: 10 },
          { id: 'b', x: 20 },
        ]);

        const dispose = canvasList(
          parent,
          () => items.value,
          (item) => jsxCanvas('Container', { x: item.x }),
          (item) => item.id,
        );

        const childA = parent.children[0];
        const childB = parent.children[1];

        dispose();

        expect(parent.children.length).toBe(0);
        expect(childA.destroyed).toBe(true);
        expect(childB.destroyed).toBe(true);
      });
    });
  });
});
