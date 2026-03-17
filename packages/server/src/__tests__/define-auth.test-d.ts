import type { AuthConfig } from '../auth/types';
import type { EntityDefinition } from '../entity/types';
import { defineAuth, defineEntities } from '../index';

// defineAuth returns AuthConfig
const auth = defineAuth({
  session: { strategy: 'jwt', ttl: '15m' },
});
const _authCheck: AuthConfig = auth;

// defineAuth accepts all AuthConfig fields
defineAuth({
  session: { strategy: 'jwt', ttl: '15m', refreshTtl: '7d' },
  emailPassword: { enabled: true },
  jwtSecret: 'some-secret',
  providers: [],
  onUserCreated: async () => {},
});

// @ts-expect-error - session is required
defineAuth({});

// @ts-expect-error - strategy must be a valid SessionStrategy
defineAuth({ session: { strategy: 'invalid', ttl: '15m' } });

// defineEntities returns EntityDefinition[]
const entities = defineEntities([]);
const _entitiesCheck: EntityDefinition[] = entities;

// defineEntities result can be passed to a function expecting EntityDefinition[]
function consume(_e: EntityDefinition[]): void {}
consume(defineEntities([]));
