/**
 * Registry of known APIs that return objects with signal properties.
 */

export interface SignalApiConfig {
  /** Properties that are signals and need auto-unwrapping. */
  signalProperties: Set<string>;
  /** Properties that are plain values (no unwrapping needed). */
  plainProperties: Set<string>;
  /** Per-field signal properties (e.g., form().title.error → .value). */
  fieldSignalProperties?: Set<string>;
}

/**
 * Core signal-returning APIs from @vertz/ui.
 */
export const SIGNAL_API_REGISTRY: Record<string, SignalApiConfig> = {
  query: {
    signalProperties: new Set(['data', 'loading', 'error']),
    plainProperties: new Set(['refetch']),
  },
  form: {
    signalProperties: new Set(['submitting', 'dirty', 'valid']),
    plainProperties: new Set(['action', 'method', 'onSubmit', 'reset', 'setFieldError', 'submit']),
    fieldSignalProperties: new Set(['error', 'dirty', 'touched', 'value']),
  },
  createLoader: {
    signalProperties: new Set(['data', 'loading', 'error']),
    plainProperties: new Set(['refetch']),
  },
};

/**
 * Check if a function name is a registered signal API.
 */
export function isSignalApi(functionName: string): boolean {
  return functionName in SIGNAL_API_REGISTRY;
}

/**
 * Get the configuration for a signal API.
 */
export function getSignalApiConfig(functionName: string): SignalApiConfig | undefined {
  return SIGNAL_API_REGISTRY[functionName];
}
