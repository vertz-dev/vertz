/**
 * Device Name Parser Tests — Sub-Phase 4
 */

import { describe, expect, it } from '@vertz/test';
import { parseDeviceName } from '../device-name';

describe('parseDeviceName', () => {
  it('parses Chrome on macOS User-Agent', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(parseDeviceName(ua)).toBe('Chrome on macOS');
  });

  it('parses Safari on iPhone User-Agent', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(parseDeviceName(ua)).toBe('Safari on iPhone');
  });

  it('parses Firefox on Windows User-Agent', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
    expect(parseDeviceName(ua)).toBe('Firefox on Windows');
  });

  it('returns Unknown device for unrecognized agent', () => {
    expect(parseDeviceName('')).toBe('Unknown device');
    expect(parseDeviceName('curl/7.88.1')).toBe('Unknown device');
  });
});
