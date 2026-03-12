/**
 * Type-level tests for image optimizer config.
 * Checked by `tsc --noEmit`, not by runtime tests.
 */

import { imageOptimizer } from '../src/image-optimizer.js';

// ─── Valid usage ─────────────────────────────────────────────

// Minimal config
imageOptimizer({ allowedDomains: ['cdn.example.com'] });

// Full config
imageOptimizer({
  allowedDomains: ['cdn.example.com', 'uploads.example.com'],
  maxWidth: 3840,
  maxHeight: 2160,
  defaultQuality: 80,
  cacheTtl: 86400,
  fetchTimeout: 5000,
});

// ─── Invalid usage ───────────────────────────────────────────

// @ts-expect-error — allowedDomains must be string[], not string
imageOptimizer({ allowedDomains: 'cdn.example.com' });

// @ts-expect-error — maxWidth must be number
imageOptimizer({ allowedDomains: ['cdn.example.com'], maxWidth: '3840' });

// @ts-expect-error — missing required allowedDomains
imageOptimizer({});
