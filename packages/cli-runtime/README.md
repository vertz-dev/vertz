# @vertz/cli-runtime

> ⚠️ **Internal package** — This package is an implementation detail of the Vertz framework. It is published for use by other `@vertz/*` packages. No API stability is guaranteed between versions.

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
      },
      get: {
        description: 'Get a user by ID',
        method: 'GET',
        path: '/users/:id',
        params: {
          id: {
            type: 'string',
            description: 'User ID',
            required: true,
          },
        },
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
import type { CommandDefinition, ResolverContext, PromptAdapter } from '@vertz/cli-runtime';

const command: CommandDefinition = {
  description: 'Create a user',
  method: 'POST',
  path: '/users',
  body: {
    name: {
      type: 'string',
      description: 'User name',
      required: true,
    },
    role: {
      type: 'string',
      description: 'User role',
      required: true,
      enum: ['admin', 'user'],
    },
  },
};

const flags = { name: 'Alice' }; // role not provided

const resolvers = {
  // Custom resolvers for parameters that need dynamic options
  organization: {
    param: 'organization',
    prompt: 'Select organization',
    async fetchOptions(context: ResolverContext) {
      // Fetch from API
      return [
        { value: 'org1', label: 'Organization 1' },
        { value: 'org2', label: 'Organization 2' },
      ];
    },
  },
};

const context: ResolverContext = {
  client: createFetchClient({ baseURL: 'https://api.example.com' }),
  args: {},
};

const promptAdapter: PromptAdapter = {
  async select({ message, choices }) {
    // Pick first option in non-interactive mode
    return choices[0]?.value ?? '';
  },
  async text({ message, defaultValue }) {
    return defaultValue ?? '';
  },
};

const resolved = await resolveParameters(
  command,
  flags,
  resolvers,
  context,
  promptAdapter,
);

console.log(resolved);
// { name: 'Alice', role: 'admin' }
```

### Authentication

The `AuthManager` handles OAuth device code flow and token storage:

```typescript
import { createAuthManager } from '@vertz/cli-runtime';
import { createFetchClient } from '@vertz/fetch';

// Create auth manager with config directory
const auth = createAuthManager({
  configDir: '~/.myapp',
});

// Create a fetch client for API requests
const client = createFetchClient({ baseURL: 'https://api.example.com' });

// Initiate device code flow
const deviceCode = await auth.initiateDeviceCodeFlow(
  client,
  'https://auth.example.com/device',
  'my-cli-app',
  ['read', 'write'], // optional scopes
);

console.log(`Visit ${deviceCode.verification_uri}`);
console.log(`Code: ${deviceCode.user_code}`);

// Poll for token
const tokenResponse = await auth.pollForToken(
  client,
  'https://auth.example.com/token',
  deviceCode.device_code,
  'my-cli-app',
  deviceCode.interval,
  deviceCode.expires_in,
);

console.log('Logged in!');
console.log(tokenResponse.access_token);

// Later: retrieve stored credentials
const stored = await auth.loadCredentials();
if (stored.accessToken) {
  console.log('Already logged in');
}

// Get access token (checks expiration)
const token = await auth.getAccessToken();
if (token) {
  console.log('Valid token:', token);
}

// Refresh token if needed
const refreshed = await auth.refreshAccessToken(
  client,
  'https://auth.example.com/token',
  'my-cli-app',
);

// Store tokens manually if needed
await auth.storeTokens(tokenResponse);

// Clear credentials
await auth.clearCredentials();
```

**Config storage:**

Credentials are stored in `~/.myapp/credentials.json` (or your custom config dir):

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresAt": 1234567890,
  "apiKey": "..."
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

// Human-readable output
console.log(formatOutput(data, 'human'));
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

- **`resolveParameters(definition, flags, resolvers, context, promptAdapter?)`** — Resolve command parameters
  - `definition`: Full command definition (includes params, query, body)
  - `flags`: Parsed flags from command line
  - `resolvers`: Map of parameter resolvers for dynamic options
  - `context`: Resolver context with fetch client and args
  - `promptAdapter`: Optional custom prompt adapter
  - Resolves from flags, prompts for missing values, applies defaults
  - Returns object with resolved parameter values
  - Throws `CliRuntimeError` if required parameters are missing and prompting is disabled

### Authentication

- **`createAuthManager(config, store?)`** — Create auth manager
  - `config.configDir`: Config storage directory
  - `store`: Optional custom `ConfigStore` implementation
  - Methods:
    - `initiateDeviceCodeFlow(client, deviceAuthUrl, clientId, scopes?)`: Initiate device code flow
    - `pollForToken(client, tokenUrl, deviceCode, clientId, interval, expiresIn)`: Poll for access token
    - `loadCredentials()`: Load stored credentials
    - `storeTokens(tokenResponse)`: Store token response
    - `clearCredentials()`: Remove stored credentials
    - `getAccessToken()`: Get access token (checks expiration)
    - `getApiKey()`: Get stored API key
    - `setApiKey(apiKey)`: Store API key
    - `refreshAccessToken(client, tokenUrl, clientId)`: Refresh access token using refresh token

### Output Formatting

- **`formatOutput(data, format)`** — Format data for CLI output
  - `format`: `'json'`, `'table'`, or `'human'`
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
  params?: Record<string, FieldDefinition>;
  query?: Record<string, FieldDefinition>;
  body?: Record<string, FieldDefinition>;
}
```

### FieldDefinition

```typescript
interface FieldDefinition {
  type: string;
  description?: string;
  required: boolean;
  enum?: string[];
}
```

### PromptAdapter

```typescript
interface PromptAdapter {
  select: (options: { message: string; choices: SelectOption[] }) => Promise<string>;
  text: (options: { message: string; defaultValue?: string }) => Promise<string>;
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
