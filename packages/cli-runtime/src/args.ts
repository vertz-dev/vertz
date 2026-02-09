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

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    flags: {},
    globalFlags: { help: false, version: false },
  };

  let i = 0;

  // Extract positional args (namespace, command)
  if (i < argv.length && !argv[i]?.startsWith('-')) {
    result.namespace = argv[i];
    i++;
  }
  if (i < argv.length && !argv[i]?.startsWith('-')) {
    result.command = argv[i];
    i++;
  }

  // Parse flags
  while (i < argv.length) {
    const arg = argv[i] ?? '';

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      let flagName: string;
      let inlineValue: string | undefined;

      if (eqIndex !== -1) {
        flagName = arg.slice(2, eqIndex);
        inlineValue = arg.slice(eqIndex + 1);
      } else {
        flagName = arg.slice(2);
      }

      if (flagName === 'help') {
        result.globalFlags.help = true;
      } else if (flagName === 'version') {
        result.globalFlags.version = true;
      } else if (flagName === 'output' && i + 1 < argv.length) {
        result.globalFlags.output = argv[i + 1];
        i++;
      } else if (inlineValue !== undefined) {
        result.flags[flagName] = inlineValue;
      } else if (i + 1 < argv.length && !argv[i + 1]?.startsWith('-')) {
        const nextVal = argv[i + 1];
        if (nextVal !== undefined) {
          result.flags[flagName] = nextVal;
        }
        i++;
      } else {
        result.flags[flagName] = true;
      }
    }

    i++;
  }

  return result;
}
