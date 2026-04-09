import { describe, expect, it } from '@vertz/test';
import { cond, getCallbacks, pipe, task } from '../builders';

describe('task()', () => {
  it('returns CommandTask from string shorthand', () => {
    const t = task('bun run build');
    expect(t).toEqual({ command: 'bun run build' });
  });

  it('returns TaskDef object as-is', () => {
    const input = { command: 'bun test', deps: ['^build'] };
    const t = task(input);
    expect(t).toBe(input);
  });

  it('returns StepsTask as-is', () => {
    const input = { steps: ['lint', 'test'] };
    const t = task(input);
    expect(t).toEqual({ steps: ['lint', 'test'] });
  });
});

describe('cond.*', () => {
  it('changed() returns ChangedCondition', () => {
    const c = cond.changed('src/**', 'package.json');
    expect(c).toEqual({ type: 'changed', patterns: ['src/**', 'package.json'] });
  });

  it('branch() returns BranchCondition', () => {
    const c = cond.branch('main', 'release/*');
    expect(c).toEqual({ type: 'branch', names: ['main', 'release/*'] });
  });

  it('env() returns EnvCondition without value', () => {
    const c = cond.env('CI');
    expect(c).toEqual({ type: 'env', name: 'CI' });
    expect(c).not.toHaveProperty('value');
  });

  it('env() returns EnvCondition with value', () => {
    const c = cond.env('NODE_ENV', 'production');
    expect(c).toEqual({ type: 'env', name: 'NODE_ENV', value: 'production' });
  });

  it('all() composes conditions', () => {
    const c = cond.all(cond.changed('native/**'), cond.branch('main'));
    expect(c.type).toBe('all');
    expect(c.conditions).toHaveLength(2);
    expect(c.conditions[0]!.type).toBe('changed');
    expect(c.conditions[1]!.type).toBe('branch');
  });

  it('any() composes conditions', () => {
    const c = cond.any(cond.env('CI'), cond.branch('main'));
    expect(c.type).toBe('any');
    expect(c.conditions).toHaveLength(2);
  });
});

describe('pipe()', () => {
  it('returns the config object', () => {
    const config = pipe({ tasks: { build: task('bun run build') } });
    expect(config.tasks['build']).toBeDefined();
  });

  it('intercepts function on: values and assigns callback IDs', () => {
    const fn = (r: { cached: boolean }) => r.cached;
    const config = pipe({
      tasks: {
        build: task('build'),
        test: task({
          command: 'test',
          deps: [{ task: 'build', on: fn as (result: { cached: boolean }) => boolean }],
        }),
      },
    });

    // The function should be replaced with a callback descriptor
    const dep = config.tasks['test']!.deps![0]!;
    expect(typeof dep).toBe('object');
    if (typeof dep === 'object') {
      // The on field is now a wire-format object: { type: 'callback', id: N }
      // Use JSON round-trip to safely inspect the shape without double-cast.
      const wire = JSON.parse(JSON.stringify(dep)) as { on: { type: string; id: number } };
      expect(wire.on.type).toBe('callback');
      expect(typeof wire.on.id).toBe('number');
    }
  });

  it('populates callback registry', () => {
    const initialSize = getCallbacks().size;
    const fn = () => true;
    pipe({
      tasks: {
        a: task('a'),
        b: task({ command: 'b', deps: [{ task: 'a', on: fn }] }),
      },
    });
    expect(getCallbacks().size).toBe(initialSize + 1);
  });

  it('leaves string deps unchanged', () => {
    const config = pipe({
      tasks: {
        build: task('build'),
        test: task({ command: 'test', deps: ['build', '^build'] }),
      },
    });
    expect(config.tasks['test']!.deps).toEqual(['build', '^build']);
  });

  it('passes rootAffectsAll through on workflows', () => {
    const config = pipe({
      tasks: { build: task('build') },
      workflows: {
        ci: { run: ['build'], filter: 'affected', rootAffectsAll: true },
      },
    });
    expect(config.workflows!['ci']!.rootAffectsAll).toBe(true);
  });

  it('leaves rootAffectsAll undefined when not set', () => {
    const config = pipe({
      tasks: { build: task('build') },
      workflows: {
        ci: { run: ['build'], filter: 'affected' },
      },
    });
    expect(config.workflows!['ci']!.rootAffectsAll).toBeUndefined();
  });

  it('leaves string on: values unchanged', () => {
    const config = pipe({
      tasks: {
        build: task('build'),
        test: task({ command: 'test', deps: [{ task: 'build', on: 'always' }] }),
      },
    });
    const dep = config.tasks['test']!.deps![0]!;
    expect(typeof dep).toBe('object');
    if (typeof dep === 'object') {
      expect(dep.on).toBe('always');
    }
  });
});
