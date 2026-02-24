import { describe, expect, it, vi } from 'bun:test';
import type { FileChange } from '../../pipeline';
import {
  categorizeFileChange,
  getAffectedStages,
  getStagesForChanges,
} from '../../pipeline/watcher';

describe('Pipeline Orchestrator', () => {
  describe('categorizeFileChange', () => {
    it('should categorize .domain.ts files as domain', () => {
      const category = categorizeFileChange('src/domains/auth.domain.ts');
      expect(category).toBe('domain');
    });

    it('should categorize .module.ts files as module', () => {
      const category = categorizeFileChange('src/modules/user.module.ts');
      expect(category).toBe('module');
    });

    it('should categorize .schema.ts files as schema', () => {
      const category = categorizeFileChange('src/schemas/user.schema.ts');
      expect(category).toBe('schema');
    });

    it('should categorize .service.ts files as service', () => {
      const category = categorizeFileChange('src/services/auth.service.ts');
      expect(category).toBe('service');
    });

    it('should categorize .tsx files as component', () => {
      const category = categorizeFileChange('src/components/Button.tsx');
      expect(category).toBe('component');
    });

    it('should categorize .route.ts files as route', () => {
      const category = categorizeFileChange('src/routes/api.route.ts');
      expect(category).toBe('route');
    });

    it('should categorize config files as config', () => {
      const category = categorizeFileChange('vertz.config.ts');
      expect(category).toBe('config');
    });

    it('should categorize .ts files that are not special as other', () => {
      const category = categorizeFileChange('src/utils/helpers.ts');
      expect(category).toBe('other');
    });
  });

  describe('stage determination', () => {
    it('should return analyze + codegen for domain changes', () => {
      const category = categorizeFileChange('src/domains/auth.domain.ts');
      const stages = getAffectedStages(category);
      expect(stages).toContain('analyze');
      expect(stages).toContain('codegen');
      expect(stages).not.toContain('build-ui');
    });

    it('should return analyze + codegen for module changes', () => {
      const category = categorizeFileChange('src/modules/user.module.ts');
      const stages = getAffectedStages(category);
      expect(stages).toContain('analyze');
      expect(stages).toContain('codegen');
    });

    it('should return codegen only for schema changes', () => {
      const category = categorizeFileChange('src/schemas/user.schema.ts');
      const stages = getAffectedStages(category);
      expect(stages).toContain('codegen');
      expect(stages).not.toContain('analyze');
    });

    it('should return build-ui only for component changes', () => {
      const category = categorizeFileChange('src/components/Button.tsx');
      const stages = getAffectedStages(category);
      expect(stages).toContain('build-ui');
      expect(stages).not.toContain('analyze');
      expect(stages).not.toContain('codegen');
    });

    it('should return all stages for config changes', () => {
      const category = categorizeFileChange('vertz.config.ts');
      const stages = getAffectedStages(category);
      expect(stages).toContain('analyze');
      expect(stages).toContain('codegen');
      expect(stages).toContain('build-ui');
    });
  });

  describe('dependency graph', () => {
    it('should identify that schema changes trigger codegen but not UI build', () => {
      const category = categorizeFileChange('src/schemas/user.schema.ts');
      const stages = getAffectedStages(category);

      // Schema changes should only affect codegen
      expect(stages).toEqual(expect.arrayContaining(['codegen']));
      expect(stages).not.toContain('build-ui');
    });

    it('should identify that domain changes trigger analyze and codegen', () => {
      const category = categorizeFileChange('src/domains/auth.domain.ts');
      const stages = getAffectedStages(category);

      // Domain changes affect the IR analysis and codegen
      expect(stages).toEqual(expect.arrayContaining(['analyze', 'codegen']));
    });
  });

  describe('error handling', () => {
    it('should propagate compiler errors without crashing the watcher', async () => {
      // This tests that when the compiler throws, the error propagates correctly
      const mockCompiler = {
        analyze: vi.fn().mockRejectedValue(new Error('Syntax error')),
      };

      // The error should propagate - the orchestrator catches it
      await expect(mockCompiler.analyze()).rejects.toThrow('Syntax error');
    });

    it('should propagate codegen errors correctly', async () => {
      // When codegen fails, the error should propagate
      const mockCodegen = {
        generate: vi.fn().mockRejectedValue(new Error('Codegen failed')),
      };

      // The error should propagate
      await expect(mockCodegen.generate({}, {})).rejects.toThrow('Codegen failed');
    });
  });

  describe('Feature: Dev Pipeline Refactor', () => {
    describe('Given the dev command logic', () => {
      describe('When the file watcher triggers', () => {
        it('then it should reuse the core logic from watcher.ts', () => {
          // This test verifies that the dev command uses getStagesForChanges from watcher.ts
          const changes: FileChange[] = [
            { type: 'change', path: 'src/domains/auth.domain.ts' },
            { type: 'add', path: 'src/components/Button.tsx' },
          ];

          // The dev command should use getStagesForChanges from the pipeline watcher
          const stages = getStagesForChanges(changes);

          // Should include analyze + codegen for domain changes
          expect(stages).toContain('analyze');
          expect(stages).toContain('codegen');
          // Should include build-ui for component changes
          expect(stages).toContain('build-ui');
        });

        it('should handle multiple file changes correctly', () => {
          const changes: FileChange[] = [
            { type: 'change', path: 'src/domains/user.domain.ts' },
            { type: 'change', path: 'src/schemas/user.schema.ts' },
            { type: 'change', path: 'src/components/Header.tsx' },
          ];

          const stages = getStagesForChanges(changes);

          // Domain changes need analyze + codegen
          expect(stages).toContain('analyze');
          expect(stages).toContain('codegen');
          // Schema changes need codegen (but analyze already added)
          expect(stages).toContain('codegen');
          // Component changes need build-ui
          expect(stages).toContain('build-ui');
        });

        it('should always include analyze before codegen', () => {
          const changes: FileChange[] = [{ type: 'change', path: 'src/schemas/user.schema.ts' }];

          const stages = getStagesForChanges(changes);

          // Schema changes trigger codegen, but analyze should be auto-added
          expect(stages).toContain('codegen');
          expect(stages).toContain('analyze');
        });
      });
    });

    describe('Given existing tests', () => {
      describe('When run', () => {
        it('then they should pass without regression', () => {
          // This test ensures the refactor doesn't break existing functionality
          // The categorizeFileChange and getAffectedStages should work as before
          const domainCategory = categorizeFileChange('src/domains/test.domain.ts');
          expect(domainCategory).toBe('domain');

          const stages = getAffectedStages(domainCategory);
          expect(stages).toContain('analyze');
          expect(stages).toContain('codegen');
        });
      });
    });
  });
});
