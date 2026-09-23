import { UnleashApi, concurrentMap } from './api';
import type { Flag } from './model';

export interface CachedFlag { flag: Flag; fetchedAt: number; detailed: boolean; error?: string }
export class FlagCache {
  entries = new Map<string, CachedFlag>();
  catalogError?: string;
  revision = 0;
  private pending?: Promise<void>;
  private abort = new AbortController();
  private disposed = false;
  private detailPending = new Map<string, Promise<void>>();
  private lastAttempt = new Map<string, number>();
  private slots = 0;
  private waiters: (() => void)[] = [];
  constructor(private api: UnleashApi, private changed: () => void) {}
  refresh(visible: () => Set<string>): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.refreshNow(visible).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async refreshNow(visible: () => Set<string>): Promise<void> {
    try {
      const flags = await this.api.catalog(this.abort.signal);
      if (this.disposed) return;
      const next = new Map<string, CachedFlag>();
      for (const flag of flags) {
        const old = this.entries.get(flag.name);
        // Catalog responses omit strategies. Preserve a detail only until revalidated.
        next.set(flag.name, old?.detailed && old.flag.project === flag.project
          ? { ...old, flag: { ...old.flag, stale: flag.stale, description: flag.description } }
          : { flag, detailed: false, fetchedAt: Date.now() });
      }
      this.entries = next;
      this.catalogError = undefined;
      this.revision++;
      this.changed();
      await concurrentMap([...visible()], name => this.detail(name, true));
    } catch (e) {
      if (this.disposed) return;
      this.catalogError = e instanceof Error ? e.message : 'Could not refresh flags.';
      this.changed();
    }
  }
  detail(name: string, force = false): Promise<void> {
    const pending = this.detailPending.get(name);
    if (pending) return pending;
    const entry = this.entries.get(name);
    if (!entry || (!force && Date.now() - (this.lastAttempt.get(name) ?? 0) < 10000)) return Promise.resolve();
    this.lastAttempt.set(name, Date.now());
    const request = this.loadDetail(name, entry).finally(() => this.detailPending.delete(name));
    this.detailPending.set(name, request);
    return request;
  }
  private async loadDetail(name: string, entry: CachedFlag): Promise<void> {
    if (this.slots >= 4) await new Promise<void>(resolve => this.waiters.push(resolve));
    else this.slots++;
    try {
      if (this.disposed) return;
      const flag = await this.api.detail(entry.flag, this.abort.signal);
      if (!this.disposed && this.entries.get(name)?.flag.project === entry.flag.project && flag.name === name) this.entries.set(name, { flag, fetchedAt: Date.now(), detailed: true });
    } catch (e) {
      if (!this.disposed && this.entries.get(name)?.flag.project === entry.flag.project) this.entries.set(name, { ...entry, error: e instanceof Error ? e.message : 'Could not load flag.' });
    } finally {
      const next = this.waiters.shift();
      if (next) next(); else this.slots--;
    }
    if (!this.disposed) this.changed();
  }
  dispose(): void { this.disposed = true; this.abort.abort(); }
}
