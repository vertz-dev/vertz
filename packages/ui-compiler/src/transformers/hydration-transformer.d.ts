import type MagicString from 'magic-string';
import { type SourceFile } from 'ts-morph';
/**
 * Marks interactive components with `data-v-id` hydration markers.
 *
 * A component is "interactive" if it contains `let` variable declarations
 * (reactive state) in its body. Static components (only `const` or no state)
 * are skipped and ship zero JS.
 *
 * For interactive components, the root JSX element's opening tag is augmented
 * with `data-v-id="ComponentName"`.
 */
export declare class HydrationTransformer {
  transform(s: MagicString, sourceFile: SourceFile): void;
  /**
   * Determine whether a component is interactive by checking for `let`
   * declarations in the component body.
   */
  private _isInteractive;
  /**
   * Find the root JSX element in the component's return statement
   * and inject `data-v-id` attribute into its opening tag.
   */
  private _addHydrationMarker;
  private _findRootJsx;
  private _injectAttribute;
}
//# sourceMappingURL=hydration-transformer.d.ts.map
