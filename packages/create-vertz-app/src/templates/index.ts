import type { Runtime } from '../types.js';

/**
 * Package.json template
 */
export function packageJsonTemplate({
  projectName,
  runtime,
}: {
  projectName: string;
  runtime: Runtime;
  includeExample?: boolean;
}): string {
  const deps: Record<string, string> = {
    '@vertz/core': '^0.1.0',
    '@vertz/schema': '^0.1.0',
    'envsafe': '^2.0.3',
  };

  const devDeps: Record<string, string> = {
    '@vertz/cli': '^0.1.0',
    typescript: '^5.9.3',
  };

  // Add runtime-specific type dependencies
  if (runtime === 'bun') {
    devDeps['bun-types'] = '^1.0.0';
  } else if (runtime === 'node') {
    devDeps['@types/node'] = '^20.0.0';
  }
  // deno: no additional types needed (built-in)

  const scripts: Record<string, string> = {};

  if (runtime === 'bun') {
    scripts.dev = 'bun run src/main.ts';
    scripts.build = 'vertz build';
    scripts.check = 'vertz check';
  } else if (runtime === 'node') {
    deps.tsx = '^4.19.0';
    scripts.dev = 'tsx watch src/main.ts';
    scripts.build = 'vertz build';
    scripts.check = 'vertz check';
  } else if (runtime === 'deno') {
    scripts.dev = 'deno run --watch src/main.ts';
    scripts.build = 'vertz build';
    scripts.check = 'deno check src/main.ts';
  }

  scripts.start = scripts.dev;

  const pkg = {
    name: projectName,
    version: '0.1.0',
    type: 'module',
    license: 'MIT',
    scripts,
    dependencies: deps,
    devDependencies: devDeps,
  };

  return JSON.stringify(pkg, null, 2);
}

/**
 * Tsconfig.json template - runtime-specific types
 */
export function tsconfigTemplate(runtime: Runtime): string {
  let types: string[] = [];

  if (runtime === 'bun') {
    types = ['bun-types'];
  } else if (runtime === 'node') {
    types = ['node'];
  }
  // deno: types = [] (deno has built-in types)

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      lib: ['ES2022'],
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      allowJs: true,
      outDir: './dist',
      rootDir: './src',
      types,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };

  return JSON.stringify(tsconfig, null, 2);
}

/**
 * vertz.config.ts template
 */
export function vertzConfigTemplate(): string {
  return `import { defineConfig } from '@vertz/core';

export default defineConfig({
  entry: './src/app.ts',
});
`;
}

/**
 * .env template
 */
export function envTemplate(): string {
  return `# Database connection string
DATABASE_URL=

# Add more environment variables below
`;
}

/**
 * .env.example template
 */
export function envExampleTemplate(): string {
  return `# Database connection string (leave blank in development)
DATABASE_URL=

# Add more environment variables below
`;
}

/**
 * .gitignore template
 */
export function gitignoreTemplate(): string {
  return `# Dependencies
node_modules/
.pnp/
.pnp.js

# Build outputs
dist/
.vertz/
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Test coverage
coverage/
`;
}

/**
 * src/env.ts template
 */
export function envSrcTemplate(): string {
  return `import { envsafe, str, port } from 'envsafe';

export const env = envsafe({
  DATABASE_URL: str({
    default: '',
    allowEmpty: true,
  }),
  PORT: port({
    default: 3000,
  }),
});
`;
}

/**
 * src/app.ts template
 */
export function appTemplate(includeExample: boolean): string {
  const imports = includeExample
    ? `import { vertz } from '@vertz/core';
import { healthModule } from './modules/health.module.js';`
    : `import { vertz } from '@vertz/core';`;

  const registerModules = includeExample
    ? `
  .register(healthModule)`
    : '';

  return `${imports}

const app = vertz
  .app({ basePath: '/api' })${registerModules};

export { app };
`;
}

/**
 * src/main.ts template
 */
export function mainTemplate(): string {
  return `import { app } from './app.js';
import { env } from './env.js';

app.listen(env.PORT).then((handle) => {
  console.log(\`✓ Server running at http://localhost:\${handle.port}/api\`);
});
`;
}

/**
 * src/middlewares/request-id.middleware.ts template
 */
export function requestIdMiddlewareTemplate(): string {
  return `import type { Middleware } from '@vertz/server';
import { randomUUID } from 'crypto';

export const requestIdMiddleware: Middleware = {
  name: 'requestId',
  handler: async (req, context, next) => {
    const requestId = req.headers.get('x-request-id') || randomUUID();
    
    context.set('requestId', requestId);
    
    const response = await next();
    
    response.headers.set('x-request-id', requestId);
    
    return response;
  },
};
`;
}

/**
 * src/modules/health.module-def.ts template
 */
export function healthModuleDefTemplate(): string {
  return `import { vertz } from '@vertz/core';

export const healthDef = vertz.moduleDef({ name: 'health' });
`;
}

/**
 * src/modules/health.module.ts template
 */
export function healthModuleTemplate(): string {
  return `import { vertz } from '@vertz/core';
import { healthDef } from './health.module-def.js';
import { healthRouter } from './health.router.js';
import { healthService } from './health.service.js';

export const healthModule = vertz.module(healthDef, {
  services: [healthService],
  routers: [healthRouter],
});
`;
}

/**
 * src/modules/health.service.ts template
 */
export function healthServiceTemplate(): string {
  return `import { healthDef } from './health.module-def.js';

export const healthService = healthDef.service({
  methods: () => ({
    check: () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    }),
  }),
});
`;
}

/**
 * src/modules/health.router.ts template
 */
export function healthRouterTemplate(): string {
  return `import { s } from '@vertz/schema';
import { healthDef } from './health.module-def.js';
import { healthService } from './health.service.js';

const HealthResponseSchema = s.object({
  status: s.string(),
  timestamp: s.string(),
});

export const healthRouter = healthDef
  .router({ prefix: '/health', inject: { healthService } })
  .get('/', {
    response: HealthResponseSchema,
    handler: (ctx) => ctx.healthService.check(),
  })
  .get('/ready', {
    response: s.object({ ready: s.boolean() }),
    handler: () => ({ ready: true }),
  });
`;
}

/**
 * src/modules/schemas/health-check.schema.ts template
 */
export function healthCheckSchemaTemplate(): string {
  return `import { s } from '@vertz/schema';

export const HealthCheckSchema = s.object({
  status: s.string(),
  timestamp: s.string(),
});
`;
}

/**
 * deno.json template for Deno runtime
 */
export function denoConfigTemplate(): string {
  const config = {
    imports: {
      '@vertz/server': 'jsr:@vertz/server@^0.1.0',
      '@vertz/schema': 'jsr:@vertz/schema@^0.1.0',
    },
    tasks: {
      dev: 'deno run --watch src/main.ts',
      check: 'deno check src/main.ts',
    },
    compilerOptions: {
      strict: true,
    },
  };

  return JSON.stringify(config, null, 2);
}
