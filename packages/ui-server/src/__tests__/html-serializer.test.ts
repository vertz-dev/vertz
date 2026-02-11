import { describe, expect, it } from 'vitest';
import { serializeToHtml } from '../html-serializer';
import type { VNode } from '../types';

describe('serializeToHtml', () => {
  it('serializes a simple element', () => {
    const node: VNode = { tag: 'div', attrs: {}, children: [] };
    expect(serializeToHtml(node)).toBe('<div></div>');
  });

  it('serializes attributes', () => {
    const node: VNode = {
      tag: 'a',
      attrs: { href: '/home', class: 'link' },
      children: ['click me'],
    };
    expect(serializeToHtml(node)).toBe('<a href="/home" class="link">click me</a>');
  });

  it('serializes nested children', () => {
    const node: VNode = {
      tag: 'ul',
      attrs: {},
      children: [
        { tag: 'li', attrs: {}, children: ['one'] },
        { tag: 'li', attrs: {}, children: ['two'] },
      ],
    };
    expect(serializeToHtml(node)).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('serializes text children', () => {
    const node: VNode = { tag: 'p', attrs: {}, children: ['hello ', 'world'] };
    expect(serializeToHtml(node)).toBe('<p>hello world</p>');
  });

  it('escapes HTML entities in text', () => {
    const node: VNode = { tag: 'p', attrs: {}, children: ['<script>alert("xss")</script>'] };
    expect(serializeToHtml(node)).toBe(
      '<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>',
    );
  });

  it('escapes HTML entities in attribute values', () => {
    const node: VNode = { tag: 'div', attrs: { title: 'a "b" & c' }, children: [] };
    expect(serializeToHtml(node)).toBe('<div title="a &quot;b&quot; &amp; c"></div>');
  });

  it('handles void elements', () => {
    const node: VNode = { tag: 'br', attrs: {}, children: [] };
    expect(serializeToHtml(node)).toBe('<br>');
  });

  it('handles void elements with attributes', () => {
    const node: VNode = {
      tag: 'input',
      attrs: { type: 'text', placeholder: 'enter' },
      children: [],
    };
    expect(serializeToHtml(node)).toBe('<input type="text" placeholder="enter">');
  });

  it('handles deeply nested trees', () => {
    const node: VNode = {
      tag: 'div',
      attrs: {},
      children: [
        {
          tag: 'section',
          attrs: { class: 'main' },
          children: [
            { tag: 'h1', attrs: {}, children: ['Title'] },
            { tag: 'p', attrs: {}, children: ['Content'] },
          ],
        },
      ],
    };
    expect(serializeToHtml(node)).toBe(
      '<div><section class="main"><h1>Title</h1><p>Content</p></section></div>',
    );
  });

  it('serializes a plain string', () => {
    expect(serializeToHtml('just text')).toBe('just text');
  });
});
