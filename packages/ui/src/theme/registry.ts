/** Input type for registerTheme(). Compatible with configureTheme() output. */
export interface RegisterThemeInput {
  components: {
    primitives?: object;
  };
}

let _resolved: RegisterThemeInput | null = null;

/**
 * Register a theme for use with `@vertz/ui/components`.
 *
 * Call once at app startup, before any component from `@vertz/ui/components` is used.
 * Calling again replaces the previously registered theme.
 *
 * IMPORTANT: This stores the resolved theme WITHOUT accessing `.components`.
 * Accessing `.components` would trigger eager compilation of all ~40 component
 * styles (~74KB CSS) at startup time. Instead, styles are compiled lazily
 * per-component when first accessed via _getComponent()/_getPrimitive(). (#1979)
 *
 * @example
 * ```ts
 * import { registerTheme } from '@vertz/ui';
 * import { configureTheme } from '@vertz/theme-shadcn';
 * registerTheme(configureTheme({ palette: 'zinc', radius: 'md' }));
 * ```
 */
export function registerTheme(resolved: RegisterThemeInput): void {
  if (
    !resolved ||
    typeof resolved !== 'object' ||
    !('components' in resolved) ||
    !resolved.components
  ) {
    throw new Error(
      `registerTheme() expects an object with a "components" property.\n\n` +
        `Example:\n` +
        `  import { registerTheme } from '@vertz/ui';\n` +
        `  import { configureTheme } from '@vertz/theme-shadcn';\n` +
        `  registerTheme(configureTheme({ palette: 'zinc' }));\n`,
    );
  }
  // Store without accessing .components — preserves lazy per-component getters (#1979).
  _resolved = resolved;
}

/** Retrieve a direct component from the registered theme. */
export function _getComponent(name: string): unknown {
  if (!_resolved) {
    throw new Error(
      `No theme registered. Call registerTheme() before using components from @vertz/ui/components.\n\n` +
        `Example:\n` +
        `  import { registerTheme } from '@vertz/ui';\n` +
        `  import { configureTheme } from '@vertz/theme-shadcn';\n` +
        `  registerTheme(configureTheme({ palette: 'zinc' }));\n`,
    );
  }
  // Accessing _resolved.components triggers per-component lazy getter only for `name`.
  return Reflect.get(_resolved.components, name);
}

/** Retrieve a primitive component from the registered theme. */
export function _getPrimitive(name: string): unknown {
  if (!_resolved) {
    throw new Error(
      `No theme registered. Call registerTheme() before using components from @vertz/ui/components.`,
    );
  }
  const primitives = _resolved.components.primitives;
  if (!primitives) return undefined;
  return Reflect.get(primitives, name);
}

/** Reset the registry — for testing only. */
export function _resetTheme(): void {
  _resolved = null;
}
