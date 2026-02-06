export interface ListenOptions {
  hostname?: string;
}

export interface ServerHandle {
  readonly port: number;
  readonly hostname: string;
  close(): Promise<void>;
}

export interface ServerAdapter {
  listen(
    port: number,
    handler: (request: Request) => Promise<Response>,
    options?: ListenOptions,
  ): Promise<ServerHandle>;
}
