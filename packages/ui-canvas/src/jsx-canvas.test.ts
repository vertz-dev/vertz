import { effect, onCleanup, signal } from '@vertz/ui';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { isCanvasIntrinsic, jsxCanvas } from './jsx-canvas';

describe('Feature: isCanvasIntrinsic', () => {
  describe('Given a known canvas tag name', () => {
    it('then returns true for Graphics', () => {
      expect(isCanvasIntrinsic('Graphics')).toBe(true);
    });
    it('then returns true for Container', () => {
      expect(isCanvasIntrinsic('Container')).toBe(true);
    });
    it('then returns true for Sprite', () => {
      expect(isCanvasIntrinsic('Sprite')).toBe(true);
    });
    it('then returns true for Text', () => {
      expect(isCanvasIntrinsic('Text')).toBe(true);
    });
  });

  describe('Given an unknown tag name', () => {
    it('then returns false for div', () => {
      expect(isCanvasIntrinsic('div')).toBe(false);
    });
    it('then returns false for canvas', () => {
      expect(isCanvasIntrinsic('canvas')).toBe(false);
    });
  });
});

describe('Feature: jsxCanvas display object creation', () => {
  describe('Given tag "Container"', () => {
    describe('When jsxCanvas is called', () => {
      it('then returns a PixiJS Container instance', () => {
        const obj = jsxCanvas('Container', {});
        expect(obj).toBeInstanceOf(Container);
      });
    });
  });

  describe('Given tag "Graphics"', () => {
    describe('When jsxCanvas is called', () => {
      it('then returns a PixiJS Graphics instance', () => {
        const obj = jsxCanvas('Graphics', { draw: () => {} });
        expect(obj).toBeInstanceOf(Graphics);
      });
    });
  });

  describe('Given tag "Sprite"', () => {
    describe('When jsxCanvas is called', () => {
      it('then returns a PixiJS Sprite instance', () => {
        const obj = jsxCanvas('Sprite', {});
        expect(obj).toBeInstanceOf(Sprite);
      });
    });
  });

  describe('Given tag "Text"', () => {
    describe('When jsxCanvas is called', () => {
      it('then returns a PixiJS Text instance', () => {
        const obj = jsxCanvas('Text', {});
        expect(obj).toBeInstanceOf(Text);
      });
    });
  });

  describe('Given an unknown tag', () => {
    describe('When jsxCanvas is called', () => {
      it('then throws an error', () => {
        expect(() => jsxCanvas('Unknown', {})).toThrow('Unknown canvas element: <Unknown>');
      });
    });
  });
});

describe('Feature: jsxCanvas static props', () => {
  describe('Given static x and y props', () => {
    describe('When jsxCanvas creates a Container', () => {
      it('then the display object has those property values', () => {
        const obj = jsxCanvas('Container', { x: 100, y: 200 });
        expect(obj.x).toBe(100);
        expect(obj.y).toBe(200);
      });
    });
  });

  describe('Given a static alpha prop', () => {
    describe('When jsxCanvas creates a Container', () => {
      it('then the display object alpha is set', () => {
        const obj = jsxCanvas('Container', { alpha: 0.5 });
        expect(obj.alpha).toBe(0.5);
      });
    });
  });

  describe('Given a static visible prop set to false', () => {
    describe('When jsxCanvas creates a Container', () => {
      it('then the display object is not visible', () => {
        const obj = jsxCanvas('Container', { visible: false });
        expect(obj.visible).toBe(false);
      });
    });
  });

  describe('Given undefined props', () => {
    describe('When jsxCanvas creates a Container', () => {
      it('then undefined props are not set on the display object', () => {
        const obj = jsxCanvas('Container', { x: undefined });
        // x defaults to 0 on a Container, and should NOT have been overwritten
        expect(obj.x).toBe(0);
      });
    });
  });
});

describe('Feature: jsxCanvas reactive props', () => {
  describe('Given a signal accessor for x', () => {
    describe('When the signal value changes', () => {
      it('then the display object x updates reactively', () => {
        const x = signal(10);
        const obj = jsxCanvas('Container', { x: () => x.value });

        expect(obj.x).toBe(10);

        x.value = 50;
        expect(obj.x).toBe(50);
      });
    });
  });

  describe('Given multiple reactive props', () => {
    describe('When their signals change', () => {
      it('then all corresponding properties update', () => {
        const x = signal(0);
        const y = signal(0);
        const alpha = signal(1);

        const obj = jsxCanvas('Container', {
          x: () => x.value,
          y: () => y.value,
          alpha: () => alpha.value,
        });

        expect(obj.x).toBe(0);
        expect(obj.y).toBe(0);
        expect(obj.alpha).toBe(1);

        x.value = 100;
        y.value = 200;
        alpha.value = 0.3;

        expect(obj.x).toBe(100);
        expect(obj.y).toBe(200);
        expect(obj.alpha).toBeCloseTo(0.3);
      });
    });
  });
});

describe('Feature: jsxCanvas ref callback', () => {
  describe('Given a ref function', () => {
    describe('When jsxCanvas creates the display object', () => {
      it('then the ref is called with the display object', () => {
        const refFn = vi.fn();
        const obj = jsxCanvas('Container', { ref: refFn });
        expect(refFn).toHaveBeenCalledOnce();
        expect(refFn).toHaveBeenCalledWith(obj);
      });
    });
  });
});

describe('Feature: jsxCanvas event binding', () => {
  describe('Given an onClick handler', () => {
    describe('When jsxCanvas creates the display object', () => {
      it('then the event is registered on the display object', () => {
        const handler = vi.fn();
        const obj = jsxCanvas('Container', { onClick: handler });

        // PixiJS uses .emit() to trigger events
        obj.emit('click');
        expect(handler).toHaveBeenCalledOnce();
      });
    });
  });

  describe('Given an onPointerDown handler', () => {
    describe('When jsxCanvas creates the display object', () => {
      it('then pointerdown event is registered', () => {
        const handler = vi.fn();
        const obj = jsxCanvas('Container', { onPointerDown: handler });

        obj.emit('pointerdown');
        expect(handler).toHaveBeenCalledOnce();
      });
    });
  });

  describe('Given event handlers but no explicit eventMode', () => {
    describe('When jsxCanvas creates the display object', () => {
      it('then eventMode is auto-set to static', () => {
        const obj = jsxCanvas('Container', { onClick: vi.fn() });
        expect(obj.eventMode).toBe('static');
      });
    });
  });

  describe('Given event handlers and interactive explicitly false', () => {
    describe('When jsxCanvas creates the display object', () => {
      it('then eventMode is NOT auto-set', () => {
        const obj = jsxCanvas('Container', { onClick: vi.fn(), interactive: false });
        // When interactive is false, we don't override eventMode
        expect(obj.eventMode).not.toBe('static');
      });
    });
  });

  describe('Given an explicit eventMode', () => {
    describe('When jsxCanvas creates the display object', () => {
      it('then that eventMode is used instead of auto-static', () => {
        const obj = jsxCanvas('Container', {
          onClick: vi.fn(),
          eventMode: 'dynamic',
        });
        expect(obj.eventMode).toBe('dynamic');
      });
    });
  });
});

describe('Feature: jsxCanvas Graphics draw', () => {
  describe('Given a Graphics tag with a draw function', () => {
    describe('When jsxCanvas creates the display object', () => {
      it('then the draw function is called', () => {
        const drawFn = vi.fn();
        jsxCanvas('Graphics', { draw: drawFn });
        expect(drawFn).toHaveBeenCalledOnce();
      });
    });
  });

  describe('Given a reactive draw dependency', () => {
    describe('When the dependency changes', () => {
      it('then the draw function re-runs', () => {
        const radius = signal(10);
        const drawFn = vi.fn((g: Graphics) => {
          // Read signal inside draw to track dependency
          const r = radius.value;
          g.circle(0, 0, r);
        });

        jsxCanvas('Graphics', { draw: drawFn });
        expect(drawFn).toHaveBeenCalledTimes(1);

        // Change the dependency
        radius.value = 20;
        expect(drawFn).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Given a Graphics draw that depends on a signal', () => {
    describe('When the signal updates', () => {
      it('then clear() is called before redrawing', () => {
        const radius = signal(10);
        const graphics = jsxCanvas('Graphics', {
          draw: (g: Graphics) => {
            const r = radius.value;
            g.circle(0, 0, r);
          },
        }) as Graphics;

        const clearSpy = vi.spyOn(graphics, 'clear');

        radius.value = 20;
        expect(clearSpy).toHaveBeenCalled();

        clearSpy.mockRestore();
      });
    });
  });
});
