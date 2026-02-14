import { describe, expect, test } from 'vitest';
import type { DelayConfig, DemoAction, DemoScript } from '../src/types.js';

describe('Types', () => {
  test('DemoScript type structure is valid', () => {
    const script: DemoScript = {
      id: 'test-demo',
      name: 'Test Demo',
      description: 'A test demo script',
      startUrl: 'http://localhost:3000',
      outputPath: 'test.webm',
      actions: [],
    };

    expect(script.id).toBe('test-demo');
    expect(script.actions).toEqual([]);
  });

  test('DemoAction navigate type is valid', () => {
    const action: DemoAction = {
      type: 'navigate',
      url: 'http://localhost:3000/tasks',
      waitFor: '.task-list',
    };

    expect(action.type).toBe('navigate');
  });

  test('DemoAction click type is valid', () => {
    const action: DemoAction = {
      type: 'click',
      selector: '.add-button',
      description: 'Click add button',
    };

    expect(action.type).toBe('click');
  });

  test('DemoAction type type is valid', () => {
    const action: DemoAction = {
      type: 'type',
      selector: 'input[name="title"]',
      text: 'Test Task',
    };

    expect(action.type).toBe('type');
  });

  test('DemoAction wait type is valid', () => {
    const action: DemoAction = {
      type: 'wait',
      ms: 1000,
    };

    expect(action.type).toBe('wait');
  });

  test('DemoAction screenshot type is valid', () => {
    const action: DemoAction = {
      type: 'screenshot',
      options: {
        name: 'test-screenshot',
        annotation: 'Test annotation',
      },
    };

    expect(action.type).toBe('screenshot');
  });

  test('DemoAction narrate type is valid', () => {
    const action: DemoAction = {
      type: 'narrate',
      text: 'This is narration text',
      description: 'Narrate the demo',
    };

    expect(action.type).toBe('narrate');
    if (action.type === 'narrate') {
      expect(action.text).toBe('This is narration text');
    }
  });

  test('DelayConfig with variance is valid', () => {
    const delay: DelayConfig = {
      base: 500,
      variance: 0.2,
    };

    expect(delay.base).toBe(500);
    expect(delay.variance).toBe(0.2);
  });
});
