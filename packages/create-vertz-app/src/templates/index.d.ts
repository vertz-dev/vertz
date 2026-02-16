import type { Runtime } from '../types.js';
/**
 * Package.json template
 */
export declare function packageJsonTemplate({
  projectName,
  runtime,
}: {
  projectName: string;
  runtime: Runtime;
  includeExample?: boolean;
}): string;
/**
 * Tsconfig.json template - runtime-specific types
 */
export declare function tsconfigTemplate(runtime: Runtime): string;
/**
 * vertz.config.ts template
 */
export declare function vertzConfigTemplate(): string;
/**
 * .env template
 */
export declare function envTemplate(): string;
/**
 * .env.example template
 */
export declare function envExampleTemplate(): string;
/**
 * .gitignore template
 */
export declare function gitignoreTemplate(): string;
/**
 * src/env.ts template
 */
export declare function envSrcTemplate(): string;
/**
 * src/app.ts template
 */
export declare function appTemplate(): string;
/**
 * src/main.ts template
 */
export declare function mainTemplate(): string;
/**
 * src/middlewares/request-id.middleware.ts template
 */
export declare function requestIdMiddlewareTemplate(): string;
/**
 * src/modules/health.module-def.ts template
 */
export declare function healthModuleDefTemplate(): string;
/**
 * src/modules/health.module.ts template
 */
export declare function healthModuleTemplate(): string;
/**
 * src/modules/health.service.ts template
 */
export declare function healthServiceTemplate(): string;
/**
 * src/modules/health.router.ts template
 */
export declare function healthRouterTemplate(): string;
/**
 * src/modules/schemas/health-check.schema.ts template
 */
export declare function healthCheckSchemaTemplate(): string;
/**
 * deno.json template for Deno runtime
 */
export declare function denoConfigTemplate(): string;
//# sourceMappingURL=index.d.ts.map
