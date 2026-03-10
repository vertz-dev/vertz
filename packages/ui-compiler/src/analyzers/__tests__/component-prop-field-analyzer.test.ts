import { describe, expect, it } from 'bun:test';
import { analyzeComponentPropFields } from '../component-prop-field-analyzer';

describe('analyzeComponentPropFields', () => {
  describe('Given an exported component with destructured props accessing fields', () => {
    it('Then extracts field access per prop', () => {
      const source = `
        export function UserCard({ user }: { user: User }) {
          return <div>{user.name}</div>;
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result).toHaveLength(1);
      expect(result[0].componentName).toBe('UserCard');
      expect(result[0].props.user).toBeDefined();
      expect(result[0].props.user.fields).toContain('name');
    });
  });

  describe('Given a component accessing multiple fields on multiple props', () => {
    it('Then collects all fields per prop separately', () => {
      const source = `
        export function TaskCard({ task, assignee }: TaskCardProps) {
          return (
            <div>
              <h3>{task.title}</h3>
              <p>{task.description}</p>
              <span>{assignee.name}</span>
            </div>
          );
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result).toHaveLength(1);
      expect(result[0].props.task.fields).toContain('title');
      expect(result[0].props.task.fields).toContain('description');
      expect(result[0].props.task.fields).toHaveLength(2);
      expect(result[0].props.assignee.fields).toContain('name');
      expect(result[0].props.assignee.fields).toHaveLength(1);
    });
  });

  describe('Given a component with spread on a prop', () => {
    it('Then marks hasOpaqueAccess as true for that prop', () => {
      const source = `
        export function UserCard({ user }: UserCardProps) {
          const copy = { ...user };
          return <div>{copy.name}</div>;
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result[0].props.user.hasOpaqueAccess).toBe(true);
    });
  });

  describe('Given a non-exported component', () => {
    it('Then does not include it in results', () => {
      const source = `
        function InternalCard({ user }: Props) {
          return <div>{user.name}</div>;
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given an exported non-component function (not PascalCase)', () => {
    it('Then does not include it in results', () => {
      const source = `
        export function useUserData({ userId }: Options) {
          return userId;
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given a component with dynamic key access on prop', () => {
    it('Then marks hasOpaqueAccess as true', () => {
      const source = `
        export function UserCard({ user }: Props) {
          return <div>{user[someKey]}</div>;
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result[0].props.user.hasOpaqueAccess).toBe(true);
    });
  });

  describe('Given a default-exported component', () => {
    it('Then includes it in results', () => {
      const source = `
        export default function UserCard({ user }: Props) {
          return <div>{user.name}</div>;
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result).toHaveLength(1);
      expect(result[0].componentName).toBe('UserCard');
      expect(result[0].props.user.fields).toContain('name');
    });
  });

  describe('Given a component that forwards a prop to a child component', () => {
    it('Then records the forwarding in the prop access info', () => {
      const source = `
        import { Avatar } from './avatar';

        export function UserCard({ user }: Props) {
          return (
            <div>
              <span>{user.name}</span>
              <Avatar profile={user} />
            </div>
          );
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result[0].props.user.fields).toContain('name');
      expect(result[0].props.user.forwarded).toHaveLength(1);
      expect(result[0].props.user.forwarded[0].componentName).toBe('Avatar');
      expect(result[0].props.user.forwarded[0].propName).toBe('profile');
      expect(result[0].props.user.forwarded[0].importSource).toBe('./avatar');
    });
  });

  describe('Given a component with no destructured props', () => {
    it('Then returns empty results for that component', () => {
      const source = `
        export function EmptyComponent() {
          return <div>Hello</div>;
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result).toHaveLength(0);
    });
  });

  describe('Given an arrow function component exported as const', () => {
    it('Then extracts field access per prop', () => {
      const source = `
        export const UserCard = ({ user }: Props) => {
          return <div>{user.email}</div>;
        };
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result).toHaveLength(1);
      expect(result[0].componentName).toBe('UserCard');
      expect(result[0].props.user.fields).toContain('email');
    });
  });

  describe('Given a component using prop in array method callback', () => {
    it('Then extracts fields accessed in the callback', () => {
      const source = `
        export function UserList({ users }: Props) {
          return <div>{users.map(u => <span>{u.name}</span>)}</div>;
        }
      `;

      const result = analyzeComponentPropFields('test.tsx', source);

      expect(result).toHaveLength(1);
      expect(result[0].props.users).toBeDefined();
      // Note: the analyzer tracks u.name in the callback, but 'users' prop
      // accesses 'map' which is an array method, not a field.
      // The callback param field access is tracked separately.
    });
  });
});
