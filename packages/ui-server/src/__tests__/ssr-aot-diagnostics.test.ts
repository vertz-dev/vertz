/**
 * AOT SSR Diagnostics Tests
 *
 * Tests for the diagnostic collection and snapshot system that
 * powers the /__vertz_ssr_aot dev endpoint.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import { AotDiagnostics } from '../ssr-aot-diagnostics';
import { isAotDebugEnabled } from '../ssr-aot-pipeline';

describe('Feature: AOT SSR Diagnostics', () => {
  describe('Given no components have been recorded', () => {
    describe('When getSnapshot() is called', () => {
      it('Then returns empty components and zero coverage', () => {
        const diag = new AotDiagnostics();
        const snapshot = diag.getSnapshot();

        expect(snapshot.components).toEqual({});
        expect(snapshot.coverage).toEqual({
          total: 0,
          aot: 0,
          runtime: 0,
          percentage: 0,
        });
      });
    });
  });

  describe('Given components from a single file compilation', () => {
    describe('When recordCompilation() is called with component results', () => {
      it('Then snapshot includes all components with their tiers', () => {
        const diag = new AotDiagnostics();
        diag.recordCompilation([
          { name: 'Header', tier: 'static', holes: [] },
          { name: 'UserCard', tier: 'data-driven', holes: [] },
          { name: 'Dashboard', tier: 'conditional', holes: ['SidePanel'] },
        ]);

        const snapshot = diag.getSnapshot();

        expect(snapshot.components.Header).toEqual({ tier: 'static', holes: [] });
        expect(snapshot.components.UserCard).toEqual({ tier: 'data-driven', holes: [] });
        expect(snapshot.components.Dashboard).toEqual({
          tier: 'conditional',
          holes: ['SidePanel'],
        });
      });

      it('Then coverage counts are correct', () => {
        const diag = new AotDiagnostics();
        diag.recordCompilation([
          { name: 'Header', tier: 'static', holes: [] },
          { name: 'UserCard', tier: 'data-driven', holes: [] },
          { name: 'Dashboard', tier: 'conditional', holes: [] },
        ]);

        const snapshot = diag.getSnapshot();

        expect(snapshot.coverage.total).toBe(3);
        expect(snapshot.coverage.aot).toBe(3);
        expect(snapshot.coverage.runtime).toBe(0);
        expect(snapshot.coverage.percentage).toBe(100);
      });
    });
  });

  describe('Given components with runtime-fallback tier', () => {
    describe('When coverage is calculated', () => {
      it('Then runtime-fallback components are counted as runtime', () => {
        const diag = new AotDiagnostics();
        diag.recordCompilation([
          { name: 'Header', tier: 'static', holes: [] },
          { name: 'AuthPanel', tier: 'runtime-fallback', holes: [] },
          { name: 'Widget', tier: 'runtime-fallback', holes: [] },
          { name: 'Footer', tier: 'data-driven', holes: [] },
        ]);

        const snapshot = diag.getSnapshot();

        expect(snapshot.coverage.total).toBe(4);
        expect(snapshot.coverage.aot).toBe(2);
        expect(snapshot.coverage.runtime).toBe(2);
        expect(snapshot.coverage.percentage).toBe(50);
      });
    });
  });

  describe('Given multiple compilations (multiple files)', () => {
    describe('When recordCompilation() is called multiple times', () => {
      it('Then components accumulate across calls', () => {
        const diag = new AotDiagnostics();
        diag.recordCompilation([{ name: 'Header', tier: 'static', holes: [] }]);
        diag.recordCompilation([{ name: 'Footer', tier: 'static', holes: [] }]);

        const snapshot = diag.getSnapshot();

        expect(Object.keys(snapshot.components)).toHaveLength(2);
        expect(snapshot.components.Header).toBeDefined();
        expect(snapshot.components.Footer).toBeDefined();
        expect(snapshot.coverage.total).toBe(2);
      });
    });
  });

  describe('Given a recompilation (hot rebuild)', () => {
    describe('When clear() is called followed by new recordCompilation()', () => {
      it('Then old components are replaced', () => {
        const diag = new AotDiagnostics();
        diag.recordCompilation([
          { name: 'Header', tier: 'static', holes: [] },
          { name: 'OldComponent', tier: 'data-driven', holes: [] },
        ]);
        diag.clear();
        diag.recordCompilation([{ name: 'Header', tier: 'data-driven', holes: [] }]);

        const snapshot = diag.getSnapshot();

        expect(Object.keys(snapshot.components)).toHaveLength(1);
        expect(snapshot.components.Header).toEqual({ tier: 'data-driven', holes: [] });
        expect(snapshot.components.OldComponent).toBeUndefined();
      });
    });
  });

  describe('Given a divergence is recorded', () => {
    describe('When getSnapshot() is called', () => {
      it('Then divergences are included in the snapshot', () => {
        const diag = new AotDiagnostics();
        diag.recordDivergence('UserCard', '<div>aot</div>', '<div>dom</div>');

        const snapshot = diag.getSnapshot();

        expect(snapshot.divergences).toHaveLength(1);
        expect(snapshot.divergences[0]?.component).toBe('UserCard');
        expect(snapshot.divergences[0]?.aotHtml).toBe('<div>aot</div>');
        expect(snapshot.divergences[0]?.domHtml).toBe('<div>dom</div>');
        expect(snapshot.divergences[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });
    });
  });

  describe('Given divergences exceed max buffer size', () => {
    describe('When many divergences are recorded', () => {
      it('Then only the most recent are kept', () => {
        const diag = new AotDiagnostics();
        for (let i = 0; i < 25; i++) {
          diag.recordDivergence(`Component${i}`, `<aot${i}>`, `<dom${i}>`);
        }

        const snapshot = diag.getSnapshot();

        // Should keep exactly the last 20
        expect(snapshot.divergences).toHaveLength(20);
        // Oldest surviving entry is Component5 (0-4 were evicted)
        expect(snapshot.divergences[0]?.component).toBe('Component5');
        // Most recent entry
        expect(snapshot.divergences[snapshot.divergences.length - 1]?.component).toBe(
          'Component24',
        );
      });
    });
  });
});

describe('Feature: AOT classification logging', () => {
  describe('Given components have been recorded', () => {
    describe('When getClassificationLog() is called', () => {
      it('Then returns per-component lines and a coverage summary', () => {
        const diag = new AotDiagnostics();
        diag.recordCompilation([
          { name: 'Header', tier: 'static', holes: [] },
          { name: 'Dashboard', tier: 'conditional', holes: ['SidePanel'] },
          { name: 'AuthWidget', tier: 'runtime-fallback', holes: [] },
        ]);

        const lines = diag.getClassificationLog();

        expect(lines).toContain('Header: static');
        expect(lines).toContain('Dashboard: conditional, 1 hole (SidePanel)');
        expect(lines).toContain('AuthWidget: runtime-fallback');
        expect(lines).toContain('Coverage: 2/3 components (67%)');
      });
    });
  });

  describe('Given a component with multiple holes', () => {
    describe('When getClassificationLog() is called', () => {
      it('Then lists all hole names', () => {
        const diag = new AotDiagnostics();
        diag.recordCompilation([
          { name: 'Page', tier: 'conditional', holes: ['AuthBar', 'ChatWidget'] },
        ]);

        const lines = diag.getClassificationLog();

        expect(lines).toContain('Page: conditional, 2 holes (AuthBar, ChatWidget)');
      });
    });
  });

  describe('Given no components have been recorded', () => {
    describe('When getClassificationLog() is called', () => {
      it('Then returns an empty array', () => {
        const diag = new AotDiagnostics();
        const lines = diag.getClassificationLog();
        expect(lines).toEqual([]);
      });
    });
  });
});

describe('Feature: isAotDebugEnabled()', () => {
  const originalDebug = process.env.VERTZ_DEBUG;

  afterEach(() => {
    if (originalDebug !== undefined) {
      process.env.VERTZ_DEBUG = originalDebug;
    } else {
      delete process.env.VERTZ_DEBUG;
    }
  });

  describe('Given VERTZ_DEBUG is not set', () => {
    it('Then returns false', () => {
      delete process.env.VERTZ_DEBUG;
      expect(isAotDebugEnabled()).toBe(false);
    });
  });

  describe('Given VERTZ_DEBUG is "1" (all categories)', () => {
    it('Then returns true', () => {
      process.env.VERTZ_DEBUG = '1';
      expect(isAotDebugEnabled()).toBe(true);
    });
  });

  describe('Given VERTZ_DEBUG is "aot"', () => {
    it('Then returns true', () => {
      process.env.VERTZ_DEBUG = 'aot';
      expect(isAotDebugEnabled()).toBe(true);
    });
  });

  describe('Given VERTZ_DEBUG is "plugin,aot"', () => {
    it('Then returns true', () => {
      process.env.VERTZ_DEBUG = 'plugin,aot';
      expect(isAotDebugEnabled()).toBe(true);
    });
  });

  describe('Given VERTZ_DEBUG is "plugin,ssr"', () => {
    it('Then returns false', () => {
      process.env.VERTZ_DEBUG = 'plugin,ssr';
      expect(isAotDebugEnabled()).toBe(false);
    });
  });
});
