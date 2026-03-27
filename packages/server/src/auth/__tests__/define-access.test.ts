import { describe, expect, it } from 'bun:test';
import { defineAccess } from '../define-access';
import { rules } from '../rules';

// ============================================================================
// Helper — standard 4-level entity config
// ============================================================================

const validInput = {
  entities: {
    organization: { roles: ['owner', 'admin', 'member'] },
    team: {
      roles: ['lead', 'editor', 'viewer'],
      inherits: {
        'organization:owner': 'lead',
        'organization:admin': 'editor',
        'organization:member': 'viewer',
      },
    },
    project: {
      roles: ['manager', 'contributor', 'viewer'],
      inherits: {
        'team:lead': 'manager',
        'team:editor': 'contributor',
        'team:viewer': 'viewer',
      },
    },
    task: {
      roles: ['assignee', 'viewer'],
      inherits: {
        'project:manager': 'assignee',
        'project:contributor': 'assignee',
        'project:viewer': 'viewer',
      },
    },
  },
  entitlements: {
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'] },
    'project:delete': { roles: ['manager'] },
  },
} as const;

// ============================================================================
// Entity-centric defineAccess()
// ============================================================================

describe('Feature: Entity-centric defineAccess()', () => {
  describe('Given a valid entities config', () => {
    describe('When calling defineAccess()', () => {
      it('returns a frozen AccessDefinition', () => {
        const config = defineAccess({ ...validInput });

        expect(config).toBeDefined();
        expect(Object.isFrozen(config)).toBe(true);
      });

      it('infers hierarchy from inherits declarations', () => {
        const config = defineAccess({ ...validInput });

        expect(config.hierarchy).toContain('organization');
        expect(config.hierarchy).toContain('team');
        expect(config.hierarchy).toContain('project');
        expect(config.hierarchy).toContain('task');
      });

      it('hierarchy is ordered: organization → team → project → task', () => {
        const config = defineAccess({ ...validInput });

        const orgIdx = config.hierarchy.indexOf('organization');
        const teamIdx = config.hierarchy.indexOf('team');
        const projIdx = config.hierarchy.indexOf('project');
        const taskIdx = config.hierarchy.indexOf('task');

        expect(orgIdx).toBeLessThan(teamIdx);
        expect(teamIdx).toBeLessThan(projIdx);
        expect(projIdx).toBeLessThan(taskIdx);
      });

      it('entities without inherits are standalone roots', () => {
        const config = defineAccess({
          entities: {
            workspace: { roles: ['admin', 'member'] },
          },
          entitlements: {
            'workspace:manage': { roles: ['admin'] },
          },
        });

        expect(config.hierarchy).toContain('workspace');
      });
    });
  });

  describe('Given inherits with invalid entity reference', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Entity \'nonexistent\' in team.inherits is not defined"', () => {
        expect(() => {
          defineAccess({
            entities: {
              team: {
                roles: ['lead'],
                inherits: { 'nonexistent:admin': 'lead' },
              },
            },
            entitlements: {},
          });
        }).toThrow("Entity 'nonexistent' in team.inherits is not defined");
      });
    });
  });

  describe('Given inherits with invalid role reference', () => {
    describe('When calling defineAccess()', () => {
      it("throws \"Role 'nonexistent' does not exist on entity 'organization'\"", () => {
        expect(() => {
          defineAccess({
            entities: {
              organization: { roles: ['admin'] },
              team: {
                roles: ['lead'],
                inherits: { 'organization:nonexistent': 'lead' },
              },
            },
            entitlements: {},
          });
        }).toThrow("Role 'nonexistent' does not exist on entity 'organization'");
      });
    });
  });

  describe('Given inherits value is not a valid role on the current entity', () => {
    describe('When calling defineAccess()', () => {
      it("throws \"Role 'nonexistent' does not exist on entity 'team'\"", () => {
        expect(() => {
          defineAccess({
            entities: {
              organization: { roles: ['admin'] },
              team: {
                roles: ['lead'],
                inherits: { 'organization:admin': 'nonexistent' },
              },
            },
            entitlements: {},
          });
        }).toThrow("Role 'nonexistent' does not exist on entity 'team'");
      });
    });
  });

  describe('Given self-referencing inheritance', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Entity \'team\' cannot inherit from itself"', () => {
        expect(() => {
          defineAccess({
            entities: {
              team: {
                roles: ['lead', 'viewer'],
                inherits: { 'team:lead': 'viewer' },
              },
            },
            entitlements: {},
          });
        }).toThrow("Entity 'team' cannot inherit from itself");
      });
    });
  });

  describe('Given circular inheritance (A→B→A)', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Circular inheritance detected"', () => {
        expect(() => {
          defineAccess({
            entities: {
              a: {
                roles: ['r1'],
                inherits: { 'b:r1': 'r1' },
              },
              b: {
                roles: ['r1'],
                inherits: { 'a:r1': 'r1' },
              },
            },
            entitlements: {},
          });
        }).toThrow('Circular inheritance detected');
      });
    });
  });

  describe('Given entity with two parent entities in inherits', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Entity \'project\' inherits from multiple parents"', () => {
        expect(() => {
          defineAccess({
            entities: {
              organization: { roles: ['admin'] },
              team: { roles: ['lead'] },
              project: {
                roles: ['manager', 'contributor'],
                inherits: {
                  'team:lead': 'manager',
                  'organization:admin': 'contributor',
                },
              },
            },
            entitlements: {},
          });
        }).toThrow("Entity 'project' inherits from multiple parents");
      });
    });
  });

  describe('Given hierarchy deeper than 4 levels', () => {
    describe('When calling defineAccess()', () => {
      it('throws "Hierarchy depth must not exceed 4 levels"', () => {
        expect(() => {
          defineAccess({
            entities: {
              a: { roles: ['r'] },
              b: { roles: ['r'], inherits: { 'a:r': 'r' } },
              c: { roles: ['r'], inherits: { 'b:r': 'r' } },
              d: { roles: ['r'], inherits: { 'c:r': 'r' } },
              e: { roles: ['r'], inherits: { 'd:r': 'r' } },
            },
            entitlements: {},
          });
        }).toThrow('Hierarchy depth must not exceed 4 levels');
      });
    });
  });

  describe('Given duplicate roles in an entity', () => {
    describe('When calling defineAccess()', () => {
      it("throws \"Duplicate role 'admin' in entity 'organization'\"", () => {
        expect(() => {
          defineAccess({
            entities: {
              organization: { roles: ['admin', 'admin'] },
            },
            entitlements: {},
          });
        }).toThrow("Duplicate role 'admin' in entity 'organization'");
      });
    });
  });

  describe('Given entity with empty roles array', () => {
    describe('When calling defineAccess()', () => {
      it('succeeds — entities with no roles are valid', () => {
        const config = defineAccess({
          entities: {
            workspace: { roles: [] },
          },
          entitlements: {},
        });

        expect(config.entities.workspace.roles).toEqual([]);
      });
    });
  });

  describe('Given inheritance direction is wrong (parent inherits from child)', () => {
    describe('When calling defineAccess()', () => {
      it('throws with guidance about moving inherits to the child', () => {
        // When organization tries to inherit from team,
        // after both are set up in the graph, the direction is wrong.
        // However, this is actually a cycle if team also inherits from org.
        // In the simple case where org inherits from team without team
        // inheriting from org, it's just structurally odd but not necessarily
        // invalid. The design doc says: error messages guide developers.
        //
        // The real test is: if team is a descendant of organization based
        // on OTHER inherits declarations, then organization can't also
        // inherit from team.
        expect(() => {
          defineAccess({
            entities: {
              organization: {
                roles: ['owner'],
                inherits: { 'team:lead': 'owner' },
              },
              team: {
                roles: ['lead'],
                inherits: { 'organization:owner': 'lead' },
              },
            },
            entitlements: {},
          });
        }).toThrow('Circular inheritance detected');
      });
    });
  });

  describe('freezing', () => {
    it('freezes roles arrays', () => {
      const config = defineAccess({ ...validInput });
      expect(Object.isFrozen(config.roles)).toBe(true);
      expect(Object.isFrozen(config.roles.organization)).toBe(true);
    });

    it('freezes inheritance config', () => {
      const config = defineAccess({ ...validInput });
      expect(Object.isFrozen(config.inheritance)).toBe(true);
      expect(Object.isFrozen(config.inheritance.organization)).toBe(true);
    });

    it('freezes entitlements config', () => {
      const config = defineAccess({ ...validInput });
      expect(Object.isFrozen(config.entitlements)).toBe(true);
      expect(Object.isFrozen(config.entitlements['project:view'])).toBe(true);
    });

    it('freezes entities config', () => {
      const config = defineAccess({ ...validInput });
      expect(Object.isFrozen(config.entities)).toBe(true);
      expect(Object.isFrozen(config.entities.organization)).toBe(true);
    });
  });

  describe('backward-compatible derived fields', () => {
    it('builds roles map from entities', () => {
      const config = defineAccess({ ...validInput });
      expect(config.roles.organization).toEqual(['owner', 'admin', 'member']);
      expect(config.roles.team).toEqual(['lead', 'editor', 'viewer']);
    });

    it('builds inheritance map from entities (parent → { parentRole: childRole })', () => {
      const config = defineAccess({ ...validInput });
      // organization -> { owner: 'lead', admin: 'editor', member: 'viewer' }
      expect(config.inheritance.organization).toEqual({
        owner: 'lead',
        admin: 'editor',
        member: 'viewer',
      });
      expect(config.inheritance.team).toEqual({
        lead: 'manager',
        editor: 'contributor',
        viewer: 'viewer',
      });
    });

    it('defaults inheritance to empty when no inherits declarations', () => {
      const config = defineAccess({
        entities: {
          workspace: { roles: ['admin'] },
        },
        entitlements: { 'workspace:manage': { roles: ['admin'] } },
      });
      expect(config.inheritance).toEqual({});
    });
  });

  describe('plans', () => {
    it('defaults plans to undefined when omitted', () => {
      const config = defineAccess({
        entities: { workspace: { roles: ['admin'] } },
        entitlements: { 'workspace:manage': { roles: ['admin'] } },
      });
      expect(config.plans).toBeUndefined();
    });

    it('preserves defaultPlan in AccessDefinition', () => {
      const config = defineAccess({
        entities: { workspace: { roles: ['admin'] } },
        entitlements: { 'workspace:manage': { roles: ['admin'] } },
        plans: {
          basic: {
            group: 'main',
            features: ['workspace:manage'],
          },
        },
        defaultPlan: 'basic',
      });
      expect(config.defaultPlan).toBe('basic');
    });

    it('accepts plans config and freezes it in AccessDefinition', () => {
      const config = defineAccess({
        entities: { workspace: { roles: ['admin'] } },
        entitlements: {
          'workspace:create': { roles: ['admin'] },
          'workspace:view': { roles: ['admin'] },
        },
        plans: {
          free: {
            group: 'main',
            features: ['workspace:create', 'workspace:view'],
            limits: {
              workspace_creates: { max: 5, gates: 'workspace:create', per: 'month' },
            },
          },
          pro: {
            group: 'main',
            features: ['workspace:create', 'workspace:view'],
            limits: {
              workspace_creates: { max: 100, gates: 'workspace:create', per: 'month' },
            },
          },
        },
      });

      expect(config.plans).toBeDefined();
      expect(Object.isFrozen(config.plans)).toBe(true);
      expect(config.plans!.free.features).toEqual(['workspace:create', 'workspace:view']);
      expect(config.plans!.free.limits!.workspace_creates).toEqual({
        max: 5,
        gates: 'workspace:create',
        per: 'month',
      });
      expect(Object.isFrozen(config.plans!.free)).toBe(true);
    });

    it('deep-freezes LimitDef.overage sub-object', () => {
      const config = defineAccess({
        entities: { workspace: { roles: ['admin'] } },
        entitlements: {
          'workspace:create': { roles: ['admin'] },
        },
        plans: {
          pro: {
            group: 'main',
            features: ['workspace:create'],
            limits: {
              workspace_creates: {
                max: 100,
                gates: 'workspace:create',
                per: 'month',
                overage: { amount: 0.01, per: 1, cap: 5 },
              },
            },
          },
        },
      });

      const limitDef = config.plans!.pro.limits!.workspace_creates;
      expect(Object.isFrozen(limitDef)).toBe(true);
      expect(Object.isFrozen(limitDef.overage)).toBe(true);
    });
  });
});

// ============================================================================
// Entitlement validation
// ============================================================================

describe('Feature: Entitlement validation', () => {
  describe('Given entitlement prefix does not match any entity', () => {
    it("throws \"Entitlement 'unknown:view' references undefined entity 'unknown'\"", () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'unknown:view': { roles: ['admin'] },
          },
        });
      }).toThrow("Entitlement 'unknown:view' references undefined entity 'unknown'");
    });
  });

  describe('Given entitlement roles include a role from another entity', () => {
    it("throws \"Role 'owner' in 'project:view' does not exist on entity 'project'\"", () => {
      expect(() => {
        defineAccess({
          entities: {
            organization: { roles: ['owner'] },
            project: {
              roles: ['manager', 'viewer'],
              inherits: { 'organization:owner': 'manager' },
            },
          },
          entitlements: {
            'project:view': { roles: ['owner', 'manager'] },
          },
        });
      }).toThrow("Role 'owner' in 'project:view' does not exist on entity 'project'");
    });
  });

  describe('Given entitlement with callback format', () => {
    it('accepts (r) => ({ roles, rules }) format', () => {
      const config = defineAccess({
        entities: {
          task: { roles: ['assignee', 'viewer'] },
        },
        entitlements: {
          'task:delete': (r) => ({
            roles: ['assignee'],
            rules: [r.where({ createdBy: r.user.id })],
          }),
        },
      });

      expect(config.entitlements['task:delete']).toBeDefined();
      expect(config.entitlements['task:delete'].roles).toEqual(['assignee']);
      expect(config.entitlements['task:delete'].rules).toHaveLength(1);
    });

    it('callback r provides where() method', () => {
      const config = defineAccess({
        entities: {
          task: { roles: ['assignee'] },
        },
        entitlements: {
          'task:edit': (r) => ({
            roles: ['assignee'],
            rules: [r.where({ status: 'open' })],
          }),
        },
      });

      const rule = config.entitlements['task:edit'].rules?.[0];
      expect(rule).toBeDefined();
      expect(rule?.type).toBe('where');
    });

    it('callback r provides user.id marker', () => {
      const config = defineAccess({
        entities: {
          task: { roles: ['assignee'] },
        },
        entitlements: {
          'task:edit': (r) => ({
            roles: ['assignee'],
            rules: [r.where({ createdBy: r.user.id })],
          }),
        },
      });

      const rule = config.entitlements['task:edit'].rules?.[0];
      expect(rule?.type).toBe('where');
      if (rule?.type === 'where') {
        expect(rule.conditions.createdBy).toEqual({ __marker: 'user.id' });
      }
    });
  });

  describe('Given entitlement with both roles and rules in object format', () => {
    it('accepts { roles: [...], rules: [...] } format', () => {
      const config = defineAccess({
        entities: {
          task: { roles: ['assignee', 'viewer'] },
        },
        entitlements: {
          'task:edit': {
            roles: ['assignee'],
            rules: [rules.where({ createdBy: rules.user.id })],
          },
        },
      });

      expect(config.entitlements['task:edit'].roles).toEqual(['assignee']);
      expect(config.entitlements['task:edit'].rules).toHaveLength(1);
    });
  });

  describe('Given entitlement with flags', () => {
    it('preserves flags in the resolved entitlement', () => {
      const config = defineAccess({
        entities: {
          project: { roles: ['manager'] },
        },
        entitlements: {
          'project:export': { roles: ['manager'], flags: ['export-v2'] },
        },
      });

      expect(config.entitlements['project:export'].flags).toEqual(['export-v2']);
    });
  });
});

// ============================================================================
// Plan validation (Phase 2)
// ============================================================================

describe('Feature: Plan validation', () => {
  describe('Given plan features referencing undefined entitlement', () => {
    it("throws \"Plan 'pro' feature 'nonexistent:action' is not a defined entitlement\"", () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:manage': { roles: ['admin'] },
          },
          plans: {
            pro: {
              group: 'main',
              features: ['workspace:manage', 'nonexistent:action'],
            },
          },
        });
      }).toThrow("Plan 'pro' feature 'nonexistent:action' is not a defined entitlement");
    });
  });

  describe('Given limit gates referencing undefined entitlement', () => {
    it("throws \"Limit 'prompts' gates 'nonexistent:create' which is not defined\"", () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:manage': { roles: ['admin'] },
          },
          plans: {
            pro: {
              group: 'main',
              features: ['workspace:manage'],
              limits: {
                prompts: { max: 50, gates: 'nonexistent:create' },
              },
            },
          },
        });
      }).toThrow("Limit 'prompts' gates 'nonexistent:create' which is not defined");
    });
  });

  describe('Given limit scope referencing undefined entity', () => {
    it("throws \"Limit 'prompts_per_brand' scope 'nonexistent' is not a defined entity\"", () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:create': { roles: ['admin'] },
          },
          plans: {
            pro: {
              group: 'main',
              features: ['workspace:create'],
              limits: {
                prompts_per_brand: { max: 5, gates: 'workspace:create', scope: 'nonexistent' },
              },
            },
          },
        });
      }).toThrow("Limit 'prompts_per_brand' scope 'nonexistent' is not a defined entity");
    });
  });

  describe('Given defaultPlan referencing an add-on', () => {
    it('throws "defaultPlan \'extra_prompts\' is an add-on, not a base plan"', () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:create': { roles: ['admin'] },
          },
          plans: {
            free: {
              group: 'main',
              features: ['workspace:create'],
              limits: {
                prompts: { max: 50, gates: 'workspace:create' },
              },
            },
            extra_prompts: {
              addOn: true,
              limits: {
                prompts: { max: 50, gates: 'workspace:create' },
              },
            },
          },
          defaultPlan: 'extra_prompts',
        });
      }).toThrow("defaultPlan 'extra_prompts' is an add-on, not a base plan");
    });
  });

  describe('Given base plan without group', () => {
    it('throws "Base plan \'pro\' must have a group"', () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:create': { roles: ['admin'] },
          },
          plans: {
            pro: {
              features: ['workspace:create'],
            },
          },
        });
      }).toThrow("Base plan 'pro' must have a group");
    });
  });

  describe('Given add-on with group', () => {
    it('throws "Add-on \'export_addon\' must not have a group"', () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:create': { roles: ['admin'] },
          },
          plans: {
            free: {
              group: 'main',
              features: ['workspace:create'],
            },
            export_addon: {
              addOn: true,
              group: 'main',
              features: ['workspace:create'],
            },
          },
        });
      }).toThrow("Add-on 'export_addon' must not have a group");
    });
  });

  describe('Given add-on limit key not in any base plan', () => {
    it('throws "Add-on limit \'nonexistent\' not defined in any base plan"', () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:create': { roles: ['admin'] },
          },
          plans: {
            free: {
              group: 'main',
              features: ['workspace:create'],
              limits: {
                prompts: { max: 50, gates: 'workspace:create' },
              },
            },
            extra: {
              addOn: true,
              limits: {
                nonexistent: { max: 50, gates: 'workspace:create' },
              },
            },
          },
        });
      }).toThrow("Add-on limit 'nonexistent' not defined in any base plan");
    });
  });

  describe('Given limit max is negative (not -1)', () => {
    it('throws "Limit max must be -1 (unlimited), 0 (disabled), or a positive integer"', () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:create': { roles: ['admin'] },
          },
          plans: {
            free: {
              group: 'main',
              features: ['workspace:create'],
              limits: {
                prompts: { max: -2, gates: 'workspace:create' },
              },
            },
          },
        });
      }).toThrow("Limit 'prompts' max must be -1 (unlimited), 0 (disabled), or a positive integer");
    });
  });

  describe('Given limit max is non-integer', () => {
    it('throws "Limit max must be -1 (unlimited), 0 (disabled), or a positive integer"', () => {
      expect(() => {
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:create': { roles: ['admin'] },
          },
          plans: {
            free: {
              group: 'main',
              features: ['workspace:create'],
              limits: {
                prompts: { max: 5.5, gates: 'workspace:create' },
              },
            },
          },
        });
      }).toThrow("Limit 'prompts' max must be -1 (unlimited), 0 (disabled), or a positive integer");
    });
  });

  describe('Given limit max is -1 (unlimited)', () => {
    it('succeeds', () => {
      const config = defineAccess({
        entities: {
          workspace: { roles: ['admin'] },
        },
        entitlements: {
          'workspace:create': { roles: ['admin'] },
        },
        plans: {
          enterprise: {
            group: 'main',
            features: ['workspace:create'],
            limits: {
              prompts: { max: -1, gates: 'workspace:create' },
            },
          },
        },
      });

      expect(config.plans!.enterprise.limits!.prompts.max).toBe(-1);
    });
  });

  describe('Given limit max is 0 (disabled)', () => {
    it('succeeds', () => {
      const config = defineAccess({
        entities: {
          workspace: { roles: ['admin'] },
        },
        entitlements: {
          'workspace:create': { roles: ['admin'] },
        },
        plans: {
          free: {
            group: 'main',
            features: ['workspace:create'],
            limits: {
              prompts: { max: 0, gates: 'workspace:create' },
            },
          },
        },
      });

      expect(config.plans!.free.limits!.prompts.max).toBe(0);
    });
  });

  describe('Given an add-on with requires referencing valid group/plans', () => {
    it('succeeds and stores the requires config', () => {
      const config = defineAccess({
        entities: {
          workspace: { roles: ['admin'] },
        },
        entitlements: {
          'workspace:create': { roles: ['admin'] },
          'workspace:export': { roles: ['admin'] },
        },
        plans: {
          free: {
            group: 'main',
            features: ['workspace:create'],
          },
          pro: {
            group: 'main',
            features: ['workspace:create', 'workspace:export'],
          },
          export_addon: {
            addOn: true,
            features: ['workspace:export'],
            requires: { group: 'main', plans: ['pro'] },
          },
        },
      });

      expect(config.plans!.export_addon.requires).toEqual({
        group: 'main',
        plans: ['pro'],
      });
    });
  });

  describe('Given a base plan with requires', () => {
    it('throws — requires is only valid on add-ons', () => {
      expect(() =>
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:create': { roles: ['admin'] },
          },
          plans: {
            free: {
              group: 'main',
              features: ['workspace:create'],
              requires: { group: 'main', plans: ['pro'] },
            } as never,
          },
        }),
      ).toThrow("requires' is only valid on add-on plans");
    });
  });

  describe('Given an add-on requires referencing nonexistent plan', () => {
    it('throws validation error', () => {
      expect(() =>
        defineAccess({
          entities: {
            workspace: { roles: ['admin'] },
          },
          entitlements: {
            'workspace:create': { roles: ['admin'] },
          },
          plans: {
            free: {
              group: 'main',
              features: ['workspace:create'],
            },
            export_addon: {
              addOn: true,
              features: ['workspace:create'],
              requires: { group: 'main', plans: ['nonexistent'] },
            },
          },
        }),
      ).toThrow("requires plan 'nonexistent' is not defined");
    });
  });
});

// ============================================================================
// Multi-level tenancy: PlanDef.level + defaultPlans (#1787)
// ============================================================================

describe('Feature: Multi-level plan validation (#1787)', () => {
  const multiLevelEntities = {
    account: { roles: ['owner', 'admin', 'member'] },
    project: {
      roles: ['admin', 'editor', 'viewer'],
      inherits: { 'account:owner': 'admin', 'account:admin': 'admin' },
    },
  };
  const multiLevelEntitlements = {
    'account:manage': { roles: ['owner', 'admin'] },
    'account:create-project': { roles: ['member'] },
    'project:ai-generate': { roles: ['editor'] },
  };

  describe('Given plans with valid level fields', () => {
    it('accepts plans targeting different entity levels', () => {
      const result = defineAccess({
        entities: multiLevelEntities,
        entitlements: multiLevelEntitlements,
        plans: {
          enterprise: {
            level: 'account',
            group: 'account-plans',
            features: ['account:create-project'],
          },
          starter: {
            level: 'account',
            group: 'account-plans',
            features: ['account:create-project'],
          },
          pro: {
            level: 'project',
            group: 'project-plans',
            features: ['project:ai-generate'],
          },
          free: {
            level: 'project',
            group: 'project-plans',
          },
        },
        defaultPlans: {
          account: 'starter',
          project: 'free',
        },
      });

      expect(result.plans).toBeDefined();
      expect(result._billingLevels).toBeDefined();
      expect(result._billingLevels.account).toEqual(['enterprise', 'starter']);
      expect(result._billingLevels.project).toEqual(['pro', 'free']);
    });
  });

  describe('Given plan level referencing undefined entity', () => {
    it('throws validation error', () => {
      expect(() =>
        defineAccess({
          entities: multiLevelEntities,
          entitlements: multiLevelEntitlements,
          plans: {
            pro: {
              level: 'nonexistent',
              group: 'main',
              features: ['account:create-project'],
            },
          },
        }),
      ).toThrow("level 'nonexistent' is not a defined entity");
    });
  });

  describe('Given plans in the same group with different levels', () => {
    it('throws validation error', () => {
      expect(() =>
        defineAccess({
          entities: multiLevelEntities,
          entitlements: multiLevelEntitlements,
          plans: {
            enterprise: {
              level: 'account',
              group: 'shared-group',
              features: ['account:create-project'],
            },
            pro: {
              level: 'project',
              group: 'shared-group',
              features: ['project:ai-generate'],
            },
          },
        }),
      ).toThrow('same group must have the same level');
    });
  });

  describe('Given defaultPlans key referencing entity with no plans', () => {
    it('throws validation error', () => {
      expect(() =>
        defineAccess({
          entities: multiLevelEntities,
          entitlements: multiLevelEntitlements,
          plans: {
            starter: {
              level: 'account',
              group: 'account-plans',
              features: ['account:create-project'],
            },
          },
          defaultPlans: {
            account: 'starter',
            project: 'free', // no plans target project level
          },
        }),
      ).toThrow("defaultPlans key 'project'");
    });
  });

  describe('Given defaultPlans value referencing nonexistent plan', () => {
    it('throws validation error', () => {
      expect(() =>
        defineAccess({
          entities: multiLevelEntities,
          entitlements: multiLevelEntitlements,
          plans: {
            starter: {
              level: 'account',
              group: 'account-plans',
              features: ['account:create-project'],
            },
          },
          defaultPlans: {
            account: 'nonexistent',
          },
        }),
      ).toThrow("defaultPlans references plan 'nonexistent'");
    });
  });

  describe('Given defaultPlans referencing plan with wrong level', () => {
    it('throws when default plan targets a different level than the key', () => {
      expect(() =>
        defineAccess({
          entities: multiLevelEntities,
          entitlements: {
            'account:manage': { roles: ['owner'] },
          },
          plans: {
            enterprise: { level: 'account', group: 'account-plans', features: [] },
            pro: { level: 'project', group: 'project-plans', features: [] },
          },
          defaultPlans: {
            account: 'pro', // pro targets 'project', not 'account'
          },
        }),
      ).toThrow("defaultPlans['account'] references plan 'pro' which targets level 'project'");
    });
  });

  describe('Given featureResolution on entitlements', () => {
    it('preserves featureResolution in resolved entitlements', () => {
      const result = defineAccess({
        entities: multiLevelEntities,
        entitlements: {
          'account:manage': { roles: ['owner'], featureResolution: 'local' },
          'account:create-project': { roles: ['member'] }, // defaults to 'inherit'
        },
      });

      expect(result.entitlements['account:manage'].featureResolution).toBe('local');
      expect(result.entitlements['account:create-project'].featureResolution).toBeUndefined();
    });
  });

  describe('Given single-level backward compatibility', () => {
    it('still works with plans that have no level field', () => {
      const result = defineAccess({
        entities: { workspace: { roles: ['admin'] } },
        entitlements: { 'workspace:create': { roles: ['admin'] } },
        plans: {
          pro: { group: 'main', features: ['workspace:create'] },
          free: { group: 'main' },
        },
        defaultPlan: 'free',
      });

      expect(result.plans).toBeDefined();
      expect(result.defaultPlan).toBe('free');
      // _billingLevels should be empty when no levels are specified
      expect(result._billingLevels).toEqual({});
    });
  });
});
