/**
 * Registry of known APIs that return objects with signal properties.
 *
 * When the compiler encounters a call to one of these functions, it marks
 * the result variable as a 'signal-object' and tracks which properties are
 * signals that need automatic .value unwrapping.
 */

export interface SignalApiConfig {
  /** Properties that are signals and need auto-unwrapping. */
  signalProperties: Set<string>;
  /** Properties that are plain values (no unwrapping needed). */
  plainProperties: Set<string>;
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
    signalProperties: new Set(['submitting', 'errors', 'values']),
    plainProperties: new Set(['reset', 'submit', 'handleSubmit']),
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

/**
 * Check if a property on a signal API is a signal that needs unwrapping.
 */
export function isSignalProperty(apiName: string, propertyName: string): boolean {
  const config = SIGNAL_API_REGISTRY[apiName];
  return config?.signalProperties.has(propertyName) ?? false;
}
