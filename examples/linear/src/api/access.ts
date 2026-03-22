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
    // Workspace-level — uses workspace roles
    'workspace:read': { roles: ['owner', 'admin', 'member'] },
    'workspace:manage': { roles: ['owner', 'admin'] },
    // Creating/deleting projects is a workspace-level action
    'workspace:create-project': { roles: ['owner', 'admin', 'member'] },
    'workspace:delete-project': { roles: ['owner', 'admin'] },

    // Project-level — uses project roles (lead, member).
    // Workspace roles map to project roles via inherits.
    'project:read': { roles: ['lead', 'member'] },
    'project:update': { roles: ['lead'] },

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
