import { describe, expect, it } from 'bun:test';
import { NativeElement, NativeTextNode } from '../native-element';
import { collectDrawCommands, type DrawCommand } from '../render/renderer';

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
});
