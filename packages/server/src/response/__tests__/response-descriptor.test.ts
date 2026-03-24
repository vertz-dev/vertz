import { describe, expect, it } from 'bun:test';
import { filterProtectedHeaders, isResponseDescriptor, response } from '../response-descriptor';

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

describe('Feature: filterProtectedHeaders', () => {
  it('filters out content-type (case-insensitive)', () => {
    expect(filterProtectedHeaders({ 'Content-Type': 'text/plain', 'X-Custom': 'val' })).toEqual({
      'X-Custom': 'val',
    });
    expect(filterProtectedHeaders({ 'content-type': 'text/plain', 'X-Custom': 'val' })).toEqual({
      'X-Custom': 'val',
    });
    expect(filterProtectedHeaders({ 'CONTENT-TYPE': 'text/plain', 'X-Custom': 'val' })).toEqual({
      'X-Custom': 'val',
    });
  });

  it('returns undefined when input is undefined', () => {
    expect(filterProtectedHeaders(undefined)).toBeUndefined();
  });

  it('returns undefined when all headers are filtered out', () => {
    expect(filterProtectedHeaders({ 'Content-Type': 'text/plain' })).toBeUndefined();
  });

  it('passes through non-content-type headers unchanged', () => {
    expect(filterProtectedHeaders({ 'Cache-Control': 'no-cache', 'X-Request-Id': 'abc' })).toEqual({
      'Cache-Control': 'no-cache',
      'X-Request-Id': 'abc',
    });
  });
});
