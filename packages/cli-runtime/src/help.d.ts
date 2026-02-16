import type { CommandDefinition, CommandManifest } from './types';
type NamespaceCommands = Record<string, CommandDefinition>;
export declare function generateHelp(
  name: string,
  version: string,
  commands: CommandManifest,
): string;
export declare function generateNamespaceHelp(
  name: string,
  namespace: string,
  commands: NamespaceCommands,
): string;
export declare function generateCommandHelp(
  namespace: string,
  command: string,
  definition: CommandDefinition,
): string;
//# sourceMappingURL=help.d.ts.map
