import { afterEach, describe, expect, it, vi } from 'bun:test';
import { signal } from '@vertz/ui';
import { popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
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

// Helper to flush microtask queue (let mocked async loads resolve)
const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Feature: jsxCanvas Sprite texture loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Given a Sprite tag with a string texture prop', () => {
    describe('When jsxCanvas creates the Sprite', () => {
      it('then Assets.load is called with the texture URL', () => {
        const mockTexture = Texture.WHITE;
        const loadSpy = vi.spyOn(Assets, 'load').mockResolvedValue(mockTexture);

        jsxCanvas('Sprite', { texture: 'hero.png' });

        expect(loadSpy).toHaveBeenCalledWith('hero.png');
      });

      it('then the sprite texture is set once loading completes', async () => {
        const mockTexture = Texture.WHITE;
        vi.spyOn(Assets, 'load').mockResolvedValue(mockTexture);

        const sprite = jsxCanvas('Sprite', { texture: 'hero.png' }) as Sprite;

        await flushPromises();

        expect(sprite.texture).toBe(mockTexture);
        expect(sprite.visible).toBe(true);
      });
    });
  });

  describe('Given a Sprite with a reactive texture accessor', () => {
    describe('When the texture signal changes', () => {
      it('then Assets.load is called again with the new URL', async () => {
        const tex1 = Texture.WHITE;
        const tex2 = Texture.WHITE;
        const loadSpy = vi
          .spyOn(Assets, 'load')
          .mockResolvedValueOnce(tex1)
          .mockResolvedValueOnce(tex2);

        const texUrl = signal('hero.png');
        jsxCanvas('Sprite', { texture: () => texUrl.value }) as Sprite;

        await flushPromises();
        expect(loadSpy).toHaveBeenCalledWith('hero.png');

        texUrl.value = 'villain.png';

        await flushPromises();
        expect(loadSpy).toHaveBeenCalledWith('villain.png');
      });
    });
  });
});

describe('Feature: jsxCanvas children processing', () => {
  describe('Given a Container with child display objects', () => {
    describe('When jsxCanvas creates the Container', () => {
      it('then children are added to the parent via addChild', () => {
        const child1 = new Container();
        const child2 = new Container();
        const parent = jsxCanvas('Container', { children: [child1, child2] });

        expect(parent.children.length).toBe(2);
        expect(parent.children[0]).toBe(child1);
        expect(parent.children[1]).toBe(child2);
      });
    });
  });

  describe('Given a Container with a single child', () => {
    describe('When jsxCanvas creates the Container', () => {
      it('then the single child is added', () => {
        const child = new Container();
        const parent = jsxCanvas('Container', { children: child });

        expect(parent.children.length).toBe(1);
        expect(parent.children[0]).toBe(child);
      });
    });
  });

  describe('Given children with null/undefined/false values', () => {
    describe('When jsxCanvas creates the Container', () => {
      it('then falsy children are filtered out', () => {
        const child = new Container();
        const parent = jsxCanvas('Container', {
          children: [null, child, undefined, false],
        });

        expect(parent.children.length).toBe(1);
        expect(parent.children[0]).toBe(child);
      });
    });
  });

  describe('Given no children prop', () => {
    describe('When jsxCanvas creates the Container', () => {
      it('then the container has no children', () => {
        const parent = jsxCanvas('Container', {});
        expect(parent.children.length).toBe(0);
      });
    });
  });
});

describe('Feature: jsxCanvas disposal and cleanup', () => {
  describe('Given a display object with event handlers in a disposal scope', () => {
    describe('When the scope is disposed', () => {
      it('then event listeners are removed', () => {
        const handler = vi.fn();
        const scope = pushScope();

        const obj = jsxCanvas('Container', { onClick: handler });

        popScope();

        // Event works before cleanup
        obj.emit('click');
        expect(handler).toHaveBeenCalledTimes(1);

        // Run cleanups
        runCleanups(scope);

        // Event handler should be removed after cleanup
        obj.emit('click');
        expect(handler).toHaveBeenCalledTimes(1); // no additional call
      });
    });
  });

  describe('Given a display object in a disposal scope', () => {
    describe('When the scope is disposed', () => {
      it('then the display object is destroyed', () => {
        const scope = pushScope();

        const obj = jsxCanvas('Container', { x: 10 });

        popScope();

        expect(obj.destroyed).toBe(false);

        runCleanups(scope);

        expect(obj.destroyed).toBe(true);
      });
    });
  });
});
