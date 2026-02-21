import { createId } from '@paralleldrive/cuid2';
import { v7 as uuidv7 } from 'uuid';
import { nanoid } from 'nanoid';

export type IdStrategy = 'cuid' | 'uuid' | 'nanoid';

export function generateId(strategy: IdStrategy): string {
  switch (strategy) {
    case 'cuid': return createId();
    case 'uuid': return uuidv7();
    case 'nanoid': return nanoid();
    default: throw new Error(`Unknown ID generation strategy: ${strategy}`);
  }
}
