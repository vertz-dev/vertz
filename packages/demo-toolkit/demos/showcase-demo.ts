/**
 * Vertz Framework Showcase Demo
 * 
 * A YC demo day-style presentation showcasing what makes Vertz special.
 */

import type { DemoScript } from '../src/types.js';

export const showcaseDemo: DemoScript = {
  id: 'vertz-showcase',
  name: 'Vertz Framework Showcase',
  description: 'A compelling demo highlighting what makes Vertz different from React, Solid, and Vue',
  startUrl: 'http://localhost:5174',
  outputPath: 'vertz-showcase.webm',
  defaultDelay: {
    base: 900,
    variance: 0.25,
  },
  actions: [
    // Opening
    {
      type: 'wait',
      ms: 1500,
    },
    
    {
      type: 'narrate',
      text: 'Meet Vertz — a full-stack framework that combines React\'s developer experience with the performance of fine-grained reactivity.',
    },

    {
      type: 'screenshot',
      options: {
        name: 'showcase-01-initial',
      },
    },

    {
      type: 'wait',
      ms: 800,
    },

    {
      type: 'narrate',
      text: 'This entire page was server-side rendered with Vite. No flash of unstyled content. No layout shifts. Just instant, styled HTML.',
    },

    // Fine-grained reactivity
    {
      type: 'wait',
      ms: 1000,
    },

    {
      type: 'narrate',
      text: 'Let me show you what makes Vertz different. Watch what happens when we filter these tasks.',
    },

    {
      type: 'wait',
      ms: 600,
    },

    {
      type: 'click',
      selector: '[data-testid="filter-in-progress"]',
    },

    {
      type: 'wait',
      ms: 500,
    },

    {
      type: 'screenshot',
      options: {
        name: 'showcase-02-filtered',
      },
    },

    {
      type: 'narrate',
      text: 'No virtual DOM diffing. No reconciliation. Vertz updates only the exact DOM nodes that changed. This is fine-grained reactivity — and it\'s blazingly fast.',
    },

    {
      type: 'click',
      selector: '[data-testid="filter-completed"]',
    },

    {
      type: 'wait',
      ms: 600,
    },

    {
      type: 'click',
      selector: '[data-testid="filter-all"]',
    },

    {
      type: 'wait',
      ms: 800,
    },

    // Forms
    {
      type: 'narrate',
      text: 'Forms in Vertz are progressively enhanced. They work without JavaScript, but get reactive validation when it loads.',
    },

    {
      type: 'click',
      selector: '[data-testid="create-task-btn"]',
    },

    {
      type: 'wait',
      ms: 1200,
    },

    {
      type: 'screenshot',
      options: {
        name: 'showcase-03-form',
      },
    },

    {
      type: 'wait',
      ms: 600,
    },

    {
      type: 'narrate',
      text: 'Let\'s create a new task. Type-safe forms with built-in validation.',
    },

    {
      type: 'type',
      selector: 'input[name="title"]',
      text: 'Launch product on Hacker News',
    },

    {
      type: 'wait',
      ms: 700,
    },

    {
      type: 'type',
      selector: 'textarea[name="description"]',
      text: 'Share our YC demo and get feedback from the community.',
    },

    {
      type: 'wait',
      ms: 700,
    },

    {
      type: 'custom',
      fn: async (page) => {
        await page.selectOption('select[name="priority"]', 'high');
      },
    },

    {
      type: 'wait',
      ms: 900,
    },

    {
      type: 'screenshot',
      options: {
        name: 'showcase-04-form-filled',
      },
    },

    {
      type: 'click',
      selector: '[data-testid="submit-task"]',
    },

    {
      type: 'wait',
      ms: 1500,
    },

    {
      type: 'screenshot',
      options: {
        name: 'showcase-05-task-created',
      },
    },

    {
      type: 'narrate',
      text: 'The task appears instantly. Vertz signals automatically propagate changes through your component tree — no setState, no reducers, no context hell.',
    },

    // Theme switching
    {
      type: 'wait',
      ms: 1000,
    },

    {
      type: 'narrate',
      text: 'Vertz includes CSS-in-JS with theme support. Watch this.',
    },

    {
      type: 'click',
      selector: 'a[href="/settings"]',
    },

    {
      type: 'wait',
      ms: 1200,
    },

    {
      type: 'screenshot',
      options: {
        name: 'showcase-06-settings',
      },
    },

    {
      type: 'wait',
      ms: 600,
    },

    {
      type: 'custom',
      fn: async (page) => {
        await page.selectOption('select[name="theme"]', 'dark');
        await page.waitForTimeout(300);
      },
    },

    {
      type: 'wait',
      ms: 800,
    },

    {
      type: 'screenshot',
      options: {
        name: 'showcase-07-dark-theme',
      },
    },

    {
      type: 'narrate',
      text: 'Theme switching with zero-runtime CSS. Vertz can extract styles at build time — no style injection overhead.',
    },

    {
      type: 'wait',
      ms: 1000,
    },

    {
      type: 'custom',
      fn: async (page) => {
        await page.selectOption('select[name="theme"]', 'light');
        await page.waitForTimeout(300);
      },
    },

    {
      type: 'wait',
      ms: 800,
    },

    // Finale
    {
      type: 'click',
      selector: 'a[href="/"]',
    },

    {
      type: 'wait',
      ms: 1200,
    },

    {
      type: 'screenshot',
      options: {
        name: 'showcase-08-final',
      },
    },

    {
      type: 'wait',
      ms: 600,
    },

    {
      type: 'narrate',
      text: 'Vertz gives you React\'s JSX and developer experience, Solid\'s fine-grained reactivity, and Remix\'s full-stack primitives — all with TypeScript and Vite.',
    },

    {
      type: 'wait',
      ms: 2000,
    },

    {
      type: 'narrate',
      text: 'Zero virtual DOM. Zero runtime overhead. Just pure, compiled, type-safe reactivity.',
    },

    {
      type: 'wait',
      ms: 1800,
    },

    {
      type: 'narrate',
      text: 'Ready to build something fast? Check out Vertz on GitHub.',
    },

    {
      type: 'wait',
      ms: 2000,
    },
  ],
};

export default showcaseDemo;
