import { defineEntities } from '@vertz/server';
import { comments } from './comments.entity';
import { issues } from './issues.entity';
import { projects } from './projects.entity';
import { users } from './users.entity';

export const entities = defineEntities([users, projects, issues, comments]);
