import {
  createHttpError,
  err,
  type FetchError,
  FetchNetworkError,
  FetchTimeoutError,
  FetchValidationError,
  ok,
  ParseError,
} from '@vertz/errors';
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
    this.fetchFn = (config.fetch ?? globalThis.fetch).bind(globalThis);
  }

  async request<T>(
    method: string,
    path: string,
    options?: RequestOptions,
  ): Promise<FetchResponse<T>> {
    try {
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

          // Parse serverCode from response body if available
          let serverCode: string | undefined;
          if (body && typeof body === 'object' && 'error' in body) {
            const errorObj = body.error as
              | { code?: string; errors?: Array<{ path: string; message: string }> }
              | undefined;
            if (errorObj && typeof errorObj.code === 'string') {
              serverCode = errorObj.code;
            }

            // Check for validation errors
            if (errorObj?.code === 'ValidationError' && Array.isArray(errorObj.errors)) {
              return err(new FetchValidationError('Validation failed', errorObj.errors));
            }
          }

          const httpError = createHttpError(response.status, response.statusText, serverCode);

          if (attempt < retryConfig.retries && retryConfig.retryOn.includes(response.status)) {
            lastError = httpError;
            await this.config.hooks?.beforeRetry?.(attempt + 1, httpError);
            continue;
          }

          await this.config.hooks?.onError?.(httpError);
          return err(httpError);
        }

        await this.config.hooks?.afterResponse?.(response);

        // Skip JSON parse for empty-body responses (204, 205)
        if (response.status === 204 || response.status === 205) {
          return ok({ data: undefined as T, status: response.status, headers: response.headers });
        }

        let data: T;
        try {
          data = (await response.json()) as T;
        } catch (parseError) {
          return err(new ParseError('', 'Failed to parse response JSON', parseError));
        }

        return ok({
          data,
          status: response.status,
          headers: response.headers,
        });
      }

      // Unreachable: the loop always returns within the retry logic
      return err(lastError ?? new FetchNetworkError('All retries exhausted'));
    } catch (error) {
      // Check if this is a timeout error (AbortError from AbortSignal)
      if (error instanceof Error && error.name === 'AbortError') {
        // Check if it's a timeout (AbortSignal.timeout) vs user abort
        const abortSignal = error instanceof DOMException ? error.cause : error;
        if (abortSignal instanceof Error && abortSignal.name === 'TimeoutError') {
          return err(new FetchTimeoutError());
        }
        // User aborted - treat as network error
        return err(new FetchNetworkError('Request aborted'));
      }

      return err(new FetchNetworkError('Network request failed'));
    }
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

      // Parse serverCode from response body if available
      let serverCode: string | undefined;
      if (body && typeof body === 'object' && 'error' in body) {
        const errorObj = body.error as { code?: string } | undefined;
        if (errorObj && typeof errorObj.code === 'string') {
          serverCode = errorObj.code;
        }
      }

      const httpError = createHttpError(response.status, response.statusText, serverCode);
      await this.config.hooks?.onError?.(httpError);
      throw httpError;
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
    const isAbsoluteBase = base && /^https?:\/\//.test(base);

    let urlString: string;
    if (base && isAbsoluteBase) {
      // Absolute base: use URL resolution
      const relativePath = path.startsWith('/') ? path.slice(1) : path;
      const normalizedBase = base.endsWith('/') ? base : `${base}/`;
      urlString = new URL(relativePath, normalizedBase).toString();
    } else if (base) {
      // Relative base (e.g. '/api'): use string concatenation
      const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      urlString = `${normalizedBase}${normalizedPath}`;
    } else {
      urlString = path;
    }

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
      const qs = params.toString();
      if (qs) {
        urlString += `${urlString.includes('?') ? '&' : '?'}${qs}`;
      }
    }

    return urlString;
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
