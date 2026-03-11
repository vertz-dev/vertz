import type { ErrorCategory } from './bun-dev-server';

export interface RuntimeErrorEntry {
  message: string;
  source: string | null;
  timestamp: string;
}

export interface DiagnosticsSnapshot {
  status: 'ok';
  uptime: number;
  plugin: {
    filter: string;
    hmr: boolean;
    fastRefresh: boolean;
    processedFiles: string[];
    processedCount: number;
  };
  ssr: {
    moduleStatus: 'pending' | 'loaded' | 'error';
    lastReloadTime: string | null;
    lastReloadDurationMs: number | null;
    lastReloadError: string | null;
    reloadCount: number;
    failedReloadCount: number;
  };
  hmr: {
    bundledScriptUrl: string | null;
    bootstrapDiscovered: boolean;
  };
  manifest: {
    fileCount: number;
    durationMs: number;
    warnings: { type: string; message: string }[];
    hmrUpdateCount: number;
    lastHmrUpdate: string | null;
    lastHmrFile: string | null;
    lastHmrChanged: boolean | null;
  };
  errors: {
    current: ErrorCategory | null;
    lastCategory: ErrorCategory | null;
    lastMessage: string | null;
  };
  websocket: {
    connectedClients: number;
  };
  watcher: {
    lastChangedFile: string | null;
    lastChangeTime: string | null;
  };
  runtimeErrors: RuntimeErrorEntry[];
  fieldSelection: {
    manifestFileCount: number;
    entries: Record<string, FieldSelectionDiagEntry>;
    misses: FieldMissEntry[];
  };
}

export interface FieldMissEntry {
  type: string;
  id: string;
  field: string;
  querySource: string;
  timestamp: string;
}

export interface FieldSelectionDiagEntry {
  queries: {
    queryVar: string;
    fields: string[];
    hasOpaqueAccess: boolean;
    crossFileFields: string[];
    injected: boolean;
  }[];
}

export class DiagnosticsCollector {
  private startTime = Date.now();

  // Plugin state
  private pluginFilter = '';
  private pluginHmr = false;
  private pluginFastRefresh = false;
  private processedFilesSet = new Set<string>();
  private processedCount = 0;

  // SSR state
  private ssrModuleStatus: 'pending' | 'loaded' | 'error' = 'pending';
  private ssrLastReloadTime: string | null = null;
  private ssrLastReloadDurationMs: number | null = null;
  private ssrLastReloadError: string | null = null;
  private ssrReloadCount = 0;
  private ssrFailedReloadCount = 0;

  // HMR state
  private hmrBundledScriptUrl: string | null = null;
  private hmrBootstrapDiscovered = false;

  // Manifest state
  private manifestFileCount = 0;
  private manifestDurationMs = 0;
  private manifestWarnings: { type: string; message: string }[] = [];
  private manifestHmrUpdateCount = 0;
  private manifestLastHmrUpdate: string | null = null;
  private manifestLastHmrFile: string | null = null;
  private manifestLastHmrChanged: boolean | null = null;

  // Error state
  private errorCurrent: ErrorCategory | null = null;
  private errorLastCategory: ErrorCategory | null = null;
  private errorLastMessage: string | null = null;

  // WebSocket state
  private wsConnectedClients = 0;

  // Watcher state
  private watcherLastChangedFile: string | null = null;
  private watcherLastChangeTime: string | null = null;

  // Runtime errors ring buffer
  private static readonly MAX_RUNTIME_ERRORS = 10;
  private runtimeErrorsBuffer: RuntimeErrorEntry[] = [];

  // Field selection state
  private fieldSelectionManifestFileCount = 0;
  private fieldSelectionEntries = new Map<string, FieldSelectionDiagEntry>();
  private static readonly MAX_FIELD_MISSES = 50;
  private fieldMissesBuffer: FieldMissEntry[] = [];

  recordPluginConfig(filter: string, hmr: boolean, fastRefresh: boolean): void {
    this.pluginFilter = filter;
    this.pluginHmr = hmr;
    this.pluginFastRefresh = fastRefresh;
  }

  recordPluginProcess(file: string): void {
    this.processedFilesSet.add(file);
    this.processedCount++;
  }

  recordSSRReload(success: boolean, durationMs: number, error?: string): void {
    this.ssrReloadCount++;
    this.ssrLastReloadTime = new Date().toISOString();
    this.ssrLastReloadDurationMs = durationMs;
    if (success) {
      this.ssrModuleStatus = 'loaded';
      this.ssrLastReloadError = null;
    } else {
      this.ssrModuleStatus = 'error';
      this.ssrLastReloadError = error ?? null;
      this.ssrFailedReloadCount++;
    }
  }

  recordManifestPrepass(
    fileCount: number,
    durationMs: number,
    warnings: { type: string; message: string }[],
  ): void {
    this.manifestFileCount = fileCount;
    this.manifestDurationMs = durationMs;
    this.manifestWarnings = warnings;
  }

  recordManifestUpdate(file: string, changed: boolean, _durationMs: number): void {
    this.manifestHmrUpdateCount++;
    this.manifestLastHmrUpdate = new Date().toISOString();
    this.manifestLastHmrFile = file;
    this.manifestLastHmrChanged = changed;
  }

  recordHMRAssets(bundledScriptUrl: string | null, bootstrapDiscovered: boolean): void {
    this.hmrBundledScriptUrl = bundledScriptUrl;
    this.hmrBootstrapDiscovered = bootstrapDiscovered;
  }

  recordError(category: ErrorCategory, message: string): void {
    this.errorCurrent = category;
    this.errorLastCategory = category;
    this.errorLastMessage = message;
  }

  recordErrorClear(): void {
    this.errorCurrent = null;
  }

  recordWebSocketChange(count: number): void {
    this.wsConnectedClients = count;
  }

  recordFileChange(file: string): void {
    this.watcherLastChangedFile = file;
    this.watcherLastChangeTime = new Date().toISOString();
  }

  recordRuntimeError(message: string, source: string | null): void {
    this.runtimeErrorsBuffer.push({
      message,
      source,
      timestamp: new Date().toISOString(),
    });
    if (this.runtimeErrorsBuffer.length > DiagnosticsCollector.MAX_RUNTIME_ERRORS) {
      this.runtimeErrorsBuffer = this.runtimeErrorsBuffer.slice(
        this.runtimeErrorsBuffer.length - DiagnosticsCollector.MAX_RUNTIME_ERRORS,
      );
    }
  }

  clearRuntimeErrors(): void {
    this.runtimeErrorsBuffer = [];
  }

  recordFieldSelectionManifest(fileCount: number): void {
    this.fieldSelectionManifestFileCount = fileCount;
  }

  recordFieldSelection(file: string, entry: FieldSelectionDiagEntry): void {
    this.fieldSelectionEntries.set(file, entry);
  }

  recordFieldMiss(type: string, id: string, field: string, querySource: string): void {
    this.fieldMissesBuffer.push({
      type,
      id,
      field,
      querySource,
      timestamp: new Date().toISOString(),
    });
    if (this.fieldMissesBuffer.length > DiagnosticsCollector.MAX_FIELD_MISSES) {
      this.fieldMissesBuffer = this.fieldMissesBuffer.slice(
        this.fieldMissesBuffer.length - DiagnosticsCollector.MAX_FIELD_MISSES,
      );
    }
  }

  getSnapshot(): DiagnosticsSnapshot {
    return {
      status: 'ok',
      uptime: (Date.now() - this.startTime) / 1000,
      plugin: {
        filter: this.pluginFilter,
        hmr: this.pluginHmr,
        fastRefresh: this.pluginFastRefresh,
        processedFiles: Array.from(this.processedFilesSet),
        processedCount: this.processedCount,
      },
      ssr: {
        moduleStatus: this.ssrModuleStatus,
        lastReloadTime: this.ssrLastReloadTime,
        lastReloadDurationMs: this.ssrLastReloadDurationMs,
        lastReloadError: this.ssrLastReloadError,
        reloadCount: this.ssrReloadCount,
        failedReloadCount: this.ssrFailedReloadCount,
      },
      hmr: {
        bundledScriptUrl: this.hmrBundledScriptUrl,
        bootstrapDiscovered: this.hmrBootstrapDiscovered,
      },
      manifest: {
        fileCount: this.manifestFileCount,
        durationMs: this.manifestDurationMs,
        warnings: [...this.manifestWarnings],
        hmrUpdateCount: this.manifestHmrUpdateCount,
        lastHmrUpdate: this.manifestLastHmrUpdate,
        lastHmrFile: this.manifestLastHmrFile,
        lastHmrChanged: this.manifestLastHmrChanged,
      },
      errors: {
        current: this.errorCurrent,
        lastCategory: this.errorLastCategory,
        lastMessage: this.errorLastMessage,
      },
      websocket: {
        connectedClients: this.wsConnectedClients,
      },
      watcher: {
        lastChangedFile: this.watcherLastChangedFile,
        lastChangeTime: this.watcherLastChangeTime,
      },
      runtimeErrors: [...this.runtimeErrorsBuffer],
      fieldSelection: {
        manifestFileCount: this.fieldSelectionManifestFileCount,
        entries: Object.fromEntries(this.fieldSelectionEntries),
        misses: [...this.fieldMissesBuffer],
      },
    };
  }
}
