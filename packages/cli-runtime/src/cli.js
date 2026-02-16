import { FetchClient } from '@vertz/fetch';
import { parseArgs } from './args';
import { generateCommandHelp, generateHelp, generateNamespaceHelp } from './help';
import { formatOutput } from './output';
import { resolveParameters } from './resolver';
export function createCLI(config, options = {}) {
  const write = options.output ?? defaultOutput;
  const writeError = options.errorOutput ?? defaultErrorOutput;
  return {
    async run(argv) {
      const parsed = parseArgs(argv);
      // --version
      if (parsed.globalFlags.version) {
        write(`${config.name} v${config.version}`);
        return;
      }
      // No namespace: show top-level help
      if (!parsed.namespace) {
        write(generateHelp(config.name, config.version, config.commands));
        return;
      }
      // --help at top level
      if (parsed.globalFlags.help && !parsed.command) {
        if (parsed.namespace && config.commands[parsed.namespace]) {
          write(
            generateNamespaceHelp(config.name, parsed.namespace, config.commands[parsed.namespace]),
          );
          return;
        }
        write(generateHelp(config.name, config.version, config.commands));
        return;
      }
      const namespaceCommands = config.commands[parsed.namespace];
      if (!namespaceCommands) {
        writeError(`Unknown namespace: ${parsed.namespace}`);
        write(generateHelp(config.name, config.version, config.commands));
        return;
      }
      // Only namespace, no command: show namespace help
      if (!parsed.command) {
        write(generateNamespaceHelp(config.name, parsed.namespace, namespaceCommands));
        return;
      }
      const commandDef = namespaceCommands[parsed.command];
      if (!commandDef) {
        writeError(`Unknown command: ${parsed.namespace} ${parsed.command}`);
        write(generateNamespaceHelp(config.name, parsed.namespace, namespaceCommands));
        return;
      }
      // --help at command level
      if (parsed.globalFlags.help) {
        write(generateCommandHelp(parsed.namespace, parsed.command, commandDef));
        return;
      }
      // Execute the command
      try {
        const client = new FetchClient({ baseURL: options.baseURL });
        const context = { client, args: parsed.flags };
        const resolvedParams = await resolveParameters(
          commandDef,
          parsed.flags,
          config.resolvers ?? {},
          context,
          options.promptAdapter,
        );
        // Build the request URL by replacing path params
        let path = commandDef.path;
        const queryParams = {};
        const bodyParams = {};
        if (commandDef.params) {
          for (const paramName of Object.keys(commandDef.params)) {
            const value = resolvedParams[paramName];
            if (value !== undefined) {
              path = path.replace(`:${paramName}`, String(value));
            }
          }
        }
        if (commandDef.query) {
          for (const queryName of Object.keys(commandDef.query)) {
            const value = resolvedParams[queryName];
            if (value !== undefined) {
              queryParams[queryName] = value;
            }
          }
        }
        if (commandDef.body) {
          for (const bodyName of Object.keys(commandDef.body)) {
            const value = resolvedParams[bodyName];
            if (value !== undefined) {
              bodyParams[bodyName] = value;
            }
          }
        }
        const hasQuery = Object.keys(queryParams).length > 0;
        const hasBody = Object.keys(bodyParams).length > 0;
        const response = await client.request(commandDef.method, path, {
          query: hasQuery ? queryParams : undefined,
          body: hasBody ? bodyParams : undefined,
        });
        const format = parsed.globalFlags.output ?? 'json';
        write(formatOutput(response.data, format));
      } catch (error) {
        if (error instanceof Error) {
          writeError(`Error: ${error.message}`);
        } else {
          writeError('An unexpected error occurred');
        }
      }
    },
  };
}
function defaultOutput(text) {
  console.log(text);
}
function defaultErrorOutput(text) {
  console.error(text);
}
//# sourceMappingURL=cli.js.map
