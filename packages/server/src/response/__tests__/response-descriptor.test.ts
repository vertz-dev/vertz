import { describe, expect, it } from 'bun:test';
import { isResponseDescriptor, response } from '../response-descriptor';

describe('Feature: ResponseDescriptor and response() helper', () => {
  describe('Given response() called with data and options', () => {
    describe('When inspecting the result', () => {
      it('Then returns a ResponseDescriptor with data, status, headers', () => {
        const result = response(
          { keys: ['k1'] },
          { status: 201, headers: { 'Cache-Control': 'public, max-age=3600' } },
        );

        expect(result.data).toEqual({ keys: ['k1'] });
        expect(result.status).toBe(201);
        expect(result.headers).toEqual({ 'Cache-Control': 'public, max-age=3600' });
      });

      it('Then isResponseDescriptor() returns true', () => {
        const result = response({ keys: ['k1'] }, { status: 200 });
        expect(isResponseDescriptor(result)).toBe(true);
      });
    });
  });

  describe('Given response() called with only data (no options)', () => {
    describe('When inspecting the result', () => {
      it('Then status and headers are undefined', () => {
        const result = response({ token: 'tok' });
        expect(result.data).toEqual({ token: 'tok' });
        expect(result.status).toBeUndefined();
        expect(result.headers).toBeUndefined();
      });

      it('Then isResponseDescriptor() returns true', () => {
        const result = response({ token: 'tok' });
        expect(isResponseDescriptor(result)).toBe(true);
      });
    });
  });

  describe('Given a plain object', () => {
    describe('When checking with isResponseDescriptor()', () => {
      it('Then returns false', () => {
        expect(isResponseDescriptor({ token: 'tok' })).toBe(false);
        expect(isResponseDescriptor(null)).toBe(false);
        expect(isResponseDescriptor(undefined)).toBe(false);
        expect(isResponseDescriptor('string')).toBe(false);
        expect(isResponseDescriptor(42)).toBe(false);
      });
    });
  });
});
