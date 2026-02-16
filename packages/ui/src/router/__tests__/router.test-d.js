/**
 * Type-level tests for the router module.
 *
 * These tests verify that generic type parameters flow correctly
 * through the route definition and matching pipeline. They are
 * checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */
const _static = {};
void _static;
const _single = { id: '123' };
void _single;
const _multi = { id: '1', postId: '42' };
void _multi;
const _wildcard = { '*': 'path/to/file' };
void _wildcard;
const _paramWild = { '*': 'extra', id: '1' };
void _paramWild;
// ─── ExtractParams negative tests (compiler must reject) ───────────────────
// @ts-expect-error - static path should not accept arbitrary params
const _badStatic = { id: '123' };
void _badStatic;
// @ts-expect-error - missing required param 'id'
const _missingParam = {};
void _missingParam;
// @ts-expect-error - wrong param name
const _wrongParam = { name: '123' };
void _wrongParam;
// @ts-expect-error - missing second param 'postId'
const _missingSecond = { id: '1' };
void _missingSecond;
// ─── RouteConfig loader params flow ────────────────────────────────────────
// Loader params must match ExtractParams<TPath>
const _routeWithLoader = {
  component: () => document.createElement('div'),
  loader: ({ params }) => {
    // params.id should be string
    const _id = params.id;
    void _id;
    // @ts-expect-error - 'name' does not exist on ExtractParams<'/users/:id'>
    const _bad = params.name;
    void _bad;
    return Promise.resolve({ name: 'Alice' });
  },
};
void _routeWithLoader;
// End-to-end: params flow from path literal through RouteConfig.loader
const _nestedRoute = {
  component: () => document.createElement('div'),
  loader: ({ params }) => {
    const _orgId = params.orgId;
    const _repoId = params.repoId;
    void _orgId;
    void _repoId;
    // @ts-expect-error - 'id' does not exist
    const _noId = params.id;
    void _noId;
    return { stars: 42 };
  },
};
void _nestedRoute;
// ─── Loader context: signal property ─────────────────────────────────────────
// signal should be AbortSignal in loader context
const _routeWithSignal = {
  component: () => document.createElement('div'),
  loader: ({ params, signal }) => {
    const _id = params.id;
    void _id;
    // signal should be AbortSignal
    const _signal = signal;
    void _signal;
    return { item: 'test' };
  },
};
void _routeWithSignal;
// Non-existent context property should be rejected
const _routeBadCtx = {
  component: () => document.createElement('div'),
  loader: (ctx) => {
    // @ts-expect-error - 'badProp' does not exist on loader context
    const _bad = ctx.badProp;
    void _bad;
    return { item: 'test' };
  },
};
void _routeBadCtx;
export {};
//# sourceMappingURL=router.test-d.js.map
