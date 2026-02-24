import { describe, expect, it } from 'bun:test';
import { useContext } from '@vertz/ui';
import { Container } from 'pixi.js';
import { CanvasLayer, type CanvasLayerProps, CanvasRenderContext } from './canvas-layer';

describe('Feature: CanvasRenderContext', () => {
  describe('Given the CanvasRenderContext', () => {
    it('then it is a valid context object with a Provider', () => {
      expect(CanvasRenderContext).toBeDefined();
      expect(CanvasRenderContext.Provider).toBeDefined();
      expect(typeof CanvasRenderContext.Provider).toBe('function');
    });

    it('then its default value is null', () => {
      const value = useContext(CanvasRenderContext);
      expect(value).toBeNull();
    });

    it('then Provider makes a Container available via useContext', () => {
      const stage = new Container();
      let captured: Container | null = null;

      CanvasRenderContext.Provider(stage, () => {
        captured = useContext(CanvasRenderContext) ?? null;
      });

      expect(captured).toBe(stage);
    });

    it('then value reverts to null outside the Provider scope', () => {
      const stage = new Container();

      CanvasRenderContext.Provider(stage, () => {
        expect(useContext(CanvasRenderContext)).toBe(stage);
      });

      expect(useContext(CanvasRenderContext)).toBeNull();
    });
  });
});

describe('Feature: CanvasLayerProps type', () => {
  describe('Given the CanvasLayerProps interface', () => {
    it('then it accepts width and height as required properties', () => {
      const props: CanvasLayerProps = {
        width: 800,
        height: 600,
      };
      expect(props.width).toBe(800);
      expect(props.height).toBe(600);
    });

    it('then it accepts optional background and debug', () => {
      const props: CanvasLayerProps = {
        width: 800,
        height: 600,
        background: 0x1a1a2e,
        debug: true,
      };
      expect(props.background).toBe(0x1a1a2e);
      expect(props.debug).toBe(true);
    });
  });
});

describe('Feature: CanvasLayer component', () => {
  describe('Given the CanvasLayer function', () => {
    it('then it is exported and callable', () => {
      expect(typeof CanvasLayer).toBe('function');
    });
  });

  describe('Given a nested CanvasLayer inside a CanvasRenderContext', () => {
    describe('When CanvasLayer is called', () => {
      it('then it throws an error forbidding nesting', () => {
        const stage = new Container();
        CanvasRenderContext.Provider(stage, () => {
          expect(() => CanvasLayer({ width: 400, height: 300 })).toThrow(
            '<CanvasLayer> cannot be nested inside another <CanvasLayer>',
          );
        });
      });
    });
  });
});
