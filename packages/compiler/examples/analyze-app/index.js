import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompiler } from '@vertz/compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
console.log('=== @vertz/compiler Example ===\n');
// Create compiler instance
const compiler = createCompiler({
  rootDir: join(__dirname, 'sample-app'),
  appFile: join(__dirname, 'sample-app/app.ts'),
  outDir: join(__dirname, '.vertz'),
});
console.log('1. Analyzing application...');
const ir = await compiler.analyze();
console.log(`\n✅ Analysis complete!`);
console.log(`   - Modules: ${ir.modules.length}`);
console.log(`   - Middleware: ${ir.middleware.length}`);
console.log(`   - Schemas: ${ir.schemas.length}`);
// Extract routes
const routes = ir.modules.flatMap((module) =>
  module.routers.flatMap((router) =>
    router.routes.map((route) => ({
      method: route.method,
      path: `${router.prefix}${route.path}`,
      module: module.name,
    })),
  ),
);
console.log(`   - Routes: ${routes.length}`);
console.log('\n2. Routes found:');
for (const route of routes) {
  console.log(
    `   ${route.method.toUpperCase().padEnd(7)} ${route.path.padEnd(30)} [${route.module}]`,
  );
}
// Run validators
console.log('\n3. Running validators...');
const diagnostics = await compiler.validate(ir);
if (diagnostics.length === 0) {
  console.log('   ✅ No issues found');
} else {
  console.log(`   Found ${diagnostics.length} diagnostic(s):`);
  for (const diag of diagnostics) {
    const icon = diag.severity === 'error' ? '❌' : diag.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`   ${icon} [${diag.code}] ${diag.message}`);
    if (diag.file) {
      console.log(`      at ${diag.file}:${diag.line ?? 0}:${diag.column ?? 0}`);
    }
  }
}
// Generate artifacts
console.log('\n4. Generating artifacts...');
await compiler.generate(ir);
console.log('   ✅ Generated boot.ts, manifest.json, and route table');
console.log('\n=== Compilation complete! ===');
//# sourceMappingURL=index.js.map
