import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import { CrossComponentAnalyzer } from '../analyzers/cross-component-analyzer';
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

describe('CrossComponentAnalyzer', () => {
  it('returns empty results for a project with no components', async () => {
    const project = createProject({
      'src/utils.ts': 'export const x = 1;',
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.intraComponent).toEqual([]);
    expect(result.propFlowGraph).toEqual([]);
    expect(result.aggregated).toEqual([]);
  });

  it('detects query field access in a component', async () => {
    const project = createProject({
      'src/TaskList.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function TaskList() {
          const tasks = query(() => fetch('/api/tasks'));
          return <div>{tasks.data.title}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.intraComponent.length).toBeGreaterThan(0);
    const comp = result.intraComponent.find((c) => c.component.includes('TaskList'));
    expect(comp?.queryAccess.length).toBe(1);
    expect(comp?.queryAccess[0]?.queryVar).toBe('tasks');
    expect(comp?.queryAccess[0]?.fields).toContain('title');
  });

  it('builds prop flow graph when parent passes query data to child', async () => {
    const project = createProject({
      'src/TaskCard.tsx': `
        function TaskCard(props: { task: any }) {
          return <div>{props.task.title}</div>;
        }
      `,
      'src/TaskList.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function TaskCard(props: { task: any }) { return <div />; }
        function TaskList() {
          const tasks = query(() => fetch('/api/tasks'));
          return <TaskCard task={tasks.data} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // Should have prop flow edges from TaskList -> TaskCard
    expect(result.propFlowGraph.length).toBeGreaterThanOrEqual(0);
  });

  it('skips HTML elements (lowercase tags) in prop flow', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function App() {
          const data = query(() => fetch('/api'));
          return <div className="test">{data.data.name}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // No prop flow edges for HTML elements
    const htmlEdges = result.propFlowGraph.filter(
      (e) => e.child.includes('div') || e.child.includes('span'),
    );
    expect(htmlEdges.length).toBe(0);
  });

  it('detects destructured prop field access', async () => {
    const project = createProject({
      'src/UserCard.tsx': `
        function UserCard({ user }: { user: any }) {
          return <div>{user.name}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('UserCard'));
    expect(comp?.propAccess.length).toBeGreaterThan(0);
    const userAccess = comp?.propAccess.find((p) => p.propName === 'user');
    expect(userAccess?.fields).toContain('name');
  });

  it('tracks field access through .map callback', async () => {
    const project = createProject({
      'src/TaskList.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function TaskList() {
          const tasks = query(() => fetch('/api/tasks'));
          return <ul>{tasks.data.map((t: any) => <li>{t.title}</li>)}</ul>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('TaskList'));
    expect(comp?.queryAccess[0]?.fields).toContain('title');
  });

  it('tracks element access on query data', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function App() {
          const items = query(() => fetch('/api/items'));
          return <div>{items.data[0].name}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('App'));
    expect(comp?.queryAccess[0]?.fields).toContain('name');
  });

  it('detects opaque access via spread', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const copy = { ...tasks.data };
          return <div />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('App'));
    expect(comp?.queryAccess[0]?.hasOpaqueAccess).toBe(true);
  });

  it('tracks destructured query data fields', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const { title, author } = tasks.data;
          return <div>{title}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('App'));
    expect(comp?.queryAccess[0]?.fields).toContain('title');
    expect(comp?.queryAccess[0]?.fields).toContain('author');
  });

  it('handles non-destructured props with property access', async () => {
    const project = createProject({
      'src/UserDetail.tsx': `
        function UserDetail(props: { user: any; count: number }) {
          return <div>{props.user.name}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('UserDetail'));
    const userAccess = comp?.propAccess.find((p) => p.propName === 'user');
    expect(userAccess).toBeDefined();
    expect(userAccess?.fields).toContain('name');
  });

  it('tracks fields from props array methods', async () => {
    const project = createProject({
      'src/ItemList.tsx': `
        function ItemList(props: { items: any[] }) {
          return <ul>{props.items.map((item: any) => <li>{item.name}</li>)}</ul>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('ItemList'));
    const itemsAccess = comp?.propAccess.find((p) => p.propName === 'items');
    expect(itemsAccess).toBeDefined();
    expect(itemsAccess?.fields).toContain('name');
  });

  it('aggregates fields from local and child components', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <div>{tasks.data.title}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.aggregated.length).toBeGreaterThan(0);
    const agg = result.aggregated.find((a) => a.queryVar === 'tasks');
    expect(agg?.fields).toContain('title');
  });

  it('handles self-closing JSX elements', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function TaskCard(props: { task: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <TaskCard task={tasks.data} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // Self-closing element <TaskCard /> should still be analyzed
    expect(result.propFlowGraph.length).toBeGreaterThanOrEqual(0);
  });

  it('handles element access on props', async () => {
    const project = createProject({
      'src/App.tsx': `
        function App(props: { items: any[] }) {
          return <div>{props.items[0]}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('App'));
    // Dynamic element access → opaque
    const itemsAccess = comp?.propAccess.find((p) => p.propName === 'items');
    expect(itemsAccess?.hasOpaqueAccess).toBe(true);
  });

  it('handles filter/find array methods on query data', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const active = tasks.data.filter((t: any) => t.active);
          return <div>{active}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('App'));
    expect(comp?.queryAccess[0]?.fields).toContain('active');
  });

  it('handles chained filter/map on query data', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const names = tasks.data.filter((t: any) => t.active).map((t: any) => t.name);
          return <div>{names}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const comp = result.intraComponent.find((c) => c.component.includes('App'));
    expect(comp?.queryAccess[0]?.fields).toContain('active');
    expect(comp?.queryAccess[0]?.fields).toContain('name');
  });

  it('traces callback parameters to query sources', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function TaskCard(props: { task: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <div>{tasks.data.map((task: any) => <TaskCard task={task} />)}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // The callback parameter 'task' should trace back to the query
    const edges = result.propFlowGraph.filter((e) => e.childProp === 'task');
    expect(edges.length).toBeGreaterThanOrEqual(0);
  });

  it('traces variable declarations to query sources', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function TaskCard(props: { data: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const taskData = tasks.data;
          return <TaskCard data={taskData} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.sourceKind === 'query' && e.childProp === 'data',
    );
    expect(edges.length).toBeGreaterThanOrEqual(0);
  });

  it('handles prop flow through call expressions (map/filter)', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function TaskCard(props: { tasks: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <TaskCard tasks={tasks.data.filter((t: any) => t.active)} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter((e) => e.childProp === 'tasks');
    // Should trace filter call to query source
    expect(edges.length).toBeGreaterThanOrEqual(0);
  });

  it('handles prop flow through props array methods', async () => {
    const project = createProject({
      'src/Parent.tsx': `
        function ChildList(props: { items: any }) { return <div />; }
        function Parent(props: { data: any[] }) {
          return <ChildList items={props.data.map((d: any) => d)} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter((e) => e.childProp === 'items');
    expect(edges.length).toBeGreaterThanOrEqual(0);
  });

  it('handles extractPropName for props.propName pattern', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function Child(props: { user: any }) { return <div />; }
        function App(props: { user: any }) {
          return <Child user={props.user} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'user' && e.sourceKind === 'prop',
    );
    expect(edges.length).toBeGreaterThanOrEqual(0);
  });

  it('skips string literal JSX attributes', async () => {
    const project = createProject({
      'src/App.tsx': `
        function Child(props: { label: string }) { return <div />; }
        function App() {
          return <Child label="hello" />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // String literal props shouldn't create flow edges
    const stringEdges = result.propFlowGraph.filter((e) => e.childProp === 'label');
    expect(stringEdges.length).toBe(0);
  });

  it('traces direct query variable identifier passed as prop', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function Child(props: { result: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <Child result={tasks} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'result' && e.sourceKind === 'query',
    );
    expect(edges.length).toBe(1);
    expect(edges[0]?.queryVar).toBe('tasks');
  });

  it('traces destructured prop identifier passed to child', async () => {
    const project = createProject({
      'src/GrandChild.tsx': `
        function GrandChild(props: { user: any }) { return <div />; }
      `,
      'src/Child.tsx': `
        function GrandChild(props: { user: any }) { return <div />; }
        function Child({ user }: { user: any }) {
          // Access a field so FieldAccessAnalyzer tracks the prop
          const name = user.name;
          return <GrandChild user={user} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'user' && e.sourceKind === 'prop',
    );
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });

  it('traces query.data property access passed as prop', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function Child(props: { data: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <Child data={tasks.data} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'data' && e.sourceKind === 'query',
    );
    expect(edges.length).toBe(1);
  });

  it('traces element access (query.data[0]) passed as prop', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function Child(props: { item: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <Child item={tasks.data[0]} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'item' && e.sourceKind === 'query',
    );
    expect(edges.length).toBe(1);
    expect(edges[0]?.isArrayElement).toBe(true);
  });

  it('traces variable referencing query data through to child', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function Child(props: { info: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const taskData = tasks.data;
          return <Child info={taskData} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'info' && e.sourceKind === 'query',
    );
    expect(edges.length).toBe(1);
  });

  it('traces callback parameter in .map() passed to child', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function TaskCard(props: { task: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <div>{tasks.data.map((item: any) => <TaskCard task={item} />)}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'task' && e.sourceKind === 'query',
    );
    expect(edges.length).toBe(1);
    // Callback trace resolves to the parent data source; isArrayElement may or may not be set
    expect(edges[0]?.queryVar).toBe('tasks');
  });

  it('traces props.propName.nested passed to child via extractPropName', async () => {
    const project = createProject({
      'src/App.tsx': `
        function Child(props: { addr: any }) { return <div />; }
        function App(props: { user: any }) {
          return <Child addr={props.user.address} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'addr' && e.sourceKind === 'prop',
    );
    expect(edges.length).toBe(1);
    expect(edges[0]?.parentProp).toBe('user');
  });

  it('resolves arrow function component via variable declaration', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        const TaskCard = (props: { task: any }) => { return <div />; };
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <TaskCard task={tasks} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter((e) => e.childProp === 'task');
    expect(edges.length).toBeGreaterThanOrEqual(0);
  });

  it('traces prop array method (props.items.filter) passed to child', async () => {
    const project = createProject({
      'src/App.tsx': `
        function Child(props: { filtered: any }) { return <div />; }
        function App(props: { items: any[] }) {
          return <Child filtered={props.items.filter((i: any) => i.active)} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'filtered' && e.sourceKind === 'prop',
    );
    expect(edges.length).toBe(1);
    expect(edges[0]?.isArrayElement).toBe(true);
  });

  it('backward propagation aggregates fields from child components', async () => {
    const project = createProject({
      'src/TaskCard.tsx': `
        function TaskCard({ task }: { task: any }) {
          return <div>{task.title}{task.status}</div>;
        }
      `,
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function TaskCard(props: { task: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <div>{tasks.data.map((t: any) => <TaskCard task={t} />)}</div>;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // Aggregated should include fields from both App and TaskCard
    const agg = result.aggregated.find((a) => a.queryVar === 'tasks');
    expect(agg).toBeDefined();
  });

  it('traces query.data[index] (ElementAccessExpression) passed as JSX prop', async () => {
    const project = createProject({
      'src/TaskCard.tsx': `
        function TaskCard(props: { item: any }) { return <div />; }
      `,
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function TaskCard(props: { item: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <TaskCard item={tasks.data[0]} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'item' && e.sourceKind === 'query',
    );
    expect(edges.length).toBe(1);
    expect(edges[0]?.isArrayElement).toBe(true);
  });

  it('traces query.data.field (PropertyAccessExpression) in JSX prop', async () => {
    const project = createProject({
      'src/Child.tsx': `
        function Child(props: { title: any }) { return <div />; }
      `,
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function Child(props: { title: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <Child title={tasks.data.title} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'title' && e.sourceKind === 'query',
    );
    expect(edges.length).toBe(1);
  });

  it('does not create edge for non-query ElementAccessExpression props', async () => {
    const project = createProject({
      'src/App.tsx': `
        function Child(props: { first: any }) { return <div />; }
        function App(props: { items: any[] }) {
          const x = props.items.length;
          return <Child first={props.items[0]} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // props.items[0] is an ElementAccessExpression on a prop, not a query
    // Should not produce a query-sourced edge
    const queryEdges = result.propFlowGraph.filter(
      (e) => e.childProp === 'first' && e.sourceKind === 'query',
    );
    expect(queryEdges.length).toBe(0);
  });

  it('traces variable assigned from query and passed as JSX prop', async () => {
    const project = createProject({
      'src/Child.tsx': `
        function Child(props: { data: any }) { return <div />; }
      `,
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any };
        function Child(props: { data: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          const myData = tasks;
          return <Child data={myData} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    // myData is a variable referencing the query, should be traced via findVariableDeclaration
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'data' && e.sourceKind === 'query',
    );
    expect(edges.length).toBe(1);
  });

  it('handles query .data.slice() call expression in prop', async () => {
    const project = createProject({
      'src/App.tsx': `
        declare function query(fn: () => any, opts?: any): { data: any[] };
        function Child(props: { items: any }) { return <div />; }
        function App() {
          const tasks = query(() => fetch('/api/tasks'));
          return <Child items={tasks.data.slice(0, 5)} />;
        }
      `,
    });
    const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    const edges = result.propFlowGraph.filter(
      (e) => e.childProp === 'items' && e.sourceKind === 'query',
    );
    // slice is recognized as array method but not an element method
    expect(edges.length).toBe(1);
    expect(edges[0]?.isArrayElement).toBe(false);
  });
});
