import { Container, Graphics, Text } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createDebugOverlay } from './debug-overlay';

describe('Feature: Canvas Debug Overlay', () => {
  describe('Given a stage with display objects', () => {
    describe('When createDebugOverlay is called', () => {
      it('then creates an overlay container', () => {
        const stage = new Container();
        const child = new Container();
        child.label = 'TestChild';
        stage.addChild(child);

        const debug = createDebugOverlay(stage);
        expect(debug.overlay).toBeInstanceOf(Container);
        expect(debug.overlay.label).toBe('__debug_overlay');

        debug.destroy();
      });
    });

    describe('When update is called', () => {
      it('then overlay has children (bounding boxes and labels)', () => {
        const stage = new Container();
        const child = new Container();
        child.label = 'Player';
        stage.addChild(child);

        const debug = createDebugOverlay(stage);
        debug.update();

        expect(debug.overlay.children.length).toBeGreaterThan(0);

        debug.destroy();
      });
    });
  });

  describe('Given a stage with labeled children', () => {
    describe('When update is called', () => {
      it('then draws labels for labeled containers', () => {
        const stage = new Container();
        const child = new Container();
        child.label = 'Enemy';
        stage.addChild(child);

        const debug = createDebugOverlay(stage);
        debug.update();

        // Should have at least one Text child for the label
        const textChildren = debug.overlay.children.filter(
          (c) => c instanceof Text,
        );
        expect(textChildren.length).toBeGreaterThan(0);

        debug.destroy();
      });
    });
  });

  describe('Given a stage with unlabeled children', () => {
    describe('When update is called', () => {
      it('then draws bounding boxes but no labels for unlabeled containers', () => {
        const stage = new Container();
        const child = new Container();
        // No label set
        stage.addChild(child);

        const debug = createDebugOverlay(stage);
        debug.update();

        // Should still have bounding box graphics
        const graphicsChildren = debug.overlay.children.filter(
          (c) => c instanceof Graphics,
        );
        expect(graphicsChildren.length).toBeGreaterThan(0);

        // No text labels for unlabeled children
        const textChildren = debug.overlay.children.filter(
          (c) => c instanceof Text,
        );
        expect(textChildren.length).toBe(0);

        debug.destroy();
      });
    });
  });

  describe('Given update is called multiple times', () => {
    describe('When update runs again', () => {
      it('then clears previous debug graphics before redrawing', () => {
        const stage = new Container();
        stage.addChild(new Container());

        const debug = createDebugOverlay(stage);

        debug.update();
        const firstCount = debug.overlay.children.length;

        debug.update();
        const secondCount = debug.overlay.children.length;

        // Should be the same count (cleared and redrawn, not accumulated)
        expect(secondCount).toBe(firstCount);

        debug.destroy();
      });
    });
  });

  describe('Given the debug overlay itself is in the stage', () => {
    describe('When update is called', () => {
      it('then skips drawing debug graphics for the overlay itself', () => {
        const stage = new Container();
        const child = new Container();
        child.label = 'Player';
        stage.addChild(child);

        const debug = createDebugOverlay(stage);
        stage.addChild(debug.overlay);

        debug.update();

        // Should not have drawn a box for the overlay itself
        // The overlay's children should only be for 'Player', not '__debug_overlay'
        const labels = debug.overlay.children.filter(
          (c) => c instanceof Text && (c as Text).text === '__debug_overlay',
        );
        expect(labels.length).toBe(0);

        debug.destroy();
      });
    });
  });

  describe('Given debug overlay is destroyed', () => {
    describe('When destroy is called', () => {
      it('then all debug graphics are cleaned up', () => {
        const stage = new Container();
        stage.addChild(new Container());

        const debug = createDebugOverlay(stage);
        debug.update();
        debug.destroy();

        expect(debug.overlay.destroyed).toBe(true);
      });
    });
  });
});
