import { signal } from '@vertz/ui';
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { canvasConditional } from './canvas-conditional';
import { jsxCanvas } from './jsx-canvas';

describe('Feature: canvasConditional — conditional rendering for canvas', () => {
  describe('Given a truthy condition', () => {
    describe('When canvasConditional is called', () => {
      it('then the display object is created and added to parent', () => {
        const parent = new Container();
        const show = signal(true);

        canvasConditional(
          parent,
          () => show.value,
          () => jsxCanvas('Container', { x: 42 }),
        );

        expect(parent.children.length).toBe(1);
        expect(parent.children[0].x).toBe(42);
      });
    });
  });

  describe('Given a falsy condition', () => {
    describe('When canvasConditional is called', () => {
      it('then no display object is added to parent', () => {
        const parent = new Container();
        const show = signal(false);

        canvasConditional(
          parent,
          () => show.value,
          () => jsxCanvas('Container', { x: 42 }),
        );

        expect(parent.children.length).toBe(0);
      });
    });
  });

  describe('Given a condition that becomes true', () => {
    describe('When the signal changes from false to true', () => {
      it('then the display object is created and added', () => {
        const parent = new Container();
        const show = signal(false);

        canvasConditional(
          parent,
          () => show.value,
          () => jsxCanvas('Container', { x: 99 }),
        );

        expect(parent.children.length).toBe(0);

        show.value = true;
        expect(parent.children.length).toBe(1);
        expect(parent.children[0].x).toBe(99);
      });
    });
  });

  describe('Given a condition that becomes false', () => {
    describe('When the signal changes from true to false', () => {
      it('then the display object is removed and destroyed', () => {
        const parent = new Container();
        const show = signal(true);

        canvasConditional(
          parent,
          () => show.value,
          () => jsxCanvas('Container', { x: 50 }),
        );

        const child = parent.children[0];
        expect(child).toBeDefined();

        show.value = false;
        expect(parent.children.length).toBe(0);
        expect(child.destroyed).toBe(true);
      });
    });
  });

  describe('Given a condition that toggles multiple times', () => {
    describe('When toggling true -> false -> true', () => {
      it('then a fresh display object is created each time', () => {
        const parent = new Container();
        const show = signal(true);

        canvasConditional(
          parent,
          () => show.value,
          () => jsxCanvas('Container', { x: 10 }),
        );

        const first = parent.children[0];

        show.value = false;
        expect(parent.children.length).toBe(0);
        expect(first.destroyed).toBe(true);

        show.value = true;
        expect(parent.children.length).toBe(1);
        // New instance, not the same destroyed one
        expect(parent.children[0]).not.toBe(first);
      });
    });
  });

  describe('Given an optional fallback factory', () => {
    describe('When condition is false and fallback is provided', () => {
      it('then the fallback display object is shown', () => {
        const parent = new Container();
        const show = signal(false);

        canvasConditional(
          parent,
          () => show.value,
          () => jsxCanvas('Container', { x: 1 }),
          () => jsxCanvas('Container', { x: 2 }),
        );

        expect(parent.children.length).toBe(1);
        expect(parent.children[0].x).toBe(2);
      });
    });

    describe('When condition switches from false to true', () => {
      it('then fallback is removed and main is shown', () => {
        const parent = new Container();
        const show = signal(false);

        canvasConditional(
          parent,
          () => show.value,
          () => jsxCanvas('Container', { x: 1 }),
          () => jsxCanvas('Container', { x: 2 }),
        );

        const fallback = parent.children[0];
        expect(fallback.x).toBe(2);

        show.value = true;
        expect(parent.children.length).toBe(1);
        expect(parent.children[0].x).toBe(1);
        expect(fallback.destroyed).toBe(true);
      });
    });
  });

  describe('Given a dispose function is returned', () => {
    describe('When dispose is called', () => {
      it('then the current display object is removed and destroyed', () => {
        const parent = new Container();
        const show = signal(true);

        const dispose = canvasConditional(
          parent,
          () => show.value,
          () => jsxCanvas('Container', { x: 10 }),
        );

        const child = parent.children[0];

        dispose();
        expect(parent.children.length).toBe(0);
        expect(child.destroyed).toBe(true);
      });
    });
  });
});
