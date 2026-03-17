/**
 * Theme component type registry.
 *
 * This interface is empty by default. Theme packages augment it via
 * TypeScript module augmentation to provide typed components.
 *
 * When `@vertz/theme-shadcn` is installed, it augments this interface with
 * all component types (Button, Dialog, Select, etc.), giving full type safety
 * to imports from `@vertz/ui/components`.
 *
 * Without a theme package, components are typed as `unknown` (from the index signature).
 *
 * @example
 * ```ts
 * // In @vertz/theme-shadcn (module augmentation):
 * declare module '@vertz/ui/components' {
 *   interface ThemeComponentMap {
 *     Button: (props: ButtonProps) => HTMLButtonElement;
 *     Dialog: ThemedDialogComponent;
 *   }
 * }
 * ```
 */
export interface ThemeComponentMap {
  [key: string]: unknown;
}
