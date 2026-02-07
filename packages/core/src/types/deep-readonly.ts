type Primitive = string | number | boolean | bigint | symbol | undefined | null;

// Built-in types whose internal structure should not be recursively mapped
type BuiltinObject =
  | Date
  | RegExp
  | Error
  | Map<unknown, unknown>
  | Set<unknown>
  | WeakMap<object, unknown>
  | WeakSet<object>
  | Promise<unknown>
  | Request
  | Response
  | Headers
  | ReadableStream
  | WritableStream;

export type DeepReadonly<T> = unknown extends T
  ? T
  : T extends Primitive
    ? T
    : T extends BuiltinObject
      ? T
      : T extends (...args: infer A) => infer R
        ? (...args: A) => R
        : T extends ReadonlyArray<infer U>
          ? ReadonlyArray<DeepReadonly<U>>
          : T extends Array<infer U>
            ? ReadonlyArray<DeepReadonly<U>>
            : { readonly [K in keyof T]: DeepReadonly<T[K]> };
