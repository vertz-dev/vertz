import { describe, expect, it } from '@vertz/test';
import { service } from '../service';

// ---------------------------------------------------------------------------
// Minimal schema fixtures
// ---------------------------------------------------------------------------

const bodySchema = {
  parse(value: unknown) {
    return { ok: true as const, data: value as { email: string } };
  },
};

const responseSchema = {
  parse(value: unknown) {
    return { ok: true as const, data: value as { token: string } };
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: service() definition', () => {
  describe('Given a valid service config with actions', () => {
    describe('When calling service("auth", config)', () => {
      it('Then returns an object with kind "service" and name "auth"', () => {
        const def = service('auth', {
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (input) => ({ token: `tok-${input.email}` }),
            },
          },
        });

        expect(def.kind).toBe('service');
        expect(def.name).toBe('auth');
      });

      it('Then the returned object is frozen (deep freeze)', () => {
        const def = service('auth', {
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (input) => ({ token: `tok-${input.email}` }),
            },
          },
        });

        expect(Object.isFrozen(def)).toBe(true);
        expect(Object.isFrozen(def.access)).toBe(true);
        expect(Object.isFrozen(def.actions)).toBe(true);
        expect(Object.isFrozen(def.inject)).toBe(true);
      });

      it('Then .access contains the passed access rules', () => {
        const loginRule = () => true;
        const def = service('auth', {
          access: { login: loginRule },
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (input) => ({ token: `tok-${input.email}` }),
            },
          },
        });

        expect(def.access.login).toBe(loginRule);
      });

      it('Then .inject defaults to {} when not provided', () => {
        const def = service('auth', {
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (input) => ({ token: `tok-${input.email}` }),
            },
          },
        });

        expect(def.inject).toEqual({});
      });
    });
  });

  describe('Given an invalid service name', () => {
    describe('When calling service() with empty name', () => {
      it('Then throws with a descriptive error', () => {
        expect(() =>
          service('', {
            actions: {
              login: {
                body: bodySchema,
                response: responseSchema,
                handler: async () => ({ token: '' }),
              },
            },
          }),
        ).toThrow(/service\(\) name must be a non-empty lowercase string/);
      });
    });

    describe('When calling service() with uppercase name', () => {
      it('Then rejects the name', () => {
        expect(() =>
          service('Auth', {
            actions: {
              login: {
                body: bodySchema,
                response: responseSchema,
                handler: async () => ({ token: '' }),
              },
            },
          }),
        ).toThrow(/service\(\) name/);
      });
    });

    describe('When calling service() with valid names', () => {
      it('Then accepts lowercase with hyphens and numbers', () => {
        expect(() =>
          service('auth-v2', {
            actions: {
              login: {
                body: bodySchema,
                response: responseSchema,
                handler: async () => ({ token: '' }),
              },
            },
          }),
        ).not.toThrow();
      });
    });
  });

  describe('Given a service config with no actions', () => {
    describe('When calling service() with empty actions', () => {
      it('Then throws with a descriptive error', () => {
        expect(() =>
          service('auth', {
            actions: {},
          }),
        ).toThrow(/service\(\) requires at least one action/);
      });
    });
  });
});
