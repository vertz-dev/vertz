import { createErrorFromStatus } from './errors';

const DEFAULT_RETRY_ON = [429, 500, 502, 503, 504];
export class FetchClient {
  config;
  fetchFn;
  constructor(config) {
    this.config = config;
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }
  async request(method, path, options) {
    const retryConfig = this.resolveRetryConfig();
    let lastError;
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
      const data = await response.json();
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
  async *requestStream(options) {
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
          yield* this.parseSSEBuffer(buffer, (remaining) => {
            buffer = remaining;
          });
        } else {
          yield* this.parseNDJSONBuffer(buffer, (remaining) => {
            buffer = remaining;
          });
        }
      }
    } finally {
      reader.releaseLock();
      this.config.hooks?.onStreamEnd?.();
    }
  }
  *parseSSEBuffer(buffer, setRemaining) {
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
        const parsed = JSON.parse(data);
        this.config.hooks?.onStreamChunk?.(parsed);
        yield parsed;
      }
    }
  }
  *parseNDJSONBuffer(buffer, setRemaining) {
    const lines = buffer.split('\n');
    const remaining = lines.pop() ?? '';
    setRemaining(remaining);
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line);
      this.config.hooks?.onStreamChunk?.(parsed);
      yield parsed;
    }
  }
  buildSignal(userSignal) {
    const timeoutMs = this.config.timeoutMs;
    if (!timeoutMs && !userSignal) return undefined;
    if (!timeoutMs) return userSignal;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (!userSignal) return timeoutSignal;
    return AbortSignal.any([userSignal, timeoutSignal]);
  }
  resolveRetryConfig() {
    const userConfig = this.config.retry;
    return {
      retries: userConfig?.retries ?? 0,
      strategy: userConfig?.strategy ?? 'exponential',
      backoffMs: userConfig?.backoffMs ?? 100,
      retryOn: userConfig?.retryOn ?? DEFAULT_RETRY_ON,
      retryOnError: userConfig?.retryOnError,
    };
  }
  calculateBackoff(attempt, config) {
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
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  buildURL(path, query) {
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
  async applyAuth(request) {
    const strategies = this.config.authStrategies;
    if (!strategies) return request;
    let current = request;
    for (const strategy of strategies) {
      current = await this.applyStrategy(current, strategy);
    }
    return current;
  }
  async applyStrategy(request, strategy) {
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
  async safeParseJSON(response) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }
}
//# sourceMappingURL=client.js.map
