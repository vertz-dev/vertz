import { defineRoutes, createRouter } from '@vertz/ui/router';

const routes = defineRoutes({
  '/': {
    component: () => import('./pages/dashboard'),
  },
  '/workflows/:id': {
    component: () => import('./pages/workflow-detail'),
  },
  '/workflows/:id/steps/:step': {
    component: () => import('./pages/step-inspector'),
  },
  '/agents': {
    component: () => import('./pages/agents'),
  },
  '/definitions': {
    component: () => import('./pages/definitions-list'),
  },
  '/definitions/:name': {
    component: () => import('./pages/definition-detail'),
  },
});

export const appRouter = createRouter(routes);
