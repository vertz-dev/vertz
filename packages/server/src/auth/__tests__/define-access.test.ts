import { describe, expect, it } from 'bun:test';
import { defineAccess } from '../define-access';

const validInput = {
  hierarchy: ['Organization', 'Team', 'Project', 'Task'],
  roles: {
    Organization: ['owner', 'admin', 'member'],
    Team: ['lead', 'editor', 'viewer'],
    Project: ['manager', 'contributor', 'viewer'],
    Task: ['assignee', 'viewer'],
  },
  inheritance: {
    Organization: { owner: 'lead', admin: 'editor', member: 'viewer' },
    Team: { lead: 'manager', editor: 'contributor', viewer: 'viewer' },
    Project: { manager: 'assignee', contributor: 'assignee', viewer: 'viewer' },
  },
  entitlements: {
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'] },
    'project:delete': { roles: ['manager'] },
  },
} as const;

describe('defineAccess', () => {
  it('returns a frozen config object', () => {
    const config = defineAccess({ ...validInput });

    expect(config).toBeDefined();
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.hierarchy).toEqual(['Organization', 'Team', 'Project', 'Task']);
  });

  it('freezes roles arrays', () => {
    const config = defineAccess({ ...validInput });
    expect(Object.isFrozen(config.roles)).toBe(true);
    expect(Object.isFrozen(config.roles.Organization)).toBe(true);
  });

  it('freezes inheritance config', () => {
    const config = defineAccess({ ...validInput });
    expect(Object.isFrozen(config.inheritance)).toBe(true);
    expect(Object.isFrozen(config.inheritance.Organization)).toBe(true);
  });

  it('freezes entitlements config', () => {
    const config = defineAccess({ ...validInput });
    expect(Object.isFrozen(config.entitlements)).toBe(true);
    expect(Object.isFrozen(config.entitlements['project:view'])).toBe(true);
  });

  it('defaults inheritance to empty object when omitted', () => {
    const config = defineAccess({
      hierarchy: ['Org'],
      roles: { Org: ['admin'] },
      entitlements: { 'org:manage': { roles: ['admin'] } },
    });
    expect(config.inheritance).toEqual({});
  });

  it('throws when hierarchy exceeds 4 levels', () => {
    expect(() => {
      defineAccess({
        hierarchy: ['A', 'B', 'C', 'D', 'E'],
        roles: { A: ['r'], B: ['r'], C: ['r'], D: ['r'], E: ['r'] },
        entitlements: {},
      });
    }).toThrow('Hierarchy depth must not exceed 4 levels');
  });

  it('throws when hierarchy is empty', () => {
    expect(() => {
      defineAccess({
        hierarchy: [],
        roles: {},
        entitlements: {},
      });
    }).toThrow('Hierarchy must have at least one resource type');
  });

  it('throws when roles reference a resource type not in hierarchy', () => {
    expect(() => {
      defineAccess({
        hierarchy: ['Org'],
        roles: { Org: ['admin'], Unknown: ['viewer'] },
        entitlements: {},
      });
    }).toThrow('Roles reference unknown resource type: Unknown');
  });

  it('throws when inheritance references a resource type not in hierarchy', () => {
    expect(() => {
      defineAccess({
        hierarchy: ['Org', 'Team'],
        roles: { Org: ['admin'], Team: ['viewer'] },
        inheritance: { Unknown: { admin: 'viewer' } },
        entitlements: {},
      });
    }).toThrow('Inheritance references unknown resource type: Unknown');
  });

  it('throws when inheritance maps from a role not defined on the resource type', () => {
    expect(() => {
      defineAccess({
        hierarchy: ['Org', 'Team'],
        roles: { Org: ['admin'], Team: ['viewer'] },
        inheritance: { Org: { ghost: 'viewer' } },
        entitlements: {},
      });
    }).toThrow('Inheritance for Org references undefined role: ghost');
  });

  it('throws when inheritance maps to a role not defined on the child resource type', () => {
    expect(() => {
      defineAccess({
        hierarchy: ['Org', 'Team'],
        roles: { Org: ['admin'], Team: ['viewer'] },
        inheritance: { Org: { admin: 'ghost' } },
        entitlements: {},
      });
    }).toThrow('Inheritance for Org maps to undefined child role: ghost');
  });

  it('preserves entitlements with plans and flags', () => {
    const config = defineAccess({
      hierarchy: ['Org'],
      roles: { Org: ['admin'] },
      entitlements: {
        'org:export': { roles: ['admin'], plans: ['enterprise'], flags: ['export-v2'] },
      },
    });
    expect(config.entitlements['org:export'].plans).toEqual(['enterprise']);
    expect(config.entitlements['org:export'].flags).toEqual(['export-v2']);
  });
});
