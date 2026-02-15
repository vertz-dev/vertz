/**
 * Type declarations for SSR globals injected by the DOM shim.
 */

declare global {
  var __SSR_URL__: string | undefined;
  var document: Document | undefined;
  var window:
    | (Window & {
        location: Location & { pathname: string };
      })
    | undefined;
  var Node: typeof Node | undefined;
  var HTMLElement: typeof HTMLElement | undefined;
  var HTMLAnchorElement: typeof HTMLAnchorElement | undefined;
  var HTMLDivElement: typeof HTMLDivElement | undefined;
  var HTMLSpanElement: typeof HTMLSpanElement | undefined;
  var Text: typeof Text | undefined;
  var DocumentFragment: typeof DocumentFragment | undefined;
}

export {};
