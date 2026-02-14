# @vertz/cli-runtime

Runtime utilities for building CLIs with Vertz. Provides command parsing, help generation, parameter resolution, authentication, and formatted output.

## What it does

`@vertz/cli-runtime` powers the generated CLIs from `@vertz/codegen`. It handles:

- **Command parsing** — Extracts namespace, command, flags, and arguments from argv
- **Help generation** — Auto-generates help text for commands and namespaces
- **Parameter resolution** — Resolves command parameters from flags, prompts, or defaults
- **Authentication** — OAuth device code flow and token management
- **Output formatting** — JSON, table, or plain text output

This package is typically consumed by generated CLIs, but can also be used to build custom CLIs that interact with Vertz APIs.

## How it relates to @vertz/cli

| Package | Purpose |
|---------|---------|
| **@vertz/cli** | The `vertz` command-line tool for developers (dev server, codegen, build) |
| **@vertz/cli-runtime** | Runtime utilities for **generated** CLIs (e.g., `myapp users list`) |

**@vertz/cli** is the framework's CLI. **@vertz/cli-runtime** is the runtime for your app's CLI.

## Installation

```bash
npm install @vertz/cli-runtime
```

## Usage

### Creating a CLI

```typescript
import { createCLI } from '@vertz/cli-runtime';
import type { CLIConfig } from '@vertz/cli-runtime';

const config: CLIConfig = {
  name: 'myapp',
  version: '1.0.0',
  commands: {
    users: {
      list: {
        description: 'List all users',
        method: 'GET',
        path: '/users',
        parameters: [],
      },
      get: {
        description: 'Get a user by ID',
        method: 'GET',
        path: '/users/:id',
        parameters: [
          {
            name: 'id',
            type: 'string',
            description: 'User ID',
            required: true,
          },
        ],
      },
    },
  },
};

const cli = createCLI(config, {
  baseURL: 'https://api.example.com',
  output: console.log,
  errorOutput: console.error,
});

// Run with args
await cli.run(process.argv.slice(2));
```

**Example invocations:**

```bash
# Show top-level help
myapp --help

# Show namespace help
myapp users --help

# Run a command
myapp users list --format json
myapp users get --id 123
```

### Parsing arguments

```typescript
import { parseArgs } from '@vertz/cli-runtime';

const parsed = parseArgs(['users', 'get', '--id', '123', '--format', 'json']);

console.log(parsed);
// {
//   namespace: 'users',
//   command: 'get',
//   flags: { id: '123', format: 'json' },
//   globalFlags: { help: false, version: false },
// }
```

### Resolving parameters

```typescript
import { resolveParameters } from '@vertz/cli-runtime';
import type { CommandDefinition, ResolverContext } from '@vertz/cli-runtime';

const command: CommandDefinition = {
  description: 'Create a user',
  method: 'POST',
  path: '/users',
  parameters: [
    {
      name: 'name',
      type: 'string',
      description: 'User name',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      description: 'User role',
      required: true,
      options: [
        { value: 'admin', label: 'Administrator' },
        { value: 'user', label: 'Standard User' },
      ],
    },
  ],
};

const context: ResolverContext = {
  flags: { name: 'Alice' }, // role not provided
  promptAdapter: {
    // Interactive prompt for missing values
    async prompt(message, type, opts) {
      if (type === 'select') {
        return opts.options[0].value; // Pick first option
      }
      return 'default';
    },
  },
};

const resolved = await resolveParameters(command.parameters, context);

console.log(resolved);
// { name: 'Alice', role: 'admin' }
```

### Authentication

The `AuthManager` handles OAuth device code flow and token storage:

```typescript
import { createAuthManager } from '@vertz/cli-runtime';

const auth = createAuthManager({
  tokenURL: 'https://auth.example.com/token',
  deviceCodeURL: 'https://auth.example.com/device',
  clientId: 'my-cli-app',
  configDir: '~/.myapp',
});

// Start device code flow
const deviceCode = await auth.startDeviceCodeFlow();

console.log(`Visit ${deviceCode.verificationUri}`);
console.log(`Code: ${deviceCode.userCode}`);

// Poll for token
const credentials = await auth.pollForToken(
  deviceCode.deviceCode,
  deviceCode.interval,
);

console.log('Logged in!');
console.log(credentials.accessToken);

// Later: retrieve stored credentials
const stored = await auth.loadCredentials();
if (stored) {
  console.log('Already logged in');
}
```

**Config storage:**

Credentials are stored in `~/.myapp/config.json` (or your custom config dir):

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresAt": 1234567890
}
```

### Output formatting

```typescript
import { formatOutput } from '@vertz/cli-runtime';

const data = [
  { id: '1', name: 'Alice', role: 'admin' },
  { id: '2', name: 'Bob', role: 'user' },
];

// JSON output
console.log(formatOutput(data, 'json'));
// {"data":[{"id":"1","name":"Alice","role":"admin"},{"id":"2","name":"Bob","role":"user"}]}

// Table output
console.log(formatOutput(data, 'table'));
// ┌─────┬───────┬───────┐
// │ id  │ name  │ role  │
// ├─────┼───────┼───────┤
// │ 1   │ Alice │ admin │
// │ 2   │ Bob   │ user  │
// └─────┴───────┴───────┘

// Plain text output
console.log(formatOutput(data, 'text'));
// id: 1
// name: Alice
// role: admin
//
// id: 2
// name: Bob
// role: user
```

### Help generation

```typescript
import { generateHelp, generateCommandHelp } from '@vertz/cli-runtime';

// Top-level help
const help = generateHelp('myapp', '1.0.0', config.commands);
console.log(help);

// Command-specific help
const cmdHelp = generateCommandHelp('users', 'get', config.commands.users.get);
console.log(cmdHelp);
```

## Public API

### CLI Creation

- **`createCLI(config, options?)`** — Create a CLI runtime
  - `config`: Command definitions, name, version
  - `options.output`: Output function (default: `console.log`)
  - `options.errorOutput`: Error output function (default: `console.error`)
  - `options.promptAdapter`: Custom prompt handler
  - `options.baseURL`: API base URL for HTTP requests
  - Returns `CLIRuntime` with `run(argv)` method

### Argument Parsing

- **`parseArgs(argv)`** — Parse command-line arguments
  - Returns `{ namespace, command, flags, globalFlags }`

### Parameter Resolution

- **`resolveParameters(params, context)`** — Resolve command parameters
  - Resolves from flags, prompts for missing values, applies defaults
  - Returns object with resolved parameter values
  - Throws `CliRuntimeError` if required parameters are missing and prompting is disabled

### Authentication

- **`createAuthManager(config)`** — Create auth manager
  - `config.tokenURL`: OAuth token endpoint
  - `config.deviceCodeURL`: Device code endpoint
  - `config.clientId`: OAuth client ID
  - `config.configDir`: Config storage directory
  - Methods:
    - `startDeviceCodeFlow()`: Initiate device code flow
    - `pollForToken(deviceCode, interval)`: Poll for access token
    - `loadCredentials()`: Load stored credentials
    - `saveCredentials(creds)`: Save credentials
    - `clearCredentials()`: Remove stored credentials
    - `isAuthenticated()`: Check if valid credentials exist

### Output Formatting

- **`formatOutput(data, format)`** — Format data for CLI output
  - `format`: `'json'`, `'table'`, or `'text'`
  - Handles arrays, objects, primitives

### Help Generation

- **`generateHelp(name, version, commands)`** — Top-level help text
- **`generateNamespaceHelp(name, namespace, commands)`** — Namespace help
- **`generateCommandHelp(namespace, command, def)`** — Command help

## Type Definitions

### CLIConfig

```typescript
interface CLIConfig {
  name: string;
  version: string;
  commands: {
    [namespace: string]: {
      [command: string]: CommandDefinition;
    };
  };
}
```

### CommandDefinition

```typescript
interface CommandDefinition {
  description: string;
  method: HttpMethod;
  path: string;
  parameters: FieldDefinition[];
  auth?: 'required' | 'optional';
}
```

### FieldDefinition

```typescript
interface FieldDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  description: string;
  required?: boolean;
  default?: unknown;
  options?: SelectOption[]; // For select/multiselect
}
```

### PromptAdapter

```typescript
interface PromptAdapter {
  prompt(
    message: string,
    type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect',
    options?: {
      default?: unknown;
      options?: SelectOption[];
    }
  ): Promise<unknown>;
}
```

## Error Handling

The runtime throws `CliRuntimeError` for:

- Missing required parameters (when prompting is disabled)
- Invalid parameter types
- Authentication failures

```typescript
import { CliRuntimeError } from '@vertz/cli-runtime';

try {
  await cli.run(args);
} catch (error) {
  if (error instanceof CliRuntimeError) {
    console.error(`CLI Error: ${error.message}`);
  }
}
```

Authentication errors throw `AuthError`:

```typescript
import { AuthError } from '@vertz/cli-runtime';

try {
  await auth.startDeviceCodeFlow();
} catch (error) {
  if (error instanceof AuthError) {
    console.error(`Auth failed: ${error.message}`);
  }
}
```

## Integration with Generated CLIs

When you run `vertz codegen` with CLI generation enabled, the generated CLI uses this runtime:

**Generated entry point (e.g., `bin/myapp.js`):**

```typescript
#!/usr/bin/env node
import { createCLI } from '@vertz/cli-runtime';
import manifest from '../manifest.js';

const cli = createCLI(manifest, {
  baseURL: process.env.MYAPP_API_URL ?? 'https://api.example.com',
});

cli.run(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
```

**Generated manifest:**

```typescript
import type { CLIConfig } from '@vertz/cli-runtime';

const manifest: CLIConfig = {
  name: 'myapp',
  version: '1.0.0',
  commands: {
    users: {
      list: { /* ... */ },
      get: { /* ... */ },
    },
  },
};

export default manifest;
```

## Related Packages

- **[@vertz/codegen](../codegen)** — Generates CLIs that use this runtime
- **[@vertz/cli](../cli)** — The Vertz framework CLI (dev, build, codegen)
- **[@vertz/fetch](../fetch)** — HTTP client used by the CLI runtime

## License

MIT
