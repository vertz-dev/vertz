/** A ref container for DOM element access. */
export interface Ref<T> {
  current: T | undefined;
}

/**
 * Create a ref for accessing a DOM element after mount.
 * Returns `{ current: undefined }` initially; after mount,
 * `ref.current` will hold the DOM element.
 */
export function ref<T>(): Ref<T> {
  return { current: undefined };
}
