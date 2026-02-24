import { describe, expect, it } from 'bun:test';
import { unwrap } from './unwrap';

describe('Feature: unwrap utility', () => {
  describe('Given a static value', () => {
    describe('When unwrap is called', () => {
      it('then returns the value as-is', () => {
        expect(unwrap(42)).toBe(42);
        expect(unwrap('hello')).toBe('hello');
        expect(unwrap(true)).toBe(true);
        expect(unwrap(null)).toBe(null);
        expect(unwrap(undefined)).toBe(undefined);
      });
    });
  });

  describe('Given an accessor function', () => {
    describe('When unwrap is called', () => {
      it('then calls the function and returns its result', () => {
        expect(unwrap(() => 42)).toBe(42);
        expect(unwrap(() => 'hello')).toBe('hello');
        expect(unwrap(() => true)).toBe(true);
      });
    });
  });

  describe('Given an object value', () => {
    describe('When unwrap is called with a static object', () => {
      it('then returns the object reference', () => {
        const obj = { x: 1 };
        expect(unwrap(obj)).toBe(obj);
      });
    });
  });

  describe('Given zero as a value', () => {
    describe('When unwrap is called', () => {
      it('then returns zero (does not treat it as falsy)', () => {
        expect(unwrap(0)).toBe(0);
      });
    });
  });
});
