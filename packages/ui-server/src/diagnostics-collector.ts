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
    };
  }
}
