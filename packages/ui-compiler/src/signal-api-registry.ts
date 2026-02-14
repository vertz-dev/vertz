/**
 * Registry of known APIs that return objects with signal properties.
 */

export interface SignalApiConfig {
  /** Properties that are signals and need auto-unwrapping. */
  signalProperties: Set<string>;
}

/**
 * Core signal-returning APIs from @vertz/ui.
 */
export const SIGNAL_API_REGISTRY: Record<string, SignalApiConfig> = {
  query: {
    signalProperties: new Set(['data', 'loading']),
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
