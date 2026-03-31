import { apiFeature } from './api.js';
import { clientFeature } from './client.js';
import { coreFeature } from './core.js';
import { dbFeature } from './db.js';
import { entityExampleFeature } from './entity-example.js';
import { minimalFeature } from './minimal.js';
import { routerFeature } from './router.js';
import type { Feature } from './types.js';
import { uiFeature } from './ui.js';

/**
 * All available features, keyed by name.
 */
const FEATURES: Record<string, Feature> = {
  core: coreFeature,
  api: apiFeature,
  db: dbFeature,
  'entity-example': entityExampleFeature,
  ui: uiFeature,
  router: routerFeature,
  client: clientFeature,
  minimal: minimalFeature,
};

/**
 * Presets are named combinations of features.
 * Aliases (hello-world, todo-app) provide backward compatibility.
 */
export const PRESETS: Record<string, string[]> = {
  // Minimal — 5 files, CLI-first. Best for AI agents.
  minimal: ['minimal'],
  api: ['core', 'api', 'db', 'entity-example'],
  ui: ['core', 'ui', 'router'],
  'hello-world': ['core', 'ui', 'router'],
  'full-stack': ['core', 'api', 'db', 'entity-example', 'ui', 'router', 'client'],
  // todo-app matches the legacy template: full-stack without router (direct HomePage render)
  'todo-app': ['core', 'api', 'db', 'entity-example', 'ui', 'client'],
};

interface ResolveOptions {
  /** Preset name (e.g., 'api', 'full-stack', 'hello-world') */
  template?: string;
  /** Custom feature list (e.g., ['api', 'ui']) */
  withFeatures?: string[];
}

/**
 * Resolves a preset name or custom feature list into Feature instances.
 * For --with, auto-resolves transitive dependencies.
 */
export function resolveFeatures(options: ResolveOptions): Feature[] {
  if (options.template) {
    const preset = PRESETS[options.template];
    if (!preset) {
      throw new Error(
        `Unknown template "${options.template}". Available: ${Object.keys(PRESETS).join(', ')}`,
      );
    }
    return preset.map((name) => {
      const feat = FEATURES[name];
      if (!feat) throw new Error(`Unknown feature "${name}" in preset "${options.template}"`);
      return feat;
    });
  }

  if (options.withFeatures) {
    // Validate all requested features exist
    for (const name of options.withFeatures) {
      if (!FEATURES[name]) {
        throw new Error(
          `Unknown feature "${name}". Available: ${Object.keys(FEATURES).join(', ')}`,
        );
      }
    }

    // Collect all features including transitive dependencies
    const collected = new Set<string>();

    function collect(name: string): void {
      if (collected.has(name)) return;
      const feat = FEATURES[name];
      if (!feat) return;
      for (const dep of feat.dependencies) {
        collect(dep);
      }
      collected.add(name);
    }

    for (const name of options.withFeatures) {
      collect(name);
    }

    return [...collected].map((name) => FEATURES[name]);
  }

  throw new Error('Either template or withFeatures must be provided');
}
