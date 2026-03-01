import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { inferTypes: true },
  clean: true,
  external: ['@vertz/core', '@vertz/ui-server'],
  // onSuccess strips the CJS createRequire shim that Bun.build injects.
  // The shim references import.meta.url which is undefined on Cloudflare
  // Workers, and __require is never actually called in the output.
  onSuccess: async () => {
    const path = 'dist/index.js';
    const code = await Bun.file(path).text();
    const cleaned = code
      .replace(/import \{ createRequire \} from "node:module";\n?/, '')
      .replace(/var __require = \/\* @__PURE__ \*\/ createRequire\(import\.meta\.url\);\n?/, '');
    await Bun.write(path, cleaned);
  },
});
