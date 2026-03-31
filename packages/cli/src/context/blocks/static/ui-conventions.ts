import type { ContextBlock } from '../../types';

export const uiConventionsBlock: ContextBlock = {
  id: 'ui-conventions',
  title: 'UI Development',
  category: 'ui',
  priority: 1,
  content: `The Vertz compiler transforms code to be reactive automatically.

- \`let count = 0\` → signal (mutations trigger DOM updates)
- \`const doubled = count * 2\` → computed
- Components run once — no re-renders, no hooks

### Styling

\`\`\`tsx
import { css } from 'vertz/ui';
const styles = css({
  container: ['flex', 'flex-col', 'gap:4', 'p:6'],
});
<div className={styles.container}>...</div>
\`\`\`

### Data fetching

\`\`\`tsx
import { query } from 'vertz/ui';
const tasks = query(api.tasks.list());
// tasks.loading, tasks.error, tasks.data.items — all reactive
\`\`\`

### Theme components

\`\`\`tsx
import { Button, Input, Dialog } from '@vertz/ui/components';
<Button intent="primary" size="md">Submit</Button>
\`\`\`

### Router

\`\`\`tsx
import { useRouter, useParams } from 'vertz/ui';
const { navigate } = useRouter();
const { id } = useParams<'/tasks/:id'>();
\`\`\``,
};
