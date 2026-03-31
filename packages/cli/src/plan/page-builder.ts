export interface PlanOperation {
  type: 'create' | 'append' | 'modify';
  path: string;
  content: string;
  description: string;
}

export interface PageIntent {
  name: string;
  crud: boolean;
  forEntity?: string;
}

export interface PagePlan {
  operations: PlanOperation[];
}

function toPascalCase(s: string): string {
  return s.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
}

function generateBasicPage(name: string): string {
  const componentName = `${toPascalCase(name)}Page`;

  return `import { css } from 'vertz/ui';

const styles = css({
  container: ['py:8', 'px:6', 'max-w:2xl', 'mx:auto'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:4'],
});

export function ${componentName}() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>${toPascalCase(name)}</h1>
    </div>
  );
}
`;
}

function generateCrudPage(name: string, entityName: string): string {
  const componentName = `${toPascalCase(name)}Page`;

  return `import { css, query } from 'vertz/ui';
import { api } from '../client';

const styles = css({
  container: ['py:8', 'px:6', 'max-w:2xl', 'mx:auto'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:4'],
  list: ['flex', 'flex-col', 'gap:2'],
  item: ['p:4', 'rounded:md', 'border:1', 'border:border', 'bg:card'],
  loading: ['text:muted-foreground'],
  error: ['text:destructive'],
});

export function ${componentName}() {
  const items = query(api.${entityName}.list());

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>${toPascalCase(name)}</h1>

      {items.loading && <div className={styles.loading}>Loading...</div>}
      {items.error && <div className={styles.error}>{String(items.error)}</div>}
      {items.data && (
        <div className={styles.list}>
          {items.data.items.map((item) => (
            <div key={item.id} className={styles.item}>
              {JSON.stringify(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
`;
}

/**
 * Builds a plan for adding a new page to the project.
 */
export function buildPagePlan(intent: PageIntent): PagePlan {
  const content = intent.crud && intent.forEntity
    ? generateCrudPage(intent.name, intent.forEntity)
    : generateBasicPage(intent.name);

  return {
    operations: [
      {
        type: 'create',
        path: `src/pages/${intent.name}.tsx`,
        content,
        description: `Create ${toPascalCase(intent.name)}Page component`,
      },
      {
        type: 'modify',
        path: 'src/router.tsx',
        content: '',
        description: `Add /${intent.name} route for ${toPascalCase(intent.name)}Page`,
      },
    ],
  };
}
