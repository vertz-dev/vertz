import type {
  FetchClientConfig,
  FetchResponse,
  RequestOptions,
  StreamingRequestOptions,
} from './types';
export declare class FetchClient {
  private readonly config;
  private readonly fetchFn;
  constructor(config: FetchClientConfig);
  request<T>(method: string, path: string, options?: RequestOptions): Promise<FetchResponse<T>>;
  requestStream<T>(
    options: StreamingRequestOptions & {
      method: string;
      path: string;
    },
  ): AsyncGenerator<T>;
  private parseSSEBuffer;
  private parseNDJSONBuffer;
  private buildSignal;
  private resolveRetryConfig;
  private calculateBackoff;
  private sleep;
  private buildURL;
  private applyAuth;
  private applyStrategy;
  private safeParseJSON;
}
//# sourceMappingURL=client.d.ts.map
