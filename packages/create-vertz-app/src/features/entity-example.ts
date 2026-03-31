import { tasksEntityTemplate } from '../templates/index.js';
import type { Feature } from './types.js';

export const entityExampleFeature: Feature = {
  name: 'entity-example',
  dependencies: ['db'],

  files() {
    return [
      { path: 'src/api/entities/tasks.entity.ts', content: tasksEntityTemplate() },
    ];
  },
};
