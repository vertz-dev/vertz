import { describe, expect, it } from 'bun:test';
import { normalizeApiPrefix } from '../prefix';

describe('normalizeApiPrefix', () => {
  it('returns /api when input is undefined', () => {
    expect(normalizeApiPrefix(undefined)).toBe('/api');
  });

  it('returns /api when input is /api', () => {
    expect(normalizeApiPrefix('/api')).toBe('/api');
  });

  it('strips trailing slash from /api/', () => {
    expect(normalizeApiPrefix('/api/')).toBe('/api');
  });

  it('adds leading slash to v1', () => {
    expect(normalizeApiPrefix('v1')).toBe('/v1');
  });

  it('strips trailing and adds leading slash for v1/', () => {
    expect(normalizeApiPrefix('v1/')).toBe('/v1');
  });

  it('normalizes / to empty string', () => {
    expect(normalizeApiPrefix('/')).toBe('');
  });

  it('keeps empty string as empty string', () => {
    expect(normalizeApiPrefix('')).toBe('');
  });

  it('strips multiple trailing slashes', () => {
    expect(normalizeApiPrefix('/api///')).toBe('/api');
  });

  it('handles nested prefix like /api/v1', () => {
    expect(normalizeApiPrefix('/api/v1')).toBe('/api/v1');
  });

  it('handles nested prefix with trailing slash /api/v1/', () => {
    expect(normalizeApiPrefix('/api/v1/')).toBe('/api/v1');
  });

  it('collapses repeated leading slashes //api to /api', () => {
    expect(normalizeApiPrefix('//api')).toBe('/api');
  });

  it('collapses multiple leading slashes ///v1 to /v1', () => {
    expect(normalizeApiPrefix('///v1')).toBe('/v1');
  });
});
