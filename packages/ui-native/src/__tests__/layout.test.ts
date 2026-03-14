import { describe, expect, it } from 'bun:test';
import { computeLayout } from '../layout/layout';
import { NativeElement, NativeTextNode } from '../native-element';

describe('computeLayout', () => {
  describe('Given a root element with fixed viewport', () => {
    it('Then root fills the entire viewport', () => {
      const root = new NativeElement('div');
      const layouts = computeLayout(root, 800, 600);

      expect(layouts.get(root)).toEqual({
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
    });
  });

  describe('Given a root with children in default column layout', () => {
    it('Then children stack vertically and stretch to fill width', () => {
      const root = new NativeElement('div');
      const child1 = new NativeElement('div');
      child1.setAttribute('style:height', '100');
      const child2 = new NativeElement('div');
      child2.setAttribute('style:height', '200');
      root.appendChild(child1);
      root.appendChild(child2);

      const layouts = computeLayout(root, 800, 600);

      expect(layouts.get(child1)).toEqual({
        x: 0,
        y: 0,
        width: 800,
        height: 100,
      });
      expect(layouts.get(child2)).toEqual({
        x: 0,
        y: 100,
        width: 800,
        height: 200,
      });
    });
  });

  describe('Given a row flex direction', () => {
    it('Then children are laid out horizontally', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:flexDirection', 'row');

      const child1 = new NativeElement('div');
      child1.setAttribute('style:width', '200');
      child1.setAttribute('style:height', '100');
      const child2 = new NativeElement('div');
      child2.setAttribute('style:width', '300');
      child2.setAttribute('style:height', '100');
      root.appendChild(child1);
      root.appendChild(child2);

      const layouts = computeLayout(root, 800, 600);

      expect(layouts.get(child1)).toEqual({
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      });
      expect(layouts.get(child2)).toEqual({
        x: 200,
        y: 0,
        width: 300,
        height: 100,
      });
    });
  });

  describe('Given gap between children', () => {
    it('Then children have spacing between them', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:gap', '10');

      const child1 = new NativeElement('div');
      child1.setAttribute('style:height', '50');
      const child2 = new NativeElement('div');
      child2.setAttribute('style:height', '50');
      root.appendChild(child1);
      root.appendChild(child2);

      const layouts = computeLayout(root, 800, 600);

      expect(layouts.get(child1)).toEqual({
        x: 0,
        y: 0,
        width: 800,
        height: 50,
      });
      expect(layouts.get(child2)).toEqual({
        x: 0,
        y: 60, // 50 + 10 gap
        width: 800,
        height: 50,
      });
    });
  });

  describe('Given padding on parent', () => {
    it('Then children are offset by padding', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:padding', '20');

      const child = new NativeElement('div');
      child.setAttribute('style:height', '100');
      root.appendChild(child);

      const layouts = computeLayout(root, 800, 600);

      expect(layouts.get(root)).toEqual({
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      // Child is inset by padding
      expect(layouts.get(child)).toEqual({
        x: 20,
        y: 20,
        width: 760, // 800 - 20 - 20
        height: 100,
      });
    });
  });

  describe('Given flexGrow on children', () => {
    it('Then children expand to fill available space', () => {
      const root = new NativeElement('div');

      const child1 = new NativeElement('div');
      child1.setAttribute('style:flexGrow', '1');
      const child2 = new NativeElement('div');
      child2.setAttribute('style:flexGrow', '1');
      root.appendChild(child1);
      root.appendChild(child2);

      const layouts = computeLayout(root, 800, 600);

      expect(layouts.get(child1)).toEqual({
        x: 0,
        y: 0,
        width: 800,
        height: 300,
      });
      expect(layouts.get(child2)).toEqual({
        x: 0,
        y: 300,
        width: 800,
        height: 300,
      });
    });
  });

  describe('Given nested elements', () => {
    it('Then layout is computed recursively with absolute positions', () => {
      const root = new NativeElement('div');
      root.setAttribute('style:padding', '10');

      const parent = new NativeElement('div');
      parent.setAttribute('style:height', '200');
      parent.setAttribute('style:padding', '5');
      root.appendChild(parent);

      const child = new NativeElement('div');
      child.setAttribute('style:height', '50');
      parent.appendChild(child);

      const layouts = computeLayout(root, 400, 300);

      expect(layouts.get(root)).toEqual({
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      });
      expect(layouts.get(parent)).toEqual({
        x: 10,
        y: 10,
        width: 380,
        height: 200,
      });
      // Child position is absolute: parent.x + parent.padding + child.left
      expect(layouts.get(child)).toEqual({
        x: 15, // 10 + 5
        y: 15, // 10 + 5
        width: 370, // 380 - 5 - 5
        height: 50,
      });
    });
  });

  describe('Given text nodes', () => {
    it('Then text nodes are skipped in layout (not Yoga nodes)', () => {
      const root = new NativeElement('div');
      const text = new NativeTextNode('Hello');
      const child = new NativeElement('div');
      child.setAttribute('style:height', '100');
      root.appendChild(text);
      root.appendChild(child);

      const layouts = computeLayout(root, 800, 600);

      // Text nodes don't get layout entries
      expect(layouts.has(root)).toBe(true);
      expect(layouts.has(child)).toBe(true);
      // Map only contains NativeElement entries
      expect(layouts.size).toBe(2);
    });
  });

  describe('Given invisible elements (comment, fragment)', () => {
    it('Then they are treated as pass-through containers', () => {
      const root = new NativeElement('div');
      const fragment = new NativeElement('__fragment');
      const child = new NativeElement('div');
      child.setAttribute('style:height', '100');
      fragment.appendChild(child);
      root.appendChild(fragment);

      const layouts = computeLayout(root, 800, 600);

      // Fragment should still participate in layout
      expect(layouts.has(child)).toBe(true);
      expect(layouts.get(child)?.width).toBe(800);
    });
  });
});
