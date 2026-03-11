import { describe, expect, it } from 'bun:test';
import { DiagnosticsCollector } from '../diagnostics-collector';

describe('DiagnosticsCollector', () => {
  it('starts with empty state', () => {
    const collector = new DiagnosticsCollector();
    const snapshot = collector.getSnapshot();

    expect(snapshot.status).toBe('ok');
    expect(snapshot.plugin.processedFiles).toEqual([]);
    expect(snapshot.plugin.processedCount).toBe(0);
    expect(snapshot.ssr.moduleStatus).toBe('pending');
    expect(snapshot.ssr.reloadCount).toBe(0);
    expect(snapshot.ssr.failedReloadCount).toBe(0);
    expect(snapshot.ssr.lastReloadError).toBeNull();
    expect(snapshot.hmr.bundledScriptUrl).toBeNull();
    expect(snapshot.hmr.bootstrapDiscovered).toBe(false);
    expect(snapshot.errors.current).toBeNull();
    expect(snapshot.websocket.connectedClients).toBe(0);
    expect(snapshot.watcher.lastChangedFile).toBeNull();
  });

  it('recordPluginProcess() tracks the file', () => {
    const collector = new DiagnosticsCollector();

    collector.recordPluginProcess('src/app.tsx');

    const snapshot = collector.getSnapshot();
    expect(snapshot.plugin.processedFiles).toContain('src/app.tsx');
    expect(snapshot.plugin.processedCount).toBe(1);
  });

  it('recordPluginProcess() deduplicates files', () => {
    const collector = new DiagnosticsCollector();

    collector.recordPluginProcess('src/app.tsx');
    collector.recordPluginProcess('src/app.tsx');
    collector.recordPluginProcess('src/task-card.tsx');

    const snapshot = collector.getSnapshot();
    expect(snapshot.plugin.processedFiles).toHaveLength(2);
    expect(snapshot.plugin.processedCount).toBe(3);
  });

  it('recordSSRReload(true) records successful reload', () => {
    const collector = new DiagnosticsCollector();

    collector.recordSSRReload(true, 45);

    const snapshot = collector.getSnapshot();
    expect(snapshot.ssr.moduleStatus).toBe('loaded');
    expect(snapshot.ssr.lastReloadDurationMs).toBe(45);
    expect(snapshot.ssr.lastReloadError).toBeNull();
    expect(snapshot.ssr.reloadCount).toBe(1);
    expect(snapshot.ssr.failedReloadCount).toBe(0);
    expect(snapshot.ssr.lastReloadTime).toBeDefined();
  });

  it('recordSSRReload(false) records failure', () => {
    const collector = new DiagnosticsCollector();

    collector.recordSSRReload(false, 0, 'Module not found');

    const snapshot = collector.getSnapshot();
    expect(snapshot.ssr.moduleStatus).toBe('error');
    expect(snapshot.ssr.lastReloadError).toBe('Module not found');
    expect(snapshot.ssr.reloadCount).toBe(1);
    expect(snapshot.ssr.failedReloadCount).toBe(1);
  });

  it('recordHMRAssets() updates HMR state', () => {
    const collector = new DiagnosticsCollector();

    collector.recordHMRAssets('/_bun/client/abc123.js', true);

    const snapshot = collector.getSnapshot();
    expect(snapshot.hmr.bundledScriptUrl).toBe('/_bun/client/abc123.js');
    expect(snapshot.hmr.bootstrapDiscovered).toBe(true);
  });

  it('recordError() and recordErrorClear() manage error state', () => {
    const collector = new DiagnosticsCollector();

    collector.recordError('build', 'Cannot find module');

    let snapshot = collector.getSnapshot();
    expect(snapshot.errors.current).toBe('build');
    expect(snapshot.errors.lastCategory).toBe('build');
    expect(snapshot.errors.lastMessage).toBe('Cannot find module');

    collector.recordErrorClear();

    snapshot = collector.getSnapshot();
    expect(snapshot.errors.current).toBeNull();
    expect(snapshot.errors.lastCategory).toBe('build');
    expect(snapshot.errors.lastMessage).toBe('Cannot find module');
  });

  it('recordWebSocketChange() tracks client count', () => {
    const collector = new DiagnosticsCollector();

    collector.recordWebSocketChange(3);

    const snapshot = collector.getSnapshot();
    expect(snapshot.websocket.connectedClients).toBe(3);
  });

  it('recordFileChange() tracks last changed file', () => {
    const collector = new DiagnosticsCollector();

    collector.recordFileChange('src/components/task-card.tsx');

    const snapshot = collector.getSnapshot();
    expect(snapshot.watcher.lastChangedFile).toBe('src/components/task-card.tsx');
    expect(snapshot.watcher.lastChangeTime).toBeDefined();
  });

  it('recordPluginConfig() sets plugin configuration', () => {
    const collector = new DiagnosticsCollector();

    collector.recordPluginConfig('\\.tsx$', true, true);

    const snapshot = collector.getSnapshot();
    expect(snapshot.plugin.filter).toBe('\\.tsx$');
    expect(snapshot.plugin.hmr).toBe(true);
    expect(snapshot.plugin.fastRefresh).toBe(true);
  });

  it('getSnapshot() returns uptime', () => {
    const collector = new DiagnosticsCollector();
    const snapshot = collector.getSnapshot();

    expect(typeof snapshot.uptime).toBe('number');
    expect(snapshot.uptime).toBeGreaterThanOrEqual(0);
  });

  it('starts with empty runtimeErrors', () => {
    const collector = new DiagnosticsCollector();
    const snapshot = collector.getSnapshot();

    expect(snapshot.runtimeErrors).toEqual([]);
  });

  it('recordRuntimeError() adds to ring buffer', () => {
    const collector = new DiagnosticsCollector();

    collector.recordRuntimeError('ReferenceError: foo is not defined', 'src/app.tsx');

    const snapshot = collector.getSnapshot();
    expect(snapshot.runtimeErrors).toHaveLength(1);
    expect(snapshot.runtimeErrors[0].message).toBe('ReferenceError: foo is not defined');
    expect(snapshot.runtimeErrors[0].source).toBe('src/app.tsx');
    expect(snapshot.runtimeErrors[0].timestamp).toBeDefined();
  });

  it('ring buffer caps at 10 entries', () => {
    const collector = new DiagnosticsCollector();

    for (let i = 0; i < 15; i++) {
      collector.recordRuntimeError(`Error ${i}`, null);
    }

    const snapshot = collector.getSnapshot();
    expect(snapshot.runtimeErrors).toHaveLength(10);
    // Oldest entries should be evicted — first entry is Error 5
    expect(snapshot.runtimeErrors[0].message).toBe('Error 5');
    expect(snapshot.runtimeErrors[9].message).toBe('Error 14');
  });

  it('clearRuntimeErrors() empties the buffer', () => {
    const collector = new DiagnosticsCollector();

    collector.recordRuntimeError('Error 1', 'src/a.tsx');
    collector.recordRuntimeError('Error 2', 'src/b.tsx');
    collector.clearRuntimeErrors();

    const snapshot = collector.getSnapshot();
    expect(snapshot.runtimeErrors).toEqual([]);
  });

  it('recordRuntimeError() with null source', () => {
    const collector = new DiagnosticsCollector();

    collector.recordRuntimeError('Unknown error', null);

    const snapshot = collector.getSnapshot();
    expect(snapshot.runtimeErrors[0].source).toBeNull();
  });

  it('starts with empty manifest state', () => {
    const collector = new DiagnosticsCollector();
    const snapshot = collector.getSnapshot();

    expect(snapshot.manifest.fileCount).toBe(0);
    expect(snapshot.manifest.durationMs).toBe(0);
    expect(snapshot.manifest.warnings).toEqual([]);
    expect(snapshot.manifest.hmrUpdateCount).toBe(0);
    expect(snapshot.manifest.lastHmrUpdate).toBeNull();
    expect(snapshot.manifest.lastHmrFile).toBeNull();
    expect(snapshot.manifest.lastHmrChanged).toBeNull();
  });

  it('recordManifestPrepass() tracks manifest generation', () => {
    const collector = new DiagnosticsCollector();

    collector.recordManifestPrepass(42, 78, [
      { type: 'circular-dependency', message: 'a.ts <-> b.ts' },
    ]);

    const snapshot = collector.getSnapshot();
    expect(snapshot.manifest.fileCount).toBe(42);
    expect(snapshot.manifest.durationMs).toBe(78);
    expect(snapshot.manifest.warnings).toHaveLength(1);
    expect(snapshot.manifest.warnings[0].type).toBe('circular-dependency');
  });

  it('recordManifestUpdate() tracks HMR manifest updates', () => {
    const collector = new DiagnosticsCollector();

    collector.recordManifestUpdate('src/hooks/use-tasks.ts', true, 2);

    const snapshot = collector.getSnapshot();
    expect(snapshot.manifest.hmrUpdateCount).toBe(1);
    expect(snapshot.manifest.lastHmrUpdate).toBeDefined();
    expect(snapshot.manifest.lastHmrFile).toBe('src/hooks/use-tasks.ts');
    expect(snapshot.manifest.lastHmrChanged).toBe(true);
  });

  it('recordManifestUpdate() accumulates update count', () => {
    const collector = new DiagnosticsCollector();

    collector.recordManifestUpdate('src/hooks/a.ts', false, 1);
    collector.recordManifestUpdate('src/hooks/b.ts', true, 3);

    const snapshot = collector.getSnapshot();
    expect(snapshot.manifest.hmrUpdateCount).toBe(2);
    expect(snapshot.manifest.lastHmrFile).toBe('src/hooks/b.ts');
    expect(snapshot.manifest.lastHmrChanged).toBe(true);
  });

  it('recordFieldSelection() tracks per-file field selection state', () => {
    const collector = new DiagnosticsCollector();

    collector.recordFieldSelectionManifest(5);
    collector.recordFieldSelection('src/user-list.tsx', {
      queries: [
        {
          queryVar: 'users',
          fields: ['name', 'email'],
          hasOpaqueAccess: false,
          crossFileFields: ['name', 'email'],
          injected: true,
        },
      ],
    });

    const snapshot = collector.getSnapshot();
    expect(snapshot.fieldSelection.manifestFileCount).toBe(5);
    expect(snapshot.fieldSelection.entries['src/user-list.tsx']).toBeDefined();
    expect(snapshot.fieldSelection.entries['src/user-list.tsx'].queries).toHaveLength(1);
    expect(snapshot.fieldSelection.entries['src/user-list.tsx'].queries[0].queryVar).toBe('users');
    expect(snapshot.fieldSelection.entries['src/user-list.tsx'].queries[0].injected).toBe(true);
  });

  it('starts with empty field selection state', () => {
    const collector = new DiagnosticsCollector();
    const snapshot = collector.getSnapshot();

    expect(snapshot.fieldSelection.manifestFileCount).toBe(0);
    expect(snapshot.fieldSelection.entries).toEqual({});
  });

  describe('recordFieldMiss()', () => {
    it('records a field access miss', () => {
      const collector = new DiagnosticsCollector();

      collector.recordFieldMiss('users', 'u1', 'bio', 'GET:/users');

      const snapshot = collector.getSnapshot();
      expect(snapshot.fieldSelection.misses).toHaveLength(1);
      expect(snapshot.fieldSelection.misses[0]).toEqual({
        type: 'users',
        id: 'u1',
        field: 'bio',
        querySource: 'GET:/users',
        timestamp: expect.any(String),
      });
    });

    it('caps at 50 entries', () => {
      const collector = new DiagnosticsCollector();

      for (let i = 0; i < 60; i++) {
        collector.recordFieldMiss('users', `u${i}`, 'bio', 'GET:/users');
      }

      const snapshot = collector.getSnapshot();
      expect(snapshot.fieldSelection.misses).toHaveLength(50);
      expect(snapshot.fieldSelection.misses[0].id).toBe('u10');
    });

    it('starts with empty misses', () => {
      const collector = new DiagnosticsCollector();
      const snapshot = collector.getSnapshot();

      expect(snapshot.fieldSelection.misses).toEqual([]);
    });
  });
});
