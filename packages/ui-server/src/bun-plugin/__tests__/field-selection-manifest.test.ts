import { describe, expect, it } from 'bun:test';
import { FieldSelectionManifest } from '../field-selection-manifest';

describe('FieldSelectionManifest', () => {
  describe('Given a child component that accesses fields on a prop', () => {
    it('Then resolves those fields when the parent queries for them', () => {
      const manifest = new FieldSelectionManifest();

      // Register child component's prop field access
      manifest.registerFile(
        '/src/user-card.tsx',
        `
        export function UserCard({ user }: Props) {
          return <div>{user.name}<span>{user.email}</span></div>;
        }
      `,
      );

      const fields = manifest.getComponentPropFields('/src/user-card.tsx', 'UserCard', 'user');

      expect(fields).toBeDefined();
      expect(fields!.fields).toContain('name');
      expect(fields!.fields).toContain('email');
      expect(fields!.hasOpaqueAccess).toBe(false);
    });
  });

  describe('Given a component with opaque access on a prop', () => {
    it('Then marks hasOpaqueAccess in the resolved fields', () => {
      const manifest = new FieldSelectionManifest();

      manifest.registerFile(
        '/src/user-card.tsx',
        `
        export function UserCard({ user }: Props) {
          const copy = { ...user };
          return <div>{copy.name}</div>;
        }
      `,
      );

      const fields = manifest.getComponentPropFields('/src/user-card.tsx', 'UserCard', 'user');

      expect(fields).toBeDefined();
      expect(fields!.hasOpaqueAccess).toBe(true);
    });
  });

  describe('Given a transitive chain A → B → C', () => {
    it('Then resolves C fields through B forwarding back to A', () => {
      const manifest = new FieldSelectionManifest();
      const resolveImport = (spec: string, _from: string): string | undefined => {
        if (spec === './avatar') return '/src/avatar.tsx';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      // C: Avatar accesses profile.avatarUrl
      manifest.registerFile(
        '/src/avatar.tsx',
        `
        export function Avatar({ profile }: Props) {
          return <img src={profile.avatarUrl} />;
        }
      `,
      );

      // B: UserCard accesses user.name and forwards user to Avatar
      manifest.registerFile(
        '/src/user-card.tsx',
        `
        import { Avatar } from './avatar';
        export function UserCard({ user }: Props) {
          return <div>{user.name}<Avatar profile={user} /></div>;
        }
      `,
      );

      const fields = manifest.getResolvedPropFields('/src/user-card.tsx', 'UserCard', 'user');

      expect(fields).toBeDefined();
      expect(fields!.fields).toContain('name');
      expect(fields!.fields).toContain('avatarUrl');
    });
  });

  describe('Given an unresolvable component import', () => {
    it('Then marks the prop as opaque', () => {
      const manifest = new FieldSelectionManifest();
      const resolveImport = (_spec: string, _from: string): string | undefined => undefined;
      manifest.setImportResolver(resolveImport);

      manifest.registerFile(
        '/src/user-card.tsx',
        `
        import { ExternalBadge } from 'external-lib';
        export function UserCard({ user }: Props) {
          return <div>{user.name}<ExternalBadge data={user} /></div>;
        }
      `,
      );

      const fields = manifest.getResolvedPropFields('/src/user-card.tsx', 'UserCard', 'user');

      expect(fields).toBeDefined();
      expect(fields!.hasOpaqueAccess).toBe(true);
    });
  });

  describe('Given an incremental file update', () => {
    it('Then reflects the new field access', () => {
      const manifest = new FieldSelectionManifest();

      // Initial: UserCard accesses user.name
      manifest.registerFile(
        '/src/user-card.tsx',
        `
        export function UserCard({ user }: Props) {
          return <div>{user.name}</div>;
        }
      `,
      );

      let fields = manifest.getComponentPropFields('/src/user-card.tsx', 'UserCard', 'user');
      expect(fields!.fields).toEqual(['name']);

      // Update: UserCard now also accesses user.email
      const result = manifest.updateFile(
        '/src/user-card.tsx',
        `
        export function UserCard({ user }: Props) {
          return <div>{user.name}<span>{user.email}</span></div>;
        }
      `,
      );

      expect(result.changed).toBe(true);
      fields = manifest.getComponentPropFields('/src/user-card.tsx', 'UserCard', 'user');
      expect(fields!.fields).toContain('name');
      expect(fields!.fields).toContain('email');
    });
  });

  describe('Given an update that does not change field access', () => {
    it('Then reports changed as false', () => {
      const manifest = new FieldSelectionManifest();

      manifest.registerFile(
        '/src/user-card.tsx',
        `
        export function UserCard({ user }: Props) {
          return <div>{user.name}</div>;
        }
      `,
      );

      // Same fields, just different whitespace
      const result = manifest.updateFile(
        '/src/user-card.tsx',
        `
        export function UserCard({ user }: Props) {
          return <div> {user.name} </div>;
        }
      `,
      );

      expect(result.changed).toBe(false);
    });
  });

  describe('Given a component re-exported from a barrel file', () => {
    it('Then resolves fields by following the re-export to the defining file', () => {
      const manifest = new FieldSelectionManifest();
      const resolveImport = (spec: string, from: string): string | undefined => {
        if (spec === './issue-row' && from === '/src/components/index.ts') {
          return '/src/components/issue-row.tsx';
        }
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      // Barrel file re-exports
      manifest.registerFile(
        '/src/components/index.ts',
        `
        export { IssueRow } from './issue-row';
        export { IssueCard } from './issue-card';
      `,
      );

      // Actual defining file
      manifest.registerFile(
        '/src/components/issue-row.tsx',
        `
        export function IssueRow({ issue }: Props) {
          return <div>{issue.title}<span>#{issue.number}</span></div>;
        }
      `,
      );

      // Look up through the barrel path — should follow re-export
      const fields = manifest.getResolvedPropFields(
        '/src/components/index.ts',
        'IssueRow',
        'issue',
      );

      expect(fields).toBeDefined();
      expect(fields!.fields).toContain('title');
      expect(fields!.fields).toContain('number');
      expect(fields!.hasOpaqueAccess).toBe(false);
    });
  });

  describe('Given a star re-export from a barrel file', () => {
    it('Then resolves fields by following the star re-export', () => {
      const manifest = new FieldSelectionManifest();
      const resolveImport = (spec: string, from: string): string | undefined => {
        if (spec === './issue-row' && from === '/src/components/index.ts') {
          return '/src/components/issue-row.tsx';
        }
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      // Barrel with star re-export
      manifest.registerFile(
        '/src/components/index.ts',
        `
        export * from './issue-row';
      `,
      );

      // Actual defining file
      manifest.registerFile(
        '/src/components/issue-row.tsx',
        `
        export function IssueRow({ issue }: Props) {
          return <div>{issue.title}</div>;
        }
      `,
      );

      const fields = manifest.getResolvedPropFields(
        '/src/components/index.ts',
        'IssueRow',
        'issue',
      );

      expect(fields).toBeDefined();
      expect(fields!.fields).toContain('title');
    });
  });

  describe('Given a chained re-export (barrel → barrel → component)', () => {
    it('Then follows the chain to resolve fields', () => {
      const manifest = new FieldSelectionManifest();
      const resolveImport = (spec: string, from: string): string | undefined => {
        if (spec === './components' && from === '/src/index.ts') return '/src/components/index.ts';
        if (spec === './issue-row' && from === '/src/components/index.ts') {
          return '/src/components/issue-row.tsx';
        }
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      // Top-level barrel
      manifest.registerFile('/src/index.ts', `export { IssueRow } from './components';`);

      // Sub-barrel
      manifest.registerFile('/src/components/index.ts', `export { IssueRow } from './issue-row';`);

      // Actual component
      manifest.registerFile(
        '/src/components/issue-row.tsx',
        `
        export function IssueRow({ issue }: Props) {
          return <div>{issue.title}</div>;
        }
      `,
      );

      const fields = manifest.getResolvedPropFields('/src/index.ts', 'IssueRow', 'issue');

      expect(fields).toBeDefined();
      expect(fields!.fields).toContain('title');
    });
  });

  describe('Given circular re-exports', () => {
    it('Then does not infinite loop and returns undefined', () => {
      const manifest = new FieldSelectionManifest();
      const resolveImport = (spec: string, from: string): string | undefined => {
        if (spec === './b' && from === '/src/a.ts') return '/src/b.ts';
        if (spec === './a' && from === '/src/b.ts') return '/src/a.ts';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      manifest.registerFile('/src/a.ts', `export { Foo } from './b';`);
      manifest.registerFile('/src/b.ts', `export { Foo } from './a';`);

      // Should not hang — circular reference returns undefined gracefully
      const fields = manifest.getResolvedPropFields('/src/a.ts', 'Foo', 'data');
      expect(fields).toBeUndefined();
    });
  });

  describe('Given a renamed re-export (export { A as B })', () => {
    it('Then resolves using the original name in the target file', () => {
      const manifest = new FieldSelectionManifest();
      const resolveImport = (spec: string, from: string): string | undefined => {
        if (spec === './internal' && from === '/src/index.ts') return '/src/internal.tsx';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      // Barrel renames the export
      manifest.registerFile(
        '/src/index.ts',
        `export { IssueRowInternal as IssueRow } from './internal';`,
      );

      // Component uses internal name
      manifest.registerFile(
        '/src/internal.tsx',
        `
        export function IssueRowInternal({ issue }: Props) {
          return <div>{issue.title}<span>{issue.priority}</span></div>;
        }
      `,
      );

      const fields = manifest.getResolvedPropFields('/src/index.ts', 'IssueRow', 'issue');

      expect(fields).toBeDefined();
      expect(fields!.fields).toContain('title');
      expect(fields!.fields).toContain('priority');
    });
  });

  describe('Given updateFile changes re-exports', () => {
    it('Then reports changed and clears cache', () => {
      const manifest = new FieldSelectionManifest();
      const resolveImport = (spec: string, from: string): string | undefined => {
        if (spec === './issue-row' && from === '/src/index.ts') return '/src/issue-row.tsx';
        if (spec === './issue-card' && from === '/src/index.ts') return '/src/issue-card.tsx';
        return undefined;
      };
      manifest.setImportResolver(resolveImport);

      manifest.registerFile(
        '/src/issue-row.tsx',
        `export function IssueRow({ issue }: Props) { return <div>{issue.title}</div>; }`,
      );
      manifest.registerFile(
        '/src/issue-card.tsx',
        `export function IssueCard({ issue }: Props) { return <div>{issue.number}</div>; }`,
      );

      // Initial: only exports IssueRow
      manifest.registerFile('/src/index.ts', `export { IssueRow } from './issue-row';`);

      const before = manifest.getResolvedPropFields('/src/index.ts', 'IssueCard', 'issue');
      expect(before).toBeUndefined();

      // Update: now also exports IssueCard
      const result = manifest.updateFile(
        '/src/index.ts',
        `export { IssueRow } from './issue-row';\nexport { IssueCard } from './issue-card';`,
      );

      expect(result.changed).toBe(true);

      const after = manifest.getResolvedPropFields('/src/index.ts', 'IssueCard', 'issue');
      expect(after).toBeDefined();
      expect(after!.fields).toContain('number');
    });
  });

  describe('Given a file is deleted', () => {
    it('Then removes it from the manifest', () => {
      const manifest = new FieldSelectionManifest();

      manifest.registerFile(
        '/src/user-card.tsx',
        `
        export function UserCard({ user }: Props) {
          return <div>{user.name}</div>;
        }
      `,
      );

      manifest.deleteFile('/src/user-card.tsx');

      const fields = manifest.getComponentPropFields('/src/user-card.tsx', 'UserCard', 'user');
      expect(fields).toBeUndefined();
    });
  });
});
