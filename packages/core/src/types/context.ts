import type { DeepReadonly } from './deep-readonly';

export interface RawRequest {
  readonly request: Request;
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
}

export type Deps<T extends Record<string, unknown>> = DeepReadonly<T>;

export type Ctx<T extends Record<string, unknown>> = DeepReadonly<T>;
