import { signal } from '@vertz/ui';
import { Text } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { jsxCanvas } from './jsx-canvas';

describe('Feature: Canvas Text Element', () => {
  describe('Given a Text element with static text', () => {
    describe('When jsxCanvas is called', () => {
      it('then creates a PIXI.Text with the text content', () => {
        const result = jsxCanvas('Text', { text: 'Hello World' });
        expect(result).toBeInstanceOf(Text);
        expect((result as Text).text).toBe('Hello World');
      });
    });
  });

  describe('Given a Text element with reactive text', () => {
    describe('When the signal changes', () => {
      it('then updates the text when the signal changes', () => {
        const label = signal('Score: 0');
        const result = jsxCanvas('Text', { text: () => label.value });
        expect((result as Text).text).toBe('Score: 0');

        label.value = 'Score: 100';
        expect((result as Text).text).toBe('Score: 100');
      });
    });
  });

  describe('Given a Text element with style', () => {
    describe('When jsxCanvas is called', () => {
      it('then applies the text style', () => {
        const result = jsxCanvas('Text', {
          text: 'Styled',
          style: { fontSize: 24, fill: 0xffffff },
        });
        const textObj = result as Text;
        expect(textObj.text).toBe('Styled');
        expect(textObj.style.fontSize).toBe(24);
      });
    });
  });

  describe('Given a Text element with transform props', () => {
    describe('When jsxCanvas is called', () => {
      it('then position and other transforms work like other intrinsics', () => {
        const x = signal(50);
        const result = jsxCanvas('Text', {
          text: 'Hi',
          x: () => x.value,
          y: 100,
        });
        expect(result.x).toBe(50);
        expect(result.y).toBe(100);

        x.value = 200;
        expect(result.x).toBe(200);
      });
    });
  });

  describe('Given a Text element with no text prop', () => {
    describe('When jsxCanvas is called', () => {
      it('then creates a Text with empty default text', () => {
        const result = jsxCanvas('Text', {});
        expect(result).toBeInstanceOf(Text);
        // PixiJS Text defaults to empty string
        expect((result as Text).text).toBe('');
      });
    });
  });
});
