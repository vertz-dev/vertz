/**
 * Type declarations for SSR globals injected by the DOM shim.
 */

declare global {
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var __SSR_URL__: string | undefined;
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var document: Document | undefined;
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var window:
    | (Window & {
        location: Location & { pathname: string };
      })
    | undefined;
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var Node: typeof Node | undefined;
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var HTMLElement: typeof HTMLElement | undefined;
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var HTMLAnchorElement: typeof HTMLAnchorElement | undefined;
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var HTMLDivElement: typeof HTMLDivElement | undefined;
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var HTMLSpanElement: typeof HTMLSpanElement | undefined;
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var Text: typeof Text | undefined;
  // biome-ignore lint/suspicious/noRedeclare: SSR shim augmentation
  var DocumentFragment: typeof DocumentFragment | undefined;
}

export {};
