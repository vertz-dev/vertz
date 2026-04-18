import { markSubtreeClaimed } from '../hydrate/hydration-context';
import { deferredDomEffect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';

/**
 * Reactively assigns element.innerHTML to the string returned by `fn`.
 *
 * Compiler output target for the JSX `innerHTML` prop. Uses
 * deferredDomEffect so the first run is deferred until after hydration
 * completes, preserving hydration-claimed child nodes during the
 * cursor walk. Nullish values render as the empty string.
 *
 * @security The string is inserted WITHOUT escaping — callers are
 *   responsible for ensuring the value is trusted markup. For
 *   user-controlled input, sanitize first (e.g. DOMPurify) and wrap
 *   the result with `trusted()` from `@vertz/ui`.
 */
export function __html(el: Element, fn: () => string | null | undefined): DisposeFn {
  markSubtreeClaimed(el);
  return deferredDomEffect(() => {
    const value = fn();
    el.innerHTML = value == null ? '' : value;
  });
}
