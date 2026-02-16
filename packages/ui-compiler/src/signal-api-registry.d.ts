/**
 * Registry of known APIs that return objects with signal properties.
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
export declare const SIGNAL_API_REGISTRY: Record<string, SignalApiConfig>;
/**
 * Check if a function name is a registered signal API.
 */
export declare function isSignalApi(functionName: string): boolean;
/**
 * Get the configuration for a signal API.
 */
export declare function getSignalApiConfig(functionName: string): SignalApiConfig | undefined;
//# sourceMappingURL=signal-api-registry.d.ts.map
