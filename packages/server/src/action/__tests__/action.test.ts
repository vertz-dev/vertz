import { describe, expect, it } from 'bun:test';
import { action } from '../action';

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

describe('Feature: action() definition', () => {
  describe('Given a valid action config with actions', () => {
    describe('When calling action("auth", config)', () => {
      it('Then returns an object with kind "action" and name "auth"', () => {
        const def = action('auth', {
          actions: {
            login: {
              body: bodySchema,
              response: responseSchema,
              handler: async (input) => ({ token: `tok-${input.email}` }),
            },
          },
        });

        expect(def.kind).toBe('action');
        expect(def.name).toBe('auth');
      });

      it('Then the returned object is frozen (deep freeze)', () => {
        const def = action('auth', {
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
        const def = action('auth', {
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
        const def = action('auth', {
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

  describe('Given an invalid action name', () => {
    describe('When calling action() with empty name', () => {
      it('Then throws with a descriptive error', () => {
        expect(() =>
          action('', {
            actions: {
              login: {
                body: bodySchema,
                response: responseSchema,
                handler: async () => ({ token: '' }),
              },
            },
          }),
        ).toThrow(/action\(\) name must be a non-empty lowercase string/);
      });
    });

    describe('When calling action() with uppercase name', () => {
      it('Then rejects the name', () => {
        expect(() =>
          action('Auth', {
            actions: {
              login: {
                body: bodySchema,
                response: responseSchema,
                handler: async () => ({ token: '' }),
              },
            },
          }),
        ).toThrow(/action\(\) name/);
      });
    });

    describe('When calling action() with valid names', () => {
      it('Then accepts lowercase with hyphens and numbers', () => {
        expect(() =>
          action('auth-v2', {
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

  describe('Given an action config with no actions', () => {
    describe('When calling action() with empty actions', () => {
      it('Then throws with a descriptive error', () => {
        expect(() =>
          action('auth', {
            actions: {},
          }),
        ).toThrow(/action\(\) requires at least one action/);
      });
    });
  });
});
