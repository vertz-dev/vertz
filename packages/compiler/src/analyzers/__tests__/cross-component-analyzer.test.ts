import { Project } from 'ts-morph';
import { describe, expect, it } from 'bun:test';
import { resolveConfig } from '../../config';
import { CrossComponentAnalyzer } from '../cross-component-analyzer';

const _sharedProject = new Project({ useInMemoryFileSystem: true });

function createProject() {
  for (const file of _sharedProject.getSourceFiles()) {
    file.deleteImmediatelySync();
  }
  return _sharedProject;
}

describe('CrossComponentAnalyzer', () => {
  describe('Prop Flow Graph Building', () => {
    it('traces basic prop passing from parent query to child', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const users = query(() => sdk.users.list());
  return <Child user={users.data[0]} />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child(props) {
  return <div>{props.user.name}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.propFlowGraph).toHaveLength(1);
      expect(result.propFlowGraph[0]).toMatchObject({
        parent: 'src/Parent.tsx',
        sourceKind: 'query',
        queryVar: 'users',
        child: 'src/Child.tsx',
        childProp: 'user',
      });

      expect(result.aggregated).toHaveLength(1);
      expect(result.aggregated[0]).toMatchObject({
        component: 'src/Parent.tsx',
        queryVar: 'users',
        fields: ['name'],
      });
    });

    it('traces multi-level prop passing (A → B → C)', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/A.tsx',
        `import { query } from '@vertz/query';
function A() {
  const posts = query(() => sdk.posts.list());
  return <B post={posts.data[0]} />;
}`,
      );
      project.createSourceFile(
        'src/B.tsx',
        `function B(props) {
  return <C post={props.post} />;
}`,
      );
      project.createSourceFile(
        'src/C.tsx',
        `function C(props) {
  return <div>{props.post.title}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.propFlowGraph).toHaveLength(2);
      expect(result.aggregated[0].fields).toContain('title');
    });

    it('aggregates multiple children reading different fields', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const user = query(() => sdk.users.get());
  return (
    <>
      <ChildA user={user.data} />
      <ChildB user={user.data} />
    </>
  );
}`,
      );
      project.createSourceFile(
        'src/ChildA.tsx',
        `function ChildA(props) {
  return <div>{props.user.name}</div>;
}`,
      );
      project.createSourceFile(
        'src/ChildB.tsx',
        `function ChildB(props) {
  return <div>{props.user.email}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.propFlowGraph).toHaveLength(2);
      expect(result.aggregated[0].fields).toContain('name');
      expect(result.aggregated[0].fields).toContain('email');
    });

    it('handles spread props as opaque boundary', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const post = query(() => sdk.posts.get());
  return <Child {...post.data} />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child(props) {
  return <div>{props.title}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      // Spread props are not tracked in the flow graph
      expect(result.propFlowGraph).toHaveLength(0);
    });

    it('ignores non-entity props', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `function Parent() {
  return <Child className="foo" onClick={() => {}} count={5} />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child(props) {
  return <div className={props.className}>{props.count}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.propFlowGraph).toHaveLength(0);
    });

    it('handles multiple queries in parent', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const users = query(() => sdk.users.list());
  const posts = query(() => sdk.posts.list());
  return (
    <>
      <UserList users={users.data} />
      <PostList posts={posts.data} />
    </>
  );
}`,
      );
      project.createSourceFile(
        'src/UserList.tsx',
        `function UserList(props) {
  return <div>{props.users.map(u => u.name)}</div>;
}`,
      );
      project.createSourceFile(
        'src/PostList.tsx',
        `function PostList(props) {
  return <div>{props.posts.map(p => p.title)}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated).toHaveLength(2);
      const usersQuery = result.aggregated.find(a => a.queryVar === 'users');
      const postsQuery = result.aggregated.find(a => a.queryVar === 'posts');
      expect(usersQuery?.fields).toContain('name');
      expect(postsQuery?.fields).toContain('title');
    });

    it('detects cycles without infinite looping', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/TreeNode.tsx',
        `import { query } from '@vertz/query';
function TreeNode(props) {
  if (props.node) {
    return <TreeNode node={props.node.child} />;
  }
  const tree = query(() => sdk.tree.get());
  return <TreeNode node={tree.data} />;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      // Should complete without hanging
      expect(result.aggregated).toHaveLength(1);
    });

    it('handles unresolvable components as opaque boundary', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
import { LazyComponent } from './external';

function Parent() {
  const post = query(() => sdk.posts.get());
  return <LazyComponent post={post.data} />;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      // Can't resolve LazyComponent, so no edge created
      expect(result.propFlowGraph).toHaveLength(0);
    });

    it('handles filter + map chain', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const posts = query(() => sdk.posts.list());
  return <div>{posts.data.filter(p => p.published).map(p => <PostCard post={p} />)}</div>;
}`,
      );
      project.createSourceFile(
        'src/PostCard.tsx',
        `function PostCard(props) {
  return <div>{props.post.title}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated[0].fields).toContain('published');
      expect(result.aggregated[0].fields).toContain('title');
    });

    it('handles array variable passed to child', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const posts = query(() => sdk.posts.list());
  const items = posts.data;
  return <List items={items} />;
}`,
      );
      project.createSourceFile(
        'src/List.tsx',
        `function List(props) {
  return <div>{props.items.map(i => i.title)}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.propFlowGraph).toHaveLength(1);
      expect(result.aggregated[0].fields).toContain('title');
    });

    it('handles conditional JSX rendering', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const user = query(() => sdk.users.get());
  const isAdmin = true;
  return isAdmin ? <AdminPanel user={user.data} /> : <UserPanel user={user.data} />;
}`,
      );
      project.createSourceFile(
        'src/AdminPanel.tsx',
        `function AdminPanel(props) {
  return <div>{props.user.role}</div>;
}`,
      );
      project.createSourceFile(
        'src/UserPanel.tsx',
        `function UserPanel(props) {
  return <div>{props.user.name}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.propFlowGraph).toHaveLength(2);
      expect(result.aggregated[0].fields).toContain('role');
      expect(result.aggregated[0].fields).toContain('name');
    });
  });

  describe('Backward Propagation', () => {
    it('propagates single hop field access', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const user = query(() => sdk.users.get());
  return <Child user={user.data} />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child(props) {
  return <div>{props.user.name}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated[0].fields).toEqual(['name']);
    });

    it('propagates two-hop field access', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const user = query(() => sdk.users.get());
  return <Middle user={user.data} />;
}`,
      );
      project.createSourceFile(
        'src/Middle.tsx',
        `function Middle(props) {
  return <Leaf user={props.user} />;
}`,
      );
      project.createSourceFile(
        'src/Leaf.tsx',
        `function Leaf(props) {
  return <div>{props.user.name}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated[0].fields).toEqual(['name']);
    });

    it('aggregates fields in diamond pattern', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const user = query(() => sdk.users.get());
  return (
    <>
      <ChildA user={user.data} />
      <ChildB user={user.data} />
    </>
  );
}`,
      );
      project.createSourceFile(
        'src/ChildA.tsx',
        `function ChildA(props) {
  return <div>{props.user.name}</div>;
}`,
      );
      project.createSourceFile(
        'src/ChildB.tsx',
        `function ChildB(props) {
  return <div>{props.user.email}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated[0].fields).toContain('email');
      expect(result.aggregated[0].fields).toContain('name');
    });

    it('propagates opaque access flag', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const user = query(() => sdk.users.get());
  return <Child user={user.data} />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child(props) {
  const key = 'name';
  return <div>{props.user[key]}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated[0].hasOpaqueAccess).toBe(true);
    });

    it('tracks mixed query and prop access in same component', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const users = query(() => sdk.users.list());
  return <Child user={users.data[0]} />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `import { query } from '@vertz/query';
function Child(props) {
  const settings = query(() => sdk.settings.get());
  return <div>{props.user.name} - {settings.data.theme}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      // Parent query should include 'name'
      const parentQuery = result.aggregated.find(
        a => a.component === 'src/Parent.tsx' && a.queryVar === 'users'
      );
      expect(parentQuery?.fields).toContain('name');

      // Child query should include 'theme'
      const childQuery = result.aggregated.find(
        a => a.component === 'src/Child.tsx' && a.queryVar === 'settings'
      );
      expect(childQuery?.fields).toContain('theme');
    });

    it('ignores prop not from entity', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `function Parent() {
  return <Child count={5} />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child(props) {
  return <div>{props.count}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.propFlowGraph).toHaveLength(0);
      expect(result.aggregated).toHaveLength(0);
    });
  });

  describe('Integration with Existing Analyzer', () => {
    it('works for standalone component without cross-component', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const post = query(() => sdk.posts.get());
  return <div>{post.data.title}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated).toHaveLength(1);
      expect(result.aggregated[0].fields).toEqual(['title']);
    });

    it('combines local and cross-component field accesses', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const post = query(() => sdk.posts.get());
  return (
    <div>
      {post.data.id}
      <Child post={post.data} />
    </div>
  );
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child(props) {
  return <div>{props.post.title}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated[0].fields).toContain('id');
      expect(result.aggregated[0].fields).toContain('title');
    });

    it('handles map callback with cross-component', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const posts = query(() => sdk.posts.list());
  return <div>{posts.data.map(p => <PostCard post={p} />)}</div>;
}`,
      );
      project.createSourceFile(
        'src/PostCard.tsx',
        `function PostCard(props) {
  return <div>{props.post.title}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated[0].fields).toContain('title');
    });

    it('handles conditional rendering with cross-component', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const user = query(() => sdk.users.get());
  const isAdmin = user.data.role === 'admin';
  return isAdmin ? <AdminView user={user.data} /> : <UserView user={user.data} />;
}`,
      );
      project.createSourceFile(
        'src/AdminView.tsx',
        `function AdminView(props) {
  return <div>{props.user.permissions}</div>;
}`,
      );
      project.createSourceFile(
        'src/UserView.tsx',
        `function UserView(props) {
  return <div>{props.user.name}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated[0].fields).toContain('role');
      expect(result.aggregated[0].fields).toContain('permissions');
      expect(result.aggregated[0].fields).toContain('name');
    });
  });

  describe('Edge Cases', () => {
    it('handles component with no props', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const data = query(() => sdk.data.get());
  return <Child />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child() {
  return <div>No props</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.propFlowGraph).toHaveLength(0);
    });

    it('handles HTML elements (lowercase tags)', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const data = query(() => sdk.data.get());
  return <div>{data.data.value}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      // HTML elements should be ignored
      expect(result.propFlowGraph).toHaveLength(0);
      expect(result.aggregated[0].fields).toEqual(['value']);
    });

    it('handles ref and key props (should be ignored)', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const ref = { current: null };
  const user = query(() => sdk.users.get());
  return <Child ref={ref} key="user-1" user={user.data} />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child(props) {
  return <div>{props.user.name}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      // Only user prop should be tracked
      expect(result.propFlowGraph).toHaveLength(1);
      expect(result.propFlowGraph[0].childProp).toBe('user');
    });

    it('handles destructured props in parent', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const user = query(() => sdk.users.get());
  const { name, email } = user.data;
  return <Child userName={name} userEmail={email} />;
}`,
      );
      project.createSourceFile(
        'src/Child.tsx',
        `function Child(props) {
  return <div>{props.userName} - {props.userEmail}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      // Should trace destructured values back to query
      expect(result.aggregated[0].fields).toContain('name');
      expect(result.aggregated[0].fields).toContain('email');
    });

    it('handles nested map with callback', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/Parent.tsx',
        `import { query } from '@vertz/query';
function Parent() {
  const posts = query(() => sdk.posts.list());
  return (
    <div>
      {posts.data.map(post => (
        <div>
          {post.comments.map(comment => (
            <Comment comment={comment} />
          ))}
        </div>
      ))}
    </div>
  );
}`,
      );
      project.createSourceFile(
        'src/Comment.tsx',
        `function Comment(props) {
  return <div>{props.comment.text}</div>;
}`,
      );

      const analyzer = new CrossComponentAnalyzer(project, resolveConfig());
      const result = await analyzer.analyze();

      expect(result.aggregated[0].fields).toContain('comments');
    });
  });
});
