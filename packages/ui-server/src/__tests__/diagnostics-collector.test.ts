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
});
