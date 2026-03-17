/** Input type for registerTheme(). Compatible with configureTheme() output. */
export interface RegisterThemeInput {
  components: {
    primitives?: object;
  };
}

let _components: object | null = null;
let _primitives: object | null = null;

/**
 * Register a theme for use with `@vertz/ui/components`.
 *
 * Call once at app startup, before any component from `@vertz/ui/components` is used.
 * Calling again replaces the previously registered theme.
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
    !resolved.components ||
    typeof resolved.components !== 'object'
  ) {
    throw new Error(
      `registerTheme() expects an object with a "components" property.\n\n` +
        `Example:\n` +
        `  import { registerTheme } from '@vertz/ui';\n` +
        `  import { configureTheme } from '@vertz/theme-shadcn';\n` +
        `  registerTheme(configureTheme({ palette: 'zinc' }));\n`,
    );
  }
  _components = resolved.components;
  _primitives = resolved.components.primitives ?? {};
}

/** Retrieve a direct component from the registered theme. */
export function _getComponent(name: string): unknown {
  if (!_components) {
    throw new Error(
      `No theme registered. Call registerTheme() before using components from @vertz/ui/components.\n\n` +
        `Example:\n` +
        `  import { registerTheme } from '@vertz/ui';\n` +
        `  import { configureTheme } from '@vertz/theme-shadcn';\n` +
        `  registerTheme(configureTheme({ palette: 'zinc' }));\n`,
    );
  }
  return Reflect.get(_components, name);
}

/** Retrieve a primitive component from the registered theme. */
export function _getPrimitive(name: string): unknown {
  if (!_primitives) {
    throw new Error(
      `No theme registered. Call registerTheme() before using components from @vertz/ui/components.`,
    );
  }
  return Reflect.get(_primitives, name);
}

/** Reset the registry — for testing only. */
export function _resetTheme(): void {
  _components = null;
  _primitives = null;
}
