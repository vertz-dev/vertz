import { createErrorFromStatus, type FetchError } from './errors';
import type {
  AuthStrategy,
  FetchClientConfig,
  FetchResponse,
  RequestOptions,
  RetryConfig,
  StreamingRequestOptions,
} from './types';

const DEFAULT_RETRY_ON = [429, 500, 502, 503, 504];

export class FetchClient {
  private readonly config: FetchClientConfig;
  private readonly fetchFn: typeof fetch;

  constructor(config: FetchClientConfig) {
    this.config = config;
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  async request<T>(
    method: string,
    path: string,
    options?: RequestOptions,
  ): Promise<FetchResponse<T>> {
    const retryConfig = this.resolveRetryConfig();
    let lastError: FetchError | undefined;

    for (let attempt = 0; attempt <= retryConfig.retries; attempt++) {
      if (attempt > 0) {
        const delay = this.calculateBackoff(attempt, retryConfig);
        await this.sleep(delay);
      }

      const url = this.buildURL(path, options?.query);
      const headers = new Headers(this.config.headers);

      if (options?.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          headers.set(key, value);
        }
      }

      const signal = this.buildSignal(options?.signal);

      const request = new Request(url, {
        method,
        headers,
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal,
      });

      if (options?.body !== undefined) {
        request.headers.set('Content-Type', 'application/json');
      }

      const authedRequest = await this.applyAuth(request);

      await this.config.hooks?.beforeRequest?.(authedRequest);

      const response = await this.fetchFn(authedRequest);

      if (!response.ok) {
        const body = await this.safeParseJSON(response);
        const error = createErrorFromStatus(response.status, response.statusText, body);

        if (attempt < retryConfig.retries && retryConfig.retryOn.includes(response.status)) {
          lastError = error;
          await this.config.hooks?.beforeRetry?.(attempt + 1, error);
          continue;
        }

        await this.config.hooks?.onError?.(error);
        throw error;
      }

      await this.config.hooks?.afterResponse?.(response);

      const data = (await response.json()) as T;

      return {
        data,
        status: response.status,
        headers: response.headers,
      };
    }

    // This is unreachable: the loop always either returns or throws.
    // If retries are exhausted, the last iteration throws on the non-retryable path.
    throw lastError;
  }

  async get<T>(path: string, options?: RequestOptions): Promise<FetchResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<FetchResponse<T>> {
    return this.request<T>('POST', path, { ...options, body });
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<FetchResponse<T>> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  async patch<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<FetchResponse<T>> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<FetchResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }

  async *requestStream<T>(
    options: StreamingRequestOptions & { method: string; path: string },
  ): AsyncGenerator<T> {
    const url = this.buildURL(options.path, options.query);
    const headers = new Headers(this.config.headers);

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        headers.set(key, value);
      }
    }

    if (options.format === 'sse') {
      headers.set('Accept', 'text/event-stream');
    } else {
      headers.set('Accept', 'application/x-ndjson');
    }

    const signal = this.buildSignal(options.signal);

    const request = new Request(url, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal,
    });

    const authedRequest = await this.applyAuth(request);

    await this.config.hooks?.beforeRequest?.(authedRequest);

    const response = await this.fetchFn(authedRequest);

    if (!response.ok) {
      const body = await this.safeParseJSON(response);
      const error = createErrorFromStatus(response.status, response.statusText, body);
      await this.config.hooks?.onError?.(error);
      throw error;
    }

    if (!response.body) {
      return;
    }

    this.config.hooks?.onStreamStart?.();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        if (options.format === 'sse') {
          yield* this.parseSSEBuffer<T>(buffer, (remaining) => {
            buffer = remaining;
          });
        } else {
          yield* this.parseNDJSONBuffer<T>(buffer, (remaining) => {
            buffer = remaining;
          });
        }
      }
    } finally {
      reader.releaseLock();
      this.config.hooks?.onStreamEnd?.();
    }
  }

  private *parseSSEBuffer<T>(
    buffer: string,
    setRemaining: (remaining: string) => void,
  ): Generator<T> {
    const events = buffer.split('\n\n');
    const remaining = events.pop() ?? '';
    setRemaining(remaining);

    for (const event of events) {
      if (!event.trim()) continue;

      const lines = event.split('\n');
      let data = '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          data += line.slice(6);
        } else if (line.startsWith('data:')) {
          data += line.slice(5);
        }
      }

      if (data) {
        const parsed = JSON.parse(data) as T;
        this.config.hooks?.onStreamChunk?.(parsed);
        yield parsed;
      }
    }
  }

  private *parseNDJSONBuffer<T>(
    buffer: string,
    setRemaining: (remaining: string) => void,
  ): Generator<T> {
    const lines = buffer.split('\n');
    const remaining = lines.pop() ?? '';
    setRemaining(remaining);

    for (const line of lines) {
      if (!line.trim()) continue;

      const parsed = JSON.parse(line) as T;
      this.config.hooks?.onStreamChunk?.(parsed);
      yield parsed;
    }
  }

  private buildSignal(userSignal?: AbortSignal): AbortSignal | undefined {
    const timeoutMs = this.config.timeoutMs;

    if (!timeoutMs && !userSignal) return undefined;
    if (!timeoutMs) return userSignal;

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (!userSignal) return timeoutSignal;

    return AbortSignal.any([userSignal, timeoutSignal]);
  }

  private resolveRetryConfig(): RetryConfig {
    const userConfig = this.config.retry;
    return {
      retries: userConfig?.retries ?? 0,
      strategy: userConfig?.strategy ?? 'exponential',
      backoffMs: userConfig?.backoffMs ?? 100,
      retryOn: userConfig?.retryOn ?? DEFAULT_RETRY_ON,
      retryOnError: userConfig?.retryOnError,
    };
  }

  private calculateBackoff(attempt: number, config: RetryConfig): number {
    const { strategy, backoffMs } = config;

    if (typeof strategy === 'function') {
      return strategy(attempt, backoffMs);
    }

    if (strategy === 'linear') {
      return backoffMs * attempt;
    }

    // exponential
    return backoffMs * 2 ** (attempt - 1);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private buildURL(path: string, query?: Record<string, unknown>): string {
    const base = this.config.baseURL;
    const url = base ? new URL(path, base) : new URL(path);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private async applyAuth(request: Request): Promise<Request> {
    const strategies = this.config.authStrategies;
    if (!strategies) return request;

    let current = request;
    for (const strategy of strategies) {
      current = await this.applyStrategy(current, strategy);
    }
    return current;
  }

  private async applyStrategy(request: Request, strategy: AuthStrategy): Promise<Request> {
    switch (strategy.type) {
      case 'bearer': {
        const token =
          typeof strategy.token === 'function' ? await strategy.token() : strategy.token;
        request.headers.set('Authorization', `Bearer ${token}`);
        return request;
      }
      case 'basic': {
        const encoded = btoa(`${strategy.username}:${strategy.password}`);
        request.headers.set('Authorization', `Basic ${encoded}`);
        return request;
      }
      case 'apiKey': {
        const key = typeof strategy.key === 'function' ? await strategy.key() : strategy.key;
        if (strategy.location === 'header') {
          request.headers.set(strategy.name, key);
        } else if (strategy.location === 'query') {
          const url = new URL(request.url);
          url.searchParams.set(strategy.name, key);
          return new Request(url, request);
        }
        return request;
      }
      case 'custom': {
        return await strategy.apply(request);
      }
    }
  }

  private async safeParseJSON(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

}
