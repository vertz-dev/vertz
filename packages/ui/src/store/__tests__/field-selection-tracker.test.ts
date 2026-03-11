import { describe, expect, it, mock } from 'bun:test';
import { FieldSelectionTracker } from '../field-selection-tracker';

function withWarnSpy(fn: (warnSpy: ReturnType<typeof mock>) => void): void {
  const warnSpy = mock(() => {});
  const originalWarn = console.warn;
  console.warn = warnSpy;
  try {
    fn(warnSpy);
  } finally {
    console.warn = originalWarn;
  }
}

describe('FieldSelectionTracker', () => {
  describe('Given a tracker with registered select fields for an entity', () => {
    describe('When a non-selected field is accessed on the dev proxy', () => {
      it('Then console.warn is called with the field name, entity type, and query source', () => {
        const tracker = new FieldSelectionTracker();
        tracker.registerSelect('users', 'u1', ['id', 'name', 'email'], 'GET:/users');

        const entity = { id: 'u1', name: 'Alice', email: 'alice@test.com' };
        const proxy = tracker.createDevProxy(entity, 'users', 'u1');

        withWarnSpy((warnSpy) => {
          const _bio = (proxy as any).bio;

          expect(warnSpy).toHaveBeenCalledTimes(1);
          const message = warnSpy.mock.calls[0][0] as string;
          expect(message).toContain('bio');
          expect(message).toContain('users');
          expect(message).toContain('GET:/users');
        });
      });
    });

    describe('When a selected field is accessed on the dev proxy', () => {
      it('Then no warning is logged', () => {
        const tracker = new FieldSelectionTracker();
        tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');

        const entity = { id: 'u1', name: 'Alice' };
        const proxy = tracker.createDevProxy(entity, 'users', 'u1');

        withWarnSpy((warnSpy) => {
          const name = proxy.name;
          expect(name).toBe('Alice');
          expect(warnSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Given an entity fetched by a query without field selection', () => {
    describe('When any field is accessed on the dev proxy', () => {
      it('Then no warning is logged (full fetch disables warnings)', () => {
        const tracker = new FieldSelectionTracker();
        tracker.registerFullFetch('users', 'u1');

        const entity = { id: 'u1', name: 'Alice' };
        const proxy = tracker.createDevProxy(entity, 'users', 'u1');

        withWarnSpy((warnSpy) => {
          const _bio = (proxy as any).bio;
          expect(warnSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Given an entity with select fields and then a full fetch', () => {
    describe('When a non-selected field is accessed', () => {
      it('Then no warning is logged (full fetch overrides)', () => {
        const tracker = new FieldSelectionTracker();
        tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');
        tracker.registerFullFetch('users', 'u1');

        const entity = { id: 'u1', name: 'Alice' };
        const proxy = tracker.createDevProxy(entity, 'users', 'u1');

        withWarnSpy((warnSpy) => {
          const _bio = (proxy as any).bio;
          expect(warnSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Given two queries with different select fields for the same entity', () => {
    describe('When a field from either query is accessed', () => {
      it('Then no warning is logged (fields are unioned)', () => {
        const tracker = new FieldSelectionTracker();
        tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users/u1');
        tracker.registerSelect('users', 'u1', ['id', 'email'], 'GET:/users');

        const entity = { id: 'u1', name: 'Alice', email: 'a@test.com' };
        const proxy = tracker.createDevProxy(entity, 'users', 'u1');

        withWarnSpy((warnSpy) => {
          const _name = proxy.name;
          const _email = proxy.email;
          expect(warnSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Given no select tracking for an entity', () => {
    describe('When the dev proxy is created', () => {
      it('Then it returns the entity unchanged (no Proxy wrapping)', () => {
        const tracker = new FieldSelectionTracker();
        const entity = { id: 'u1', name: 'Alice' };
        const result = tracker.createDevProxy(entity, 'users', 'u1');

        // Should be the exact same object reference (no Proxy)
        expect(result).toBe(entity);
      });
    });
  });

  describe('Given an internal property access (toJSON, toString, etc.)', () => {
    describe('When accessed on a proxy with select tracking', () => {
      it('Then no warning is logged', () => {
        const tracker = new FieldSelectionTracker();
        tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');

        const entity = { id: 'u1', name: 'Alice' };
        const proxy = tracker.createDevProxy(entity, 'users', 'u1');

        withWarnSpy((warnSpy) => {
          const _str = proxy.toString();
          const _json = JSON.stringify(proxy);
          expect(warnSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('Given tracker.clear() is called', () => {
    describe('When a non-selected field is accessed after clear', () => {
      it('Then no warning is logged (tracking data wiped)', () => {
        const tracker = new FieldSelectionTracker();
        tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');
        tracker.clear();

        const entity = { id: 'u1', name: 'Alice' };
        const result = tracker.createDevProxy(entity, 'users', 'u1');

        // Should return original entity (no tracking)
        expect(result).toBe(entity);
      });
    });
  });

  describe('Given the same non-selected field is accessed multiple times', () => {
    it('Then the warning is logged only once (dedup)', () => {
      const tracker = new FieldSelectionTracker();
      tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');

      const entity = { id: 'u1', name: 'Alice' };
      const proxy = tracker.createDevProxy(entity, 'users', 'u1');

      withWarnSpy((warnSpy) => {
        const _bio1 = (proxy as any).bio;
        const _bio2 = (proxy as any).bio;
        const _bio3 = (proxy as any).bio;
        expect(warnSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Given removeEntity is called', () => {
    it('Then shouldWarn returns false for the removed entity', () => {
      const tracker = new FieldSelectionTracker();
      tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');

      expect(tracker.shouldWarn('users', 'u1', 'bio')).toBe(true);

      tracker.removeEntity('users', 'u1');

      expect(tracker.shouldWarn('users', 'u1', 'bio')).toBe(false);
    });

    it('Then the dedup warning set is also cleaned for that entity', () => {
      const tracker = new FieldSelectionTracker();
      tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');

      const entity = { id: 'u1', name: 'Alice' };
      const proxy1 = tracker.createDevProxy(entity, 'users', 'u1');

      withWarnSpy((warnSpy) => {
        const _bio = (proxy1 as any).bio;
        expect(warnSpy).toHaveBeenCalledTimes(1);
      });

      // Remove and re-register
      tracker.removeEntity('users', 'u1');
      tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');

      const proxy2 = tracker.createDevProxy(entity, 'users', 'u1');

      withWarnSpy((warnSpy) => {
        const _bio = (proxy2 as any).bio;
        // Should warn again since the entity was removed and re-registered
        expect(warnSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('shouldWarn()', () => {
    it('returns true for non-selected fields', () => {
      const tracker = new FieldSelectionTracker();
      tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');

      expect(tracker.shouldWarn('users', 'u1', 'bio')).toBe(true);
    });

    it('returns false for selected fields', () => {
      const tracker = new FieldSelectionTracker();
      tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');

      expect(tracker.shouldWarn('users', 'u1', 'name')).toBe(false);
    });

    it('returns false for entities with no tracking', () => {
      const tracker = new FieldSelectionTracker();

      expect(tracker.shouldWarn('users', 'u1', 'anything')).toBe(false);
    });

    it('returns false after registerFullFetch', () => {
      const tracker = new FieldSelectionTracker();
      tracker.registerSelect('users', 'u1', ['id', 'name'], 'GET:/users');
      tracker.registerFullFetch('users', 'u1');

      expect(tracker.shouldWarn('users', 'u1', 'bio')).toBe(false);
    });
  });
});
