/**
 * Type-level test utilities — replaces vitest's expectTypeOf for bun:test.
 *
 * Usage:
 *   type _1 = Expect<Equal<A, B>>;           // expectTypeOf<A>().toEqualTypeOf<B>()
 *   type _2 = Expect<Extends<A, B>>;         // expectTypeOf<A>().toMatchTypeOf<B>()
 *   type _3 = Expect<HasKey<A, 'k'>>;        // expectTypeOf<A>().toHaveProperty('k')
 *   type _4 = Expect<Not<HasKey<A, 'k'>>>;   // expectTypeOf<A>().not.toHaveProperty('k')
 *   type _5 = Expect<IsFunction<A>>;         // expectTypeOf<A>().toBeFunction()
 */

/** Fails at type-check if T is not `true`. */
export type Expect<T extends true> = T;

/** True if A and B are exactly the same type. */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** True if A extends B (structural subtype). */
export type Extends<A, B> = [A] extends [B] ? true : false;

/** True if K is a key of T. */
export type HasKey<T, K extends string> = K extends keyof T ? true : false;

/** Negation. */
export type Not<T extends boolean> = T extends true ? false : true;

/** True if T is a function type. */
export type IsFunction<T> = T extends (...args: any[]) => any ? true : false;

/** Extract the data type from Result<T, E> = { ok: true; data: T } | { ok: false; error: E }. */
export type Unwrap<R> = R extends { ok: true; data: infer T } ? T : never;
