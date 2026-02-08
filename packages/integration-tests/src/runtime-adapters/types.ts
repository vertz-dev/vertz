export interface ServerHandle {
  port: number;
  url: string;
  close(): Promise<void>;
}

export interface RuntimeAdapter {
  name: string;
  createServer(handler: (req: Request) => Promise<Response>): Promise<ServerHandle>;
}
