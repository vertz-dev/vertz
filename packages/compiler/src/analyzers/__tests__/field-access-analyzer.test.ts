import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config';
import { FieldAccessAnalyzer } from '../field-access-analyzer';

const _sharedProject = new Project({ useInMemoryFileSystem: true });

function createProject() {
  for (const file of _sharedProject.getSourceFiles()) {
    file.deleteImmediatelySync();
  }
  return _sharedProject;
}

describe('FieldAccessAnalyzer (POC - Intra-component)', () => {
  describe('Query field access', () => {
    it('tracks direct property access on query result', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const result = query(() => sdk.posts.list());
  return <div>{result.data.title}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results).toHaveLength(1);
      expect(results[0].component).toBe('src/component.tsx');
      expect(results[0].queryAccess).toHaveLength(1);
      expect(results[0].queryAccess[0].fields).toEqual(['title']);
      expect(results[0].queryAccess[0].hasOpaqueAccess).toBe(false);
    });

    it('tracks nested property access', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const result = query(() => sdk.users.get());
  return <div>{result.data.author.name}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess[0].fields).toEqual(['author.name']);
    });

    it('tracks multiple fields from same query', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const result = query(() => sdk.posts.get());
  return <div>{result.data.title} - {result.data.author.name}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess[0].fields).toEqual(['title', 'author.name']);
    });

    it('tracks fields from map callback', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const posts = query(() => sdk.posts.list());
  return <div>{posts.data.map(p => <div>{p.title}</div>)}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess[0].fields).toEqual(['title']);
    });

    it('tracks fields from filter + map chain', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const posts = query(() => sdk.posts.list());
  return <div>{posts.data.filter(p => p.published).map(p => <div>{p.title}</div>)}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess[0].fields).toContain('published');
      expect(results[0].queryAccess[0].fields).toContain('title');
    });

    it('tracks array element access', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const posts = query(() => sdk.posts.list());
  return <div>{posts.data[0].title}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess[0].fields).toEqual(['title']);
    });

    it('handles multiple queries in same component', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const posts = query(() => sdk.posts.list());
  const users = query(() => sdk.users.list());
  return <div>{posts.data[0].title} - {users.data[0].name}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess).toHaveLength(2);
      expect(results[0].queryAccess.find(q => q.queryVar === 'posts')?.fields).toEqual(['title']);
      expect(results[0].queryAccess.find(q => q.queryVar === 'users')?.fields).toEqual(['name']);
    });

    it('flags opaque access (computed property)', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const result = query(() => sdk.posts.get());
  const key = 'title';
  return <div>{result.data[key]}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess[0].hasOpaqueAccess).toBe(true);
    });

    it('handles destructuring', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const result = query(() => sdk.posts.get());
  const { title, author } = result.data;
  return <div>{title} - {author.name}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess[0].fields).toContain('title');
      expect(results[0].queryAccess[0].fields).toContain('author.name');
    });

    it('handles spread operator as opaque', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component() {
  const result = query(() => sdk.posts.get());
  const props = { ...result.data };
  return <div>{props.title}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess[0].hasOpaqueAccess).toBe(true);
    });
  });

  describe('Prop field access', () => {
    it('tracks property access on props', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `function Component(props: { post: Post }) {
  return <div>{props.post.title}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].propAccess).toHaveLength(1);
      expect(results[0].propAccess[0].propName).toBe('post');
      expect(results[0].propAccess[0].fields).toEqual(['title']);
    });

    it('tracks nested property access on props', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `function Component(props: { user: User }) {
  return <div>{props.user.profile.avatar}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].propAccess[0].fields).toEqual(['profile.avatar']);
    });

    it('tracks multiple fields on same prop', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `function Component(props: { post: Post }) {
  return <div>{props.post.title} - {props.post.author.name}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].propAccess[0].fields).toEqual(['title', 'author.name']);
    });

    it('tracks fields from multiple props', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `function Component(props: { post: Post; user: User }) {
  return <div>{props.post.title} - {props.user.name}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].propAccess).toHaveLength(2);
      expect(results[0].propAccess.find(p => p.propName === 'post')?.fields).toEqual(['title']);
      expect(results[0].propAccess.find(p => p.propName === 'user')?.fields).toEqual(['name']);
    });

    it('handles destructured props', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `function Component({ post }: { post: Post }) {
  return <div>{post.title}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].propAccess[0].propName).toBe('post');
      expect(results[0].propAccess[0].fields).toEqual(['title']);
    });

    it('flags opaque access on props', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `function Component(props: { post: Post }) {
  const key = 'title';
  return <div>{props.post[key]}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].propAccess[0].hasOpaqueAccess).toBe(true);
    });

    it('ignores non-entity props (primitives, functions)', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `function Component(props: { count: number; onClick: () => void; className: string }) {
  return <div className={props.className} onClick={props.onClick}>{props.count}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].propAccess).toHaveLength(0);
    });
  });

  describe('Combined query and prop access', () => {
    it('tracks both query and prop access in same component', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `import { query } from '@vertz/query';
function Component(props: { user: User }) {
  const posts = query(() => sdk.posts.list());
  return <div>{props.user.name} - {posts.data[0].title}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].queryAccess).toHaveLength(1);
      expect(results[0].queryAccess[0].fields).toEqual(['title']);
      expect(results[0].propAccess).toHaveLength(1);
      expect(results[0].propAccess[0].fields).toEqual(['name']);
    });
  });

  describe('Multiple components', () => {
    it('analyzes multiple components independently', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/a.tsx',
        `import { query } from '@vertz/query';
function A() {
  const posts = query(() => sdk.posts.list());
  return <div>{posts.data[0].title}</div>;
}`,
      );
      project.createSourceFile(
        'src/b.tsx',
        `function B(props: { user: User }) {
  return <div>{props.user.name}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results).toHaveLength(2);
      const compA = results.find(r => r.component === 'src/a.tsx');
      const compB = results.find(r => r.component === 'src/b.tsx');
      expect(compA?.queryAccess[0].fields).toEqual(['title']);
      expect(compB?.propAccess[0].fields).toEqual(['name']);
    });
  });

  describe('Edge cases', () => {
    it('handles components with no queries or props', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `function Component() {
  return <div>Hello</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results).toHaveLength(1);
      expect(results[0].queryAccess).toHaveLength(0);
      expect(results[0].propAccess).toHaveLength(0);
    });

    it('handles arrow function components', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `const Component = (props: { post: Post }) => {
  return <div>{props.post.title}</div>;
};`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].propAccess[0].fields).toEqual(['title']);
    });

    it('handles conditional property access', async () => {
      const project = createProject();
      project.createSourceFile(
        'src/component.tsx',
        `function Component(props: { post: Post }) {
  return <div>{props.post?.title}</div>;
}`,
      );
      const analyzer = new FieldAccessAnalyzer(project, resolveConfig());
      const results = await analyzer.analyze();
      expect(results[0].propAccess[0].fields).toEqual(['title']);
    });
  });
});
