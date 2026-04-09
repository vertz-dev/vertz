import { describe, expect, it } from '@vertz/test';
import { Project } from 'ts-morph';
import { FieldAccessAnalyzer } from '../analyzers/field-access-analyzer';
import { resolveConfig } from '../config';

function createProject(files: Record<string, string>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      strict: true,
      jsx: 2 /* React */,
      jsxFactory: 'h',
    },
  });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('FieldAccessAnalyzer', () => {
  it('returns empty for project with no components', async () => {
    const project = createProject({
      'src/utils.ts': 'export const x = 1;',
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result).toEqual([]);
  });

  it('detects query field access', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <div>{tasks.data.title}</div>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('App'));
    expect(comp).toBeDefined();
    expect(comp?.queryAccess[0]?.fields).toContain('title');
  });

  it('detects destructured prop field access', async () => {
    const project = createProject({
      'src/Card.tsx': `
        function Card({ user }: { user: any }) {
          return <div>{user.name}</div>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('Card'));
    expect(comp?.propAccess.length).toBeGreaterThan(0);
    const userProp = comp?.propAccess.find((p) => p.propName === 'user');
    expect(userProp?.fields).toContain('name');
  });

  it('detects opaque element access on destructured prop', async () => {
    const project = createProject({
      'src/List.tsx': `
        function List({ items }: { items: any[] }) {
          const first = items[0];
          return <div>{first}</div>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('List'));
    const itemsProp = comp?.propAccess.find((p) => p.propName === 'items');
    expect(itemsProp?.hasOpaqueAccess).toBe(true);
  });

  it('tracks non-destructured props.X.Y access', async () => {
    const project = createProject({
      'src/Detail.tsx': `
        function Detail(props: { user: any; count: number }) {
          return <div>{props.user.name}{props.user.email}</div>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('Detail'));
    const userProp = comp?.propAccess.find((p) => p.propName === 'user');
    expect(userProp).toBeDefined();
    expect(userProp?.fields).toContain('name');
    expect(userProp?.fields).toContain('email');
  });

  it('tracks element access on non-destructured props', async () => {
    const project = createProject({
      'src/Grid.tsx': `
        function Grid(props: { items: any[] }) {
          const x = props.items[0];
          return <div>{x}</div>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('Grid'));
    const itemsProp = comp?.propAccess.find((p) => p.propName === 'items');
    expect(itemsProp?.hasOpaqueAccess).toBe(true);
  });

  it('tracks array method callbacks on non-destructured props', async () => {
    const project = createProject({
      'src/UserList.tsx': `
        function UserList(props: { users: any[] }) {
          return <ul>{props.users.map((u: any) => <li>{u.name}</li>)}</ul>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('UserList'));
    const usersProp = comp?.propAccess.find((p) => p.propName === 'users');
    expect(usersProp).toBeDefined();
    expect(usersProp?.fields).toContain('name');
  });

  it('tracks fields from chained filter/map callbacks on query data', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const active = tasks.data.filter((t: any) => t.active).map((t: any) => t.name);
          return <div>{active}</div>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('App'));
    expect(comp?.queryAccess[0]?.fields).toContain('active');
    expect(comp?.queryAccess[0]?.fields).toContain('name');
  });

  it('detects opaque element access in map callback', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <div>{tasks.data.map((t: any) => t[0])}</div>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('App'));
    expect(comp?.queryAccess[0]?.hasOpaqueAccess).toBe(true);
  });

  it('skips primitive prop names (onClick, className, etc)', async () => {
    const project = createProject({
      'src/Button.tsx': `
        function Button(props: { onClick: () => void; className: string; data: any }) {
          return <button onClick={props.onClick} className={props.className}>{props.data.label}</button>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('Button'));
    // onClick and className should be skipped as primitive props
    const onClickProp = comp?.propAccess.find((p) => p.propName === 'onClick');
    expect(onClickProp).toBeUndefined();
    const dataProp = comp?.propAccess.find((p) => p.propName === 'data');
    expect(dataProp).toBeDefined();
    expect(dataProp?.fields).toContain('label');
  });

  it('detects nested field access on destructured variables', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const { user } = tasks.data;
          return <div>{user.name}</div>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('App'));
    // Should track nested access: user → user.name
    expect(comp?.queryAccess[0]?.fields).toContain('user.name');
  });

  it('handles dynamic element access on query data', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const key = 'name';
          const val = tasks.data[key];
          return <div>{val}</div>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('App'));
    expect(comp?.queryAccess[0]?.hasOpaqueAccess).toBe(true);
  });

  it('handles arrow function components', async () => {
    const project = createProject({
      'src/Card.tsx': `
        const Card = ({ user }: { user: any }) => {
          return <div>{user.email}</div>;
        };
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('Card'));
    expect(comp).toBeDefined();
    const userProp = comp?.propAccess.find((p) => p.propName === 'user');
    expect(userProp?.fields).toContain('email');
  });

  it('tracks opaque access from props callback with opaque element', async () => {
    const project = createProject({
      'src/App.tsx': `
        function App(props: { items: any[] }) {
          return <ul>{props.items.map((item: any) => <li>{item[0]}</li>)}</ul>;
        }
      `,
    });
    const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.find((c) => c.component.includes('App'));
    const itemsProp = comp?.propAccess.find((p) => p.propName === 'items');
    expect(itemsProp?.hasOpaqueAccess).toBe(true);
  });
});
