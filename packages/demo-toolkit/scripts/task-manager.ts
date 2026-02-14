/**
 * Task Manager Demo Script
 * 
 * Demonstrates the task-manager app:
 * - Load page with task list
 * - Filter tasks by status
 * - Create a new task
 * - Navigate to settings
 */

import type { DemoScript } from '../src/types.js';

export const taskManagerDemo: DemoScript = {
  id: 'task-manager-walkthrough',
  name: 'Task Manager Walkthrough',
  description: 'Full CRUD demo: filtering, creating tasks, and navigating the UI',
  startUrl: 'http://localhost:5173',
  outputPath: 'task-manager-walkthrough.webm',
  defaultDelay: {
    base: 800,
    variance: 0.3,
  },
  actions: [
    // Wait for initial load
    {
      type: 'wait',
      ms: 2000,
      description: 'Wait for app to load',
    },
    
    // Take initial screenshot
    {
      type: 'screenshot',
      options: {
        name: 'task-manager-01-initial',
        annotation: 'Task Manager - Initial View',
      },
    },

    // Click on "In Progress" filter
    {
      type: 'click',
      selector: '[data-testid="filter-in-progress"]',
      description: 'Filter by In Progress tasks',
    },

    {
      type: 'wait',
      ms: 800,
    },

    {
      type: 'screenshot',
      options: {
        name: 'task-manager-02-filtered',
        annotation: 'Filtered to In Progress tasks',
      },
    },

    // Reset to "All" filter
    {
      type: 'click',
      selector: '[data-testid="filter-all"]',
      description: 'Show all tasks',
    },

    {
      type: 'wait',
      ms: 600,
    },

    // Click "New Task" button to navigate to create page
    {
      type: 'click',
      selector: '[data-testid="create-task-btn"]',
      description: 'Navigate to Create Task page',
    },

    {
      type: 'wait',
      ms: 1000,
    },

    {
      type: 'screenshot',
      options: {
        name: 'task-manager-03-create-form',
        annotation: 'Create Task form',
      },
    },

    // Type task title
    {
      type: 'type',
      selector: 'input[name="title"]',
      text: 'Build demo recording system',
      description: 'Enter task title',
    },

    {
      type: 'wait',
      ms: 600,
    },

    // Type task description
    {
      type: 'type',
      selector: 'textarea[name="description"]',
      text: 'Create an automated demo recorder using Playwright to showcase the framework.',
      description: 'Enter task description',
    },

    {
      type: 'wait',
      ms: 600,
    },

    // Select priority
    {
      type: 'click',
      selector: 'select[name="priority"]',
      description: 'Open priority dropdown',
    },

    {
      type: 'custom',
      fn: async (page) => {
        await page.selectOption('select[name="priority"]', 'high');
      },
      description: 'Select High priority',
    },

    {
      type: 'wait',
      ms: 800,
    },

    // Submit the form
    {
      type: 'click',
      selector: '[data-testid="submit-task"]',
      description: 'Submit task',
    },

    {
      type: 'wait',
      ms: 1500,
    },

    {
      type: 'screenshot',
      options: {
        name: 'task-manager-04-task-created',
        annotation: 'New task created and visible in list',
      },
    },

    // Navigate to settings via sidebar
    {
      type: 'click',
      selector: 'a[href="/settings"]',
      description: 'Navigate to Settings',
    },

    {
      type: 'wait',
      ms: 1000,
    },

    {
      type: 'screenshot',
      options: {
        name: 'task-manager-05-settings',
        annotation: 'Settings page',
      },
    },

    // Final wait to ensure everything is captured
    {
      type: 'wait',
      ms: 1500,
      description: 'Final pause for video',
    },
  ],
};
