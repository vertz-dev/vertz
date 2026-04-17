import { describe, expect, it } from '@vertz/test';
import { token } from '../token';

describe('token.* — typed CSS variable helper', () => {
  describe('Given a single-segment access', () => {
    describe('When reading token.<namespace>.<key>', () => {
      it('Then stringifies to var(--<namespace>-<key>)', () => {
        expect(`${token.color.background}`).toBe('var(--color-background)');
        expect(`${token.color.foreground}`).toBe('var(--color-foreground)');
      });
    });
  });

  describe('Given a nested shade access', () => {
    describe('When reading token.color.<name>.<shade>', () => {
      it('Then stringifies to var(--color-<name>-<shade>)', () => {
        expect(`${token.color.primary[500]}`).toBe('var(--color-primary-500)');
        expect(`${token.color.primary[50]}`).toBe('var(--color-primary-50)');
        expect(`${token.color.danger[700]}`).toBe('var(--color-danger-700)');
      });
    });
  });

  describe('Given the spacing namespace', () => {
    describe('When reading token.spacing[N]', () => {
      it('Then stringifies to var(--spacing-N) for numeric and string keys', () => {
        expect(`${token.spacing[4]}`).toBe('var(--spacing-4)');
        expect(`${token.spacing['4']}`).toBe('var(--spacing-4)');
        expect(`${token.spacing[8]}`).toBe('var(--spacing-8)');
      });
    });
  });

  describe('Given the font namespace', () => {
    describe('When reading token.font.<name>', () => {
      it('Then stringifies to var(--font-<name>)', () => {
        expect(`${token.font.sans}`).toBe('var(--font-sans)');
        expect(`${token.font.mono}`).toBe('var(--font-mono)');
      });
    });
  });

  describe('Given a missing theme key', () => {
    describe('When reading a key not defined in the theme', () => {
      it('Then stringifies to var(--<ns>-<k>) without throwing', () => {
        expect(`${token.color.definitelyNotReal}`).toBe('var(--color-definitelyNotReal)');
        expect(`${token.spacing.nope}`).toBe('var(--spacing-nope)');
      });
    });
  });

  describe('Given string concatenation in CSS value positions', () => {
    describe('When a token is embedded in a template literal', () => {
      it('Then coerces to the var(...) string form', () => {
        expect(`1px solid ${token.color.primary[500]}`).toBe('1px solid var(--color-primary-500)');
        expect(`calc(${token.spacing[4]} + 2px)`).toBe('calc(var(--spacing-4) + 2px)');
      });
    });
  });

  describe('Given String() coercion', () => {
    describe('When a token is passed to String()', () => {
      it('Then returns the var(...) string', () => {
        expect(String(token.color.background)).toBe('var(--color-background)');
        expect(String(token.color.primary[500])).toBe('var(--color-primary-500)');
      });
    });
  });
});
