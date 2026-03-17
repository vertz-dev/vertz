import { defineEntities } from '@vertz/server';
import { comments } from './comments.entity';
import { issueLabels } from './issue-labels.entity';
import { issues } from './issues.entity';
import { labels } from './labels.entity';
import { projects } from './projects.entity';
import { users } from './users.entity';

export const entities = defineEntities([users, projects, issues, comments, labels, issueLabels]);
