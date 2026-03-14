import { describe, expect, it } from 'bun:test';
import { NativeElement, NativeTextNode } from '../native-element';
import { collectDrawCommands } from '../render/renderer';

describe('collectDrawCommands', () => {
  describe('Given an empty root element', () => {
    it('Then returns a single rect command for the root', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:bg', '#ff0000');
      const cmds = collectDrawCommands(root, 800, 600);
      expect(cmds.length).toBeGreaterThanOrEqual(1);
      expect(cmds[0].type).toBe('rect');
    });
  });

  describe('Given a tree with text nodes', () => {
    it('Then returns text draw commands', () => {
      const root = new NativeElement('div');
      const text = new NativeTextNode('Hello');
      root.appendChild(text);
      const cmds = collectDrawCommands(root, 800, 600);
      const textCmds = cmds.filter((c) => c.type === 'text');
      expect(textCmds.length).toBe(1);
      expect(textCmds[0].text).toBe('Hello');
    });
  });

  describe('Given nested elements', () => {
    it('Then returns commands for all elements', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:bg', '#ffffff');
      const child = new NativeElement('span');
      child.setAttribute('style:bg', '#0000ff');
      root.appendChild(child);
      const cmds = collectDrawCommands(root, 800, 600);
      const rectCmds = cmds.filter((c) => c.type === 'rect');
      expect(rectCmds.length).toBe(2);
    });
  });

  describe('Given __comment and __fragment elements', () => {
    it('Then skips them but processes their children', () => {
      const root = new NativeElement('div');
      const fragment = new NativeElement('__fragment');
      const child = new NativeElement('span');
      child.setAttribute('style:bg', '#00ff00');
      fragment.appendChild(child);
      root.appendChild(fragment);
      const cmds = collectDrawCommands(root, 800, 600);
      const rectCmds = cmds.filter((c) => c.type === 'rect');
      // root + span (fragment is invisible)
      expect(rectCmds.length).toBe(2);
    });
  });

  describe('Given Yoga flexbox layout', () => {
    it('Then rect commands use computed positions from flex layout', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:bg', '#000000');
      root.setAttribute('style:padding', '10');

      const child = new NativeElement('div');
      child.setAttribute('style:bg', '#ff0000');
      child.setAttribute('style:height', '100');
      root.appendChild(child);

      const cmds = collectDrawCommands(root, 800, 600);
      const rects = cmds.filter((c) => c.type === 'rect');

      // Root at (0,0) filling viewport
      expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 800, height: 600 });
      // Child inset by padding
      expect(rects[1]).toMatchObject({ x: 10, y: 10, width: 780, height: 100 });
    });

    it('Then row layout positions children horizontally', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:flexDirection', 'row');

      const a = new NativeElement('div');
      a.setAttribute('style:bg', '#ff0000');
      a.setAttribute('style:width', '200');
      a.setAttribute('style:height', '100');

      const b = new NativeElement('div');
      b.setAttribute('style:bg', '#00ff00');
      b.setAttribute('style:width', '300');
      b.setAttribute('style:height', '100');

      root.appendChild(a);
      root.appendChild(b);

      const cmds = collectDrawCommands(root, 800, 600);
      const rects = cmds.filter((c) => c.type === 'rect');

      // Skip root (transparent), check children
      const childRects = rects.filter((r) => r.color !== 'transparent');
      expect(childRects[0]).toMatchObject({ x: 0, y: 0, width: 200 });
      expect(childRects[1]).toMatchObject({ x: 200, y: 0, width: 300 });
    });
  });
});
