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

  interface ElementChildrenAttribute {
    children: {};
  }

  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
