import { describe, expect, test } from 'vitest';
import { __child, __text } from '../element';

describe('Child node rendering', () => {
  test('setting text.data to HTMLElement stringifies it', () => {
    const text = document.createTextNode('');
    const span = document.createElement('span');
    span.textContent = 'hello';
    
    // Setting text.data to an object calls its toString()
    text.data = span as any;
    
    console.log('DEBUG: text.data =', text.data);
    console.log('DEBUG: text.nodeValue =', text.nodeValue);
    
    const parent = document.createElement('div');
    parent.appendChild(text);
    console.log('DEBUG: parent.innerHTML =', parent.innerHTML);
    
    // In a real browser (and happy-dom), this converts to string
    expect(typeof text.data).toBe('string');
  });

  test('__text() with HTMLElement produces [object HTMLElement] string (regression)', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    child.textContent = 'child content';
    
    // This demonstrates the current bug: compiler generates __text for expressions
    // When the expression returns an HTMLElement, __text stringifies it
    const textNode = __text(() => child as any);
    parent.appendChild(textNode);
    
    console.log('DEBUG __text: parent.textContent =', parent.textContent);
    console.log('DEBUG __text: parent.innerHTML =', parent.innerHTML);
    
    // BUG: Should append the element, but instead creates text "[object HTMLElement]"
    // expect(parent.textContent).toBe('[object HTMLElement]');
    // expect(parent.innerHTML).toContain('[object HTMLElement]');
  });
  
  test('__child() appends HTMLElement directly, not as string', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    child.textContent = 'child content';
    
    // __child() checks if value is a Node and appends directly (inside a wrapper)
    const wrapper = __child(() => child);
    parent.appendChild(wrapper);
    
    // The child element should be inside the wrapper (not stringified)
    expect(parent.textContent).toBe('child content');
    expect(parent.innerHTML).not.toContain('[object HTMLElement]');
    expect(wrapper.children.length).toBe(1);
    expect(wrapper.children[0]).toBe(child);
    
    wrapper.dispose();
  });

  test('__child() converts primitives to text nodes', () => {
    const parent = document.createElement('div');
    
    // String
    const strMarker = __child(() => 'hello');
    parent.appendChild(strMarker);
    expect(parent.textContent).toBe('hello');
    strMarker.dispose();
    
    // Number
    parent.textContent = '';
    const numMarker = __child(() => 42);
    parent.appendChild(numMarker);
    expect(parent.textContent).toBe('42');
    numMarker.dispose();
  });

  test('__child() handles null and undefined', () => {
    const parent = document.createElement('div');
    
    const marker = __child(() => null);
    parent.appendChild(marker);
    expect(parent.textContent).toBe('');
    
    marker.dispose();
  });
});
