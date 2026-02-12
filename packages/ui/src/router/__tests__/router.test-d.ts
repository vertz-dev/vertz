/**
 * Type-level tests for the router module.
 *
 * These tests verify that generic type parameters flow correctly
 * through the route definition and matching pipeline. They are
 * checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { RouteConfig } from '../define-routes';
import type { ExtractParams } from '../params';

// ─── ExtractParams positive tests ──────────────────────────────────────────

// Static path produces empty params
type StaticParams = ExtractParams<'/about'>;
const _static: StaticParams = {} as Record<string, never>;
void _static;

// Single param
type SingleParam = ExtractParams<'/users/:id'>;
const _single: SingleParam = { id: '123' };
void _single;

// Multiple params
type MultiParam = ExtractParams<'/users/:id/posts/:postId'>;
const _multi: MultiParam = { id: '1', postId: '42' };
void _multi;

// Wildcard
type WildcardParam = ExtractParams<'/files/*'>;
const _wildcard: WildcardParam = { '*': 'path/to/file' };
void _wildcard;

// Param + wildcard
type ParamWildcard = ExtractParams<'/users/:id/*'>;
const _paramWild: ParamWildcard = { '*': 'extra', id: '1' };
void _paramWild;

// ─── ExtractParams negative tests (compiler must reject) ───────────────────

// @ts-expect-error - static path should not accept arbitrary params
const _badStatic: ExtractParams<'/about'> = { id: '123' };
void _badStatic;

// @ts-expect-error - missing required param 'id'
const _missingParam: ExtractParams<'/users/:id'> = {};
void _missingParam;

// @ts-expect-error - wrong param name
const _wrongParam: ExtractParams<'/users/:id'> = { name: '123' };
void _wrongParam;

// @ts-expect-error - missing second param 'postId'
const _missingSecond: ExtractParams<'/users/:id/posts/:postId'> = { id: '1' };
void _missingSecond;

// ─── RouteConfig loader params flow ────────────────────────────────────────

// Loader params must match ExtractParams<TPath>
const _routeWithLoader: RouteConfig<'/users/:id', { name: string }> = {
  component: () => document.createElement('div'),
  loader: ({ params }) => {
    // params.id should be string
    const _id: string = params.id;
    void _id;

    // @ts-expect-error - 'name' does not exist on ExtractParams<'/users/:id'>
    const _bad: string = params.name;
    void _bad;

    return Promise.resolve({ name: 'Alice' });
  },
};
void _routeWithLoader;

// End-to-end: params flow from path literal through RouteConfig.loader
const _nestedRoute: RouteConfig<'/orgs/:orgId/repos/:repoId', { stars: number }> = {
  component: () => document.createElement('div'),
  loader: ({ params }) => {
    const _orgId: string = params.orgId;
    const _repoId: string = params.repoId;
    void _orgId;
    void _repoId;

    // @ts-expect-error - 'id' does not exist
    const _noId: string = params.id;
    void _noId;

    return { stars: 42 };
  },
};
void _nestedRoute;
