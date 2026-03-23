/**
 * AOT SSR Diagnostics
 *
 * Tracks AOT compilation results and provides a JSON snapshot
 * for the `/__vertz_ssr_aot` dev endpoint.
 */

/** AOT tier classification (mirrored from @vertz/ui-compiler to avoid cross-package dependency). */
export type AotTier = 'static' | 'data-driven' | 'conditional' | 'runtime-fallback';

/** Per-component diagnostic entry in the snapshot. */
export interface AotComponentDiagnostic {
  tier: AotTier;
  holes: string[];
}

/** A recorded divergence between AOT and DOM shim output. */
export interface AotDivergenceEntry {
  component: string;
  aotHtml: string;
  domHtml: string;
  timestamp: string;
}

/** JSON snapshot returned by the `/__vertz_ssr_aot` endpoint. */
export interface AotDiagnosticsSnapshot {
  components: Record<string, AotComponentDiagnostic>;
  coverage: {
    total: number;
    aot: number;
    runtime: number;
    percentage: number;
  };
  divergences: AotDivergenceEntry[];
}

/** Input shape matching AotComponentInfo from @vertz/ui-compiler. */
interface ComponentInput {
  name: string;
  tier: AotTier;
  holes: string[];
}

const MAX_DIVERGENCES = 20;

/**
 * Collects AOT compilation diagnostics and produces JSON snapshots.
 *
 * Used by the dev server to power the `/__vertz_ssr_aot` endpoint
 * and by the build pipeline for classification logging.
 */
export class AotDiagnostics {
  private _components = new Map<string, AotComponentDiagnostic>();
  private _divergences: AotDivergenceEntry[] = [];

  /**
   * Record components from an AOT compilation result.
   * Called once per file during compilation or hot rebuild.
   */
  recordCompilation(components: ComponentInput[]): void {
    for (const comp of components) {
      this._components.set(comp.name, {
        tier: comp.tier,
        holes: comp.holes,
      });
    }
  }

  /** Record a divergence between AOT and DOM shim HTML output. */
  recordDivergence(component: string, aotHtml: string, domHtml: string): void {
    this._divergences.push({
      component,
      aotHtml,
      domHtml,
      timestamp: new Date().toISOString(),
    });
    if (this._divergences.length > MAX_DIVERGENCES) {
      this._divergences = this._divergences.slice(this._divergences.length - MAX_DIVERGENCES);
    }
  }

  /** Clear all recorded data (used during hot rebuild). */
  clear(): void {
    this._components.clear();
    this._divergences = [];
  }

  /**
   * Generate per-component classification log lines.
   * Used by the build pipeline and VERTZ_DEBUG=aot logging.
   *
   * Returns lines like:
   * - "Header: static"
   * - "Dashboard: conditional, 1 hole (SidePanel)"
   * - "Coverage: 3/4 components (75%)"
   */
  getClassificationLog(): string[] {
    const lines: string[] = [];

    for (const [name, comp] of this._components) {
      let line = `${name}: ${comp.tier}`;
      if (comp.holes.length > 0) {
        line += `, ${comp.holes.length} hole${comp.holes.length > 1 ? 's' : ''} (${comp.holes.join(', ')})`;
      }
      lines.push(line);
    }

    const snapshot = this.getSnapshot();
    const { total, aot, percentage } = snapshot.coverage;
    if (total > 0) {
      lines.push(`Coverage: ${aot}/${total} components (${percentage}%)`);
    }

    return lines;
  }

  /** Produce a JSON-serializable snapshot for the diagnostic endpoint. */
  getSnapshot(): AotDiagnosticsSnapshot {
    let aot = 0;
    let runtime = 0;

    for (const comp of this._components.values()) {
      if (comp.tier === 'runtime-fallback') {
        runtime++;
      } else {
        aot++;
      }
    }

    const total = aot + runtime;

    return {
      components: Object.fromEntries(this._components),
      coverage: {
        total,
        aot,
        runtime,
        percentage: total === 0 ? 0 : Math.round((aot / total) * 100),
      },
      divergences: [...this._divergences],
    };
  }
}
