export interface ParsedArgs {
  namespace?: string;
  command?: string;
  flags: Record<string, string | boolean>;
  globalFlags: {
    help: boolean;
    version: boolean;
    output?: string;
  };
}
export declare function parseArgs(argv: string[]): ParsedArgs;
//# sourceMappingURL=args.d.ts.map
