/** Envelope metadata for list queries (pagination info without entity data). */
export interface QueryEnvelope {
  total?: number;
  limit?: number;
  nextCursor?: string | null;
  hasNextPage?: boolean;
  [key: string]: unknown;
}

/**
 * Stores list query envelope metadata per query key.
 * Decoupled from entity data — entities live in EntityStore,
 * envelopes live here. Allows list query reconstruction from
 * EntityStore data + envelope metadata.
 */
export class QueryEnvelopeStore {
  private _envelopes = new Map<string, QueryEnvelope>();

  get(queryKey: string): QueryEnvelope | undefined {
    return this._envelopes.get(queryKey);
  }

  set(queryKey: string, envelope: QueryEnvelope): void {
    this._envelopes.set(queryKey, envelope);
  }

  delete(queryKey: string): void {
    this._envelopes.delete(queryKey);
  }

  clear(): void {
    this._envelopes.clear();
  }
}
