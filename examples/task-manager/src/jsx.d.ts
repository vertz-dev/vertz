/**
 * JSX type definitions for @vertz/ui.
 *
 * The @vertz/ui-compiler transforms JSX into direct DOM construction:
 * - <div> → __element("div")
 * - <Component prop={val}> → Component({ prop: val })
 * - onClick={fn} → __on(el, "click", fn)
 * - {signal.value} → __text(() => signal.value) (auto-reactive)
 */
declare namespace JSX {
  type Element = HTMLElement;

  /** Allow `key` on all JSX elements — the compiler extracts it for __list(). */
  interface IntrinsicAttributes {
    key?: string | number;
  }

  interface ElementChildrenAttribute {
    children: {};
  }

  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
