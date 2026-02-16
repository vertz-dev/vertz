/**
 * Registry of known APIs that return objects with signal properties.
 */
/**
 * Core signal-returning APIs from @vertz/ui.
 */
export const SIGNAL_API_REGISTRY = {
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
export function isSignalApi(functionName) {
  return functionName in SIGNAL_API_REGISTRY;
}
/**
 * Get the configuration for a signal API.
 */
export function getSignalApiConfig(functionName) {
  return SIGNAL_API_REGISTRY[functionName];
}
//# sourceMappingURL=signal-api-registry.js.map
