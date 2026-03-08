import { s } from '@vertz/schema';
import { createEnv } from '@vertz/server';

export const env = createEnv({
  schema: s.object({
    PORT: s.coerce.number().default(3000),
  }),
});
