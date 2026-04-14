export interface ServerHandle {
  port: number;
  url: string;
  close(): Promise<void>;
}

export interface RuntimeAdapter {
  name: string;
  createServer(handler: (req: Request) => Promise<Response>): Promise<ServerHandle>;
}

export interface VtzHttpServer {
  id: number;
  port: number;
  hostname: string;
  close(): void;
}

declare global {
  // eslint-disable-next-line no-var
  var __vtz_http: {
    serve(
      port: number,
      hostname: string,
      handler: (req: Request) => Promise<Response>,
    ): Promise<VtzHttpServer>;
  };
}
