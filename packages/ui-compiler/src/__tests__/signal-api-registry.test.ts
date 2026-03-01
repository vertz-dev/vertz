/**
 * @file Tests for signal-api-registry configuration
 */
import { describe, expect, it } from 'vitest';
import { getSignalApiConfig, isReactiveSourceApi } from '../signal-api-registry';

describe('signal-api-registry', () => {
  it('should return updated form config with fieldSignalProperties', () => {
    const config = getSignalApiConfig('form');
    expect(config).toBeDefined();
    expect(config?.signalProperties).toEqual(new Set(['submitting', 'dirty', 'valid']));
    expect(config?.plainProperties).toEqual(
      new Set(['action', 'method', 'onSubmit', 'reset', 'setFieldError', 'submit']),
    );
    expect(config?.fieldSignalProperties).toEqual(new Set(['error', 'dirty', 'touched', 'value']));
  });

  it('should recognize useContext as a reactive source API', () => {
    expect(isReactiveSourceApi('useContext')).toBe(true);
  });

  it('should not recognize signal APIs as reactive source APIs', () => {
    expect(isReactiveSourceApi('query')).toBe(false);
    expect(isReactiveSourceApi('form')).toBe(false);
  });

  it('should not recognize unknown functions as reactive source APIs', () => {
    expect(isReactiveSourceApi('unknownFn')).toBe(false);
  });
});
