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
