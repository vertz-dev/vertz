export type AuthStrategy =
  | { type: 'bearer'; token: string | (() => string | Promise<string>) }
  | { type: 'basic'; username: string; password: string }
  | {
      type: 'apiKey';
      key: string | (() => string | Promise<string>);
      location: 'header' | 'query' | 'cookie';
      name: string;
    }
  | { type: 'custom'; apply: (request: Request) => Request | Promise<Request> };

export interface RetryConfig {
  retries: number;
  strategy: 'exponential' | 'linear' | ((attempt: number, baseBackoff: number) => number);
  backoffMs: number;
  retryOn: number[];
  retryOnError?: (error: Error) => boolean;
}

export type StreamingFormat = 'sse' | 'ndjson';

export interface HooksConfig {
  beforeRequest?: (request: Request) => void | Promise<void>;
  afterResponse?: (response: Response) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  beforeRetry?: (attempt: number, error: Error) => void | Promise<void>;
  onStreamStart?: () => void;
  onStreamChunk?: (chunk: unknown) => void;
  onStreamEnd?: () => void;
}

export interface FetchClientConfig {
  baseURL?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: Partial<RetryConfig>;
  hooks?: HooksConfig;
  authStrategies?: AuthStrategy[];
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface FetchResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export interface StreamingRequestOptions extends RequestOptions {
  format: StreamingFormat;
}
