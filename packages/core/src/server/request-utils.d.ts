export interface ParsedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  raw: Request;
}
export declare function parseRequest(request: Request): ParsedRequest;
export declare function parseBody(request: Request): Promise<unknown>;
//# sourceMappingURL=request-utils.d.ts.map
