const runtime = process.env.RUNTIME || 'node';
const adapters = {
  node: () => import('./node'),
  bun: () => import('./bun'),
  deno: () => import('./deno'),
};
const load = adapters[runtime];
if (!load) {
  throw new Error(
    `Unknown RUNTIME: ${runtime}. Expected one of: ${Object.keys(adapters).join(', ')}`,
  );
}
const { adapter } = await load();
export { adapter };
//# sourceMappingURL=index.js.map
