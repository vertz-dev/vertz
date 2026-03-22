import { defineAccess } from '@vertz/server';

export const access = defineAccess({
  entities: {
    workspace: {
      roles: ['owner', 'admin', 'member'],
    },
    project: {
      roles: ['lead', 'member'],
      inherits: {
        'workspace:owner': 'lead',
        'workspace:admin': 'lead',
        'workspace:member': 'member',
      },
    },
  },
  entitlements: {
    // Workspace-level
    'workspace:read': { roles: ['owner', 'admin', 'member'] },
    'workspace:manage': { roles: ['owner', 'admin'] },

    // Project-level
    'project:create': { roles: ['owner', 'admin', 'member'] },
    'project:read': { roles: ['lead', 'member'] },
    'project:update': { roles: ['lead'] },
    'project:delete': { roles: ['owner', 'admin'] },

    // Issue-level (inherits from project roles)
    'issue:create': { roles: ['lead', 'member'] },
    'issue:read': { roles: ['lead', 'member'] },
    'issue:update': { roles: ['lead', 'member'] },
    'issue:delete': { roles: ['lead'] },

    // Comment-level
    'comment:create': { roles: ['lead', 'member'] },
    'comment:read': { roles: ['lead', 'member'] },
    'comment:delete': { roles: ['lead'] },
  },
});
