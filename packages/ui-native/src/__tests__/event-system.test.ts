import { describe, expect, it, mock } from 'bun:test';
import { createEventSystem } from '../input/event-system';
import { computeLayout } from '../layout/layout';
import { NativeElement } from '../native-element';

describe('EventSystem', () => {
  function buildScene() {
    const root = new NativeElement('div');
    root.setAttribute('style:width', '800');
    root.setAttribute('style:height', '600');

    const button = new NativeElement('button');
    button.setAttribute('style:height', '50');
    button.setAttribute('style:width', '200');
    root.appendChild(button);

    return { root, button };
  }

  describe('Given a click on an element with a click handler', () => {
    it('Then the handler is called with event data', () => {
      const { root, button } = buildScene();
      const handler = mock(() => {});
      button.addEventListener('click', handler);

      const layouts = computeLayout(root, 800, 600);
      const eventSystem = createEventSystem(layouts);

      eventSystem.processMouseButton(50, 25, 'press');
      eventSystem.processMouseButton(50, 25, 'release');

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0];
      expect(event.type).toBe('click');
      expect(event.clientX).toBe(50);
      expect(event.clientY).toBe(25);
    });
  });

  describe('Given a mousedown on an element', () => {
    it('Then the mousedown handler is called', () => {
      const { root, button } = buildScene();
      const handler = mock(() => {});
      button.addEventListener('mousedown', handler);

      const layouts = computeLayout(root, 800, 600);
      const eventSystem = createEventSystem(layouts);

      eventSystem.processMouseButton(50, 25, 'press');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].type).toBe('mousedown');
    });
  });

  describe('Given a mouseup on an element', () => {
    it('Then the mouseup handler is called', () => {
      const { root, button } = buildScene();
      const handler = mock(() => {});
      button.addEventListener('mouseup', handler);

      const layouts = computeLayout(root, 800, 600);
      const eventSystem = createEventSystem(layouts);

      eventSystem.processMouseButton(50, 25, 'press');
      eventSystem.processMouseButton(50, 25, 'release');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].type).toBe('mouseup');
    });
  });

  describe('Given mouse movement over an element', () => {
    it('Then mousemove handler is called', () => {
      const { root, button } = buildScene();
      const handler = mock(() => {});
      button.addEventListener('mousemove', handler);

      const layouts = computeLayout(root, 800, 600);
      const eventSystem = createEventSystem(layouts);

      eventSystem.processMouseMove(50, 25);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].type).toBe('mousemove');
    });
  });

  describe('Given mouse enters an element', () => {
    it('Then mouseenter handler is called', () => {
      const { root, button } = buildScene();
      const enterHandler = mock(() => {});
      button.addEventListener('mouseenter', enterHandler);

      const layouts = computeLayout(root, 800, 600);
      const eventSystem = createEventSystem(layouts);

      // Move from outside to inside the button
      eventSystem.processMouseMove(50, 200); // outside button
      eventSystem.processMouseMove(50, 25); // inside button

      expect(enterHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given mouse leaves an element', () => {
    it('Then mouseleave handler is called', () => {
      const { root, button } = buildScene();
      const leaveHandler = mock(() => {});
      button.addEventListener('mouseleave', leaveHandler);

      const layouts = computeLayout(root, 800, 600);
      const eventSystem = createEventSystem(layouts);

      // Move inside then outside the button
      eventSystem.processMouseMove(50, 25); // inside button
      eventSystem.processMouseMove(50, 200); // outside button

      expect(leaveHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given a click with press and release on different elements', () => {
    it('Then click is NOT fired (click requires same target)', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:width', '800');
      root.setAttribute('style:height', '600');

      const a = new NativeElement('div');
      a.setAttribute('style:height', '100');
      root.appendChild(a);

      const b = new NativeElement('div');
      b.setAttribute('style:height', '100');
      root.appendChild(b);

      const handler = mock(() => {});
      a.addEventListener('click', handler);
      b.addEventListener('click', handler);

      const layouts = computeLayout(root, 800, 600);
      const eventSystem = createEventSystem(layouts);

      eventSystem.processMouseButton(50, 50, 'press'); // on a
      eventSystem.processMouseButton(50, 150, 'release'); // on b

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Given event bubbling', () => {
    it('Then parent handlers also fire for child events', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:width', '800');
      root.setAttribute('style:height', '600');

      const child = new NativeElement('div');
      child.setAttribute('style:height', '100');
      root.appendChild(child);

      const rootHandler = mock(() => {});
      const childHandler = mock(() => {});
      root.addEventListener('click', rootHandler);
      child.addEventListener('click', childHandler);

      const layouts = computeLayout(root, 800, 600);
      const eventSystem = createEventSystem(layouts);

      eventSystem.processMouseButton(50, 50, 'press');
      eventSystem.processMouseButton(50, 50, 'release');

      expect(childHandler).toHaveBeenCalledTimes(1);
      expect(rootHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given updateLayouts is called', () => {
    it('Then hit testing uses the new layout', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:width', '800');
      root.setAttribute('style:height', '600');

      const button = new NativeElement('div');
      button.setAttribute('style:height', '50');
      root.appendChild(button);

      const handler = mock(() => {});
      button.addEventListener('click', handler);

      const layouts1 = computeLayout(root, 800, 600);
      const eventSystem = createEventSystem(layouts1);

      // Resize — button is still at y=0, height=50
      button.setAttribute('style:height', '200');
      const layouts2 = computeLayout(root, 400, 300);
      eventSystem.updateLayouts(layouts2);

      // Click at y=100 — would miss with old layout but hits with new
      eventSystem.processMouseButton(50, 100, 'press');
      eventSystem.processMouseButton(50, 100, 'release');

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
