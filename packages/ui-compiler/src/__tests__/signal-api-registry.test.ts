/**
 * @file Tests for signal-api-registry configuration
 */
import { describe, expect, it } from 'vitest';
import { getSignalApiConfig } from '../signal-api-registry';

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
});
