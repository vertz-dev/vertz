/**
 * Type-level tests for View Transitions router integration.
 *
 * Checked by `tsc --noEmit` (typecheck), not at runtime.
 */

import type { RouteConfig, RouteConfigLike } from '../define-routes';
import { defineRoutes } from '../define-routes';
import type { NavigateOptions, RouterOptions } from '../navigate';
import { createRouter } from '../navigate';

// ─── RouteConfig.viewTransition ─────────────────────────────────────────

// Accepts boolean
const _routeVTTrue: RouteConfig = {
  component: () => document.createElement('div'),
  viewTransition: true,
};
void _routeVTTrue;

const _routeVTFalse: RouteConfig = {
  component: () => document.createElement('div'),
  viewTransition: false,
};
void _routeVTFalse;

// Accepts ViewTransitionConfig
const _routeVTConfig: RouteConfig = {
  component: () => document.createElement('div'),
  viewTransition: { className: 'slide' },
};
void _routeVTConfig;

// Accepts ViewTransitionConfig without className (default cross-fade)
const _routeVTEmpty: RouteConfig = {
  component: () => document.createElement('div'),
  viewTransition: {},
};
void _routeVTEmpty;

const _routeVTBadNum: RouteConfig = {
  component: () => document.createElement('div'),
  // @ts-expect-error — viewTransition rejects number
  viewTransition: 42,
};
void _routeVTBadNum;

const _routeVTBadStr: RouteConfig = {
  component: () => document.createElement('div'),
  // @ts-expect-error — viewTransition rejects string (use { className } instead)
  viewTransition: 'slide',
};
void _routeVTBadStr;

// ─── RouteConfigLike.viewTransition ─────────────────────────────────────

const _likeVT: RouteConfigLike = {
  component: () => document.createElement('div'),
  viewTransition: true,
};
void _likeVT;

const _likeVTConfig: RouteConfigLike = {
  component: () => document.createElement('div'),
  viewTransition: { className: 'fade' },
};
void _likeVTConfig;

// ─── RouterOptions.viewTransition ───────────────────────────────────────

const _optsTrue: RouterOptions = { viewTransition: true };
void _optsTrue;

const _optsConfig: RouterOptions = { viewTransition: { className: 'fade' } };
void _optsConfig;

const _optsUndef: RouterOptions = {};
void _optsUndef;

// ─── NavigateOptions.viewTransition ─────────────────────────────────────

const _navTrue: NavigateOptions = { viewTransition: true };
void _navTrue;

const _navFalse: NavigateOptions = { viewTransition: false };
void _navFalse;

const _navConfig: NavigateOptions = { viewTransition: { className: 'slide' } };
void _navConfig;

// ─── defineRoutes accepts viewTransition ─────────────────────────────────

const _vtRoutes = defineRoutes({
  '/': { component: () => document.createElement('div'), viewTransition: true },
  '/about': {
    component: () => document.createElement('div'),
    viewTransition: { className: 'slide' },
  },
  '/no-vt': { component: () => document.createElement('div'), viewTransition: false },
});
void _vtRoutes;

// ─── createRouter accepts viewTransition in options ─────────────────────

const _vtRouter = createRouter(_vtRoutes, '/', { viewTransition: true });
void _vtRouter;

const _vtRouterConfig = createRouter(_vtRoutes, '/', {
  viewTransition: { className: 'fade' },
});
void _vtRouterConfig;
