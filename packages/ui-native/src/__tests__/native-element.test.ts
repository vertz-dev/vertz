import { describe, expect, it } from 'bun:test';
import { NativeElement, NativeTextNode } from '../native-element';

describe('NativeElement', () => {
  describe('Given a newly created element', () => {
    it('Then has an empty tag and no children', () => {
      const el = new NativeElement('div');
      expect(el.tag).toBe('div');
      expect(el.children).toEqual([]);
      expect(el.parent).toBeNull();
    });

    it('Then has empty attributes', () => {
      const el = new NativeElement('div');
      expect(el.getAttribute('class')).toBeNull();
    });
  });

  describe('Given setAttribute is called', () => {
    it('Then getAttribute returns the value', () => {
      const el = new NativeElement('div');
      el.setAttribute('class', 'panel');
      expect(el.getAttribute('class')).toBe('panel');
    });

    it('Then removeAttribute clears the value', () => {
      const el = new NativeElement('div');
      el.setAttribute('id', 'main');
      el.removeAttribute('id');
      expect(el.getAttribute('id')).toBeNull();
    });
  });

  describe('Given appendChild is called', () => {
    it('Then child is added and parent is set', () => {
      const parent = new NativeElement('div');
      const child = new NativeElement('span');
      parent.appendChild(child);
      expect(parent.children).toEqual([child]);
      expect(child.parent).toBe(parent);
    });

    it('Then child is moved from previous parent', () => {
      const parent1 = new NativeElement('div');
      const parent2 = new NativeElement('div');
      const child = new NativeElement('span');
      parent1.appendChild(child);
      parent2.appendChild(child);
      expect(parent1.children).toEqual([]);
      expect(parent2.children).toEqual([child]);
      expect(child.parent).toBe(parent2);
    });
  });

  describe('Given removeChild is called', () => {
    it('Then child is removed and parent is cleared', () => {
      const parent = new NativeElement('div');
      const child = new NativeElement('span');
      parent.appendChild(child);
      parent.removeChild(child);
      expect(parent.children).toEqual([]);
      expect(child.parent).toBeNull();
    });
  });

  describe('Given insertBefore is called', () => {
    it('Then child is inserted before reference', () => {
      const parent = new NativeElement('div');
      const a = new NativeElement('a');
      const b = new NativeElement('b');
      const c = new NativeElement('c');
      parent.appendChild(a);
      parent.appendChild(c);
      parent.insertBefore(b, c);
      expect(parent.children).toEqual([a, b, c]);
    });

    it('Then appends if reference is null', () => {
      const parent = new NativeElement('div');
      const a = new NativeElement('a');
      parent.insertBefore(a, null);
      expect(parent.children).toEqual([a]);
    });
  });

  describe('Given style property', () => {
    it('Then sets and reads display', () => {
      const el = new NativeElement('div');
      expect(el.style.display).toBe('');
      el.style.display = 'flex';
      expect(el.style.display).toBe('flex');
    });
  });

  describe('Given classList', () => {
    it('Then add/remove manage classes', () => {
      const el = new NativeElement('div');
      el.classList.add('active');
      expect(el.getAttribute('class')).toBe('active');
      el.classList.add('visible');
      expect(el.getAttribute('class')).toBe('active visible');
      el.classList.remove('active');
      expect(el.getAttribute('class')).toBe('visible');
    });
  });

  describe('Given event listeners', () => {
    it('Then addEventListener stores and removeEventListener removes', () => {
      const el = new NativeElement('button');
      const handler = () => {};
      el.addEventListener('click', handler);
      expect(el.listenerCount('click')).toBe(1);
      el.removeEventListener('click', handler);
      expect(el.listenerCount('click')).toBe(0);
    });

    it('Then dispatchEvent calls all handlers', () => {
      const el = new NativeElement('button');
      const calls: string[] = [];
      el.addEventListener('click', () => calls.push('a'));
      el.addEventListener('click', () => calls.push('b'));
      el.dispatchEvent('click', {} as Event);
      expect(calls).toEqual(['a', 'b']);
    });
  });
});

describe('NativeTextNode', () => {
  it('Then stores text data', () => {
    const text = new NativeTextNode('hello');
    expect(text.data).toBe('hello');
  });

  it('Then data is mutable', () => {
    const text = new NativeTextNode('hello');
    text.data = 'world';
    expect(text.data).toBe('world');
  });
});
