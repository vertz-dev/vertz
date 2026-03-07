/**
 * Reactivity manifest loading utilities.
 *
 * Converts JSON manifest files (with string[] arrays) into runtime
 * representations (with Set<string>) for O(1) lookups.
 */
import { resolve } from 'node:path';
import type {
  LoadedExportReactivityInfo,
  LoadedReactivityManifest,
  LoadedReactivityShape,
  ReactivityManifest,
} from './types';

const SUPPORTED_VERSION = 1;

/**
 * Load and convert a ReactivityManifest from JSON format.
 * Converts string[] to Set<string> for signal-api properties.
 * Unsupported versions fall back to treating all exports as unknown.
 */
export function loadManifestFromJson(json: ReactivityManifest): LoadedReactivityManifest {
  if (json.version !== SUPPORTED_VERSION) {
    const unknownExports: Record<string, LoadedExportReactivityInfo> = {};
    for (const [name, info] of Object.entries(json.exports)) {
      unknownExports[name] = {
        kind: info.kind,
        reactivity: { type: 'unknown' },
      };
    }
    return {
      version: SUPPORTED_VERSION,
      filePath: json.filePath,
      exports: unknownExports,
    };
  }

  const exports: Record<string, LoadedExportReactivityInfo> = {};
  for (const [name, info] of Object.entries(json.exports)) {
    exports[name] = {
      kind: info.kind,
      reactivity: convertReactivityShape(info.reactivity),
    };
  }

  return {
    version: SUPPORTED_VERSION,
    filePath: json.filePath,
    exports,
  };
}

function convertReactivityShape(
  shape: ReactivityManifest['exports'][string]['reactivity'],
): LoadedReactivityShape {
  if (shape.type === 'signal-api') {
    return {
      type: 'signal-api',
      signalProperties: toSet(shape.signalProperties),
      plainProperties: toSet(shape.plainProperties),
      ...(shape.fieldSignalProperties
        ? { fieldSignalProperties: toSet(shape.fieldSignalProperties) }
        : {}),
    };
  }
  return shape as LoadedReactivityShape;
}

function toSet(value: Set<string> | string[]): Set<string> {
  return value instanceof Set ? value : new Set(value);
}

/** Cached framework manifest instance. */
let cachedFrameworkManifest: LoadedReactivityManifest | null = null;

/**
 * Load the @vertz/ui framework manifest.
 * The manifest is loaded once and cached for the process lifetime.
 */
export function loadFrameworkManifest(): LoadedReactivityManifest {
  if (cachedFrameworkManifest) return cachedFrameworkManifest;

  // Resolve relative to this file → up to ui-compiler → up to packages → ui/reactivity.json
  const manifestPath = resolve(__dirname, '../../ui/reactivity.json');
  const json = require(manifestPath) as ReactivityManifest;
  cachedFrameworkManifest = loadManifestFromJson(json);
  return cachedFrameworkManifest;
}
