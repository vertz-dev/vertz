import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        include: ['tests/tree-shaking/*.test.ts'],
        testTimeout: 30_000,
    },
});
//# sourceMappingURL=vitest.config.js.map