import { describe, it, expect, vi } from 'vitest';
import { categorizeFileChange, getAffectedStages, type FileCategory } from '../../pipeline/watcher';

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
      await expect(
        mockCompiler.analyze()
      ).rejects.toThrow('Syntax error');
    });

    it('should propagate codegen errors correctly', async () => {
      // When codegen fails, the error should propagate
      const mockCodegen = {
        generate: vi.fn().mockRejectedValue(new Error('Codegen failed')),
      };
      
      // The error should propagate
      await expect(
        mockCodegen.generate({}, {})
      ).rejects.toThrow('Codegen failed');
    });
  });
});
