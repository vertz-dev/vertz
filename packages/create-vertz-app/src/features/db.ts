import { dbTemplate, schemaTemplate } from '../templates/index.js';
import type { Feature } from './types.js';

export const dbFeature: Feature = {
  name: 'db',
  dependencies: ['api'],

  files() {
    return [
      { path: 'src/api/schema.ts', content: schemaTemplate() },
      { path: 'src/api/db.ts', content: dbTemplate() },
    ];
  },
};
