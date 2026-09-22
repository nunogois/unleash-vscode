import type { Flag } from './model';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export function normalizeUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a valid Unleash instance URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) instance URL without credentials, query, or fragment.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Use HTTPS for remote instances; HTTP is supported for localhost only.');
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/api(?:\/admin)?$/, '').replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}
export function flagUrl(base: string, flag: Pick<Flag, 'project' | 'name'>): string {
  return `${base}/projects/${encodeURIComponent(flag.project)}/features/${encodeURIComponent(flag.name)}`;
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function parseFlag(value: unknown, project: string): Flag {
  if (!object(value) || typeof value.name !== 'string' || !Array.isArray(value.environments)) throw new Error('Unleash returned an unsupported flag response.');
  for (const env of value.environments) {
    if (!object(env) || typeof env.name !== 'string' || typeof env.enabled !== 'boolean') throw new Error('Unleash returned incomplete environment data.');
    if (env.strategies !== undefined && (!Array.isArray(env.strategies) || env.strategies.some(s => !object(s) || typeof s.name !== 'string'))) throw new Error('Unleash returned invalid strategy data.');
    for (const key of ['variants', 'releasePlans', 'safeguards']) if (env[key] != null && !Array.isArray(env[key])) throw new Error('Unleash returned invalid environment rules.');
    const strategies = [...(env.strategies ?? []) as Record<string, unknown>[]];
    for (const plan of (env.releasePlans ?? []) as unknown[]) {
      if (!object(plan) || (plan.activeMilestoneId != null && typeof plan.activeMilestoneId !== 'string') || (plan.milestones != null && !Array.isArray(plan.milestones))) throw new Error('Unleash returned invalid release plan data.');
      for (const milestone of (plan.milestones ?? []) as unknown[]) {
        if (!object(milestone) || typeof milestone.id !== 'string' || (milestone.strategies != null && !Array.isArray(milestone.strategies))) throw new Error('Unleash returned invalid release milestone data.');
        for (const strategy of (milestone.strategies ?? []) as unknown[]) {
          if (!object(strategy)) throw new Error('Unleash returned invalid milestone strategies.');
          // Older Unleash versions expose strategyName on release milestones.
          strategy.name ??= strategy.strategyName;
          if (typeof strategy.name !== 'string') throw new Error('Unleash returned invalid milestone strategies.');
          strategies.push(strategy);
        }
      }
    }
    for (const strategy of strategies) {
      if (strategy.disabled != null && typeof strategy.disabled !== 'boolean') throw new Error('Unleash returned an invalid strategy state.');
      for (const key of ['constraints', 'segments', 'variants']) if (strategy[key] != null && !Array.isArray(strategy[key])) throw new Error('Unleash returned invalid strategy rules.');
      if (strategy.parameters != null && (!object(strategy.parameters) || Object.values(strategy.parameters).some(v => typeof v !== 'string'))) throw new Error('Unleash returned invalid strategy parameters.');
    }
  }
  if (value.dependencies != null && !Array.isArray(value.dependencies)) throw new Error('Unleash returned invalid dependencies.');
  return { ...value, project, dependencies: value.dependencies ?? [] } as unknown as Flag;
}
export async function concurrentMap<T, R>(items: T[], work: (item: T) => Promise<R>, limit = 4): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await work(items[index]); }
  }));
  return results;
}
export class UnleashApi {
  readonly base: string;
  constructor(base: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch) { this.base = normalizeUrl(base); }
  private async get(path: string, signal?: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}/api/admin/${path}`, {
        method: 'GET', headers: { Authorization: this.token, Accept: 'application/json' },
        redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
      });
    } catch { throw new Error('Could not reach Unleash. Check the URL, network, and TLS certificate.'); }
    if (!response.ok) throw new ApiError(response.status, response.status === 401 ? 'Your PAT is invalid or expired. Reconnect to update it.' : response.status === 403 ? 'Your PAT does not have permission to read this resource.' : `Unleash request failed (HTTP ${response.status}).`);
    try { return await response.json(); } catch { throw new Error('Unleash returned an invalid JSON response.'); }
  }
  async catalog(signal?: AbortSignal): Promise<Flag[]> {
    const data = await this.get('projects', signal);
    if (!object(data) || !Array.isArray(data.projects) || data.projects.some(p => !object(p) || typeof p.id !== 'string')) throw new Error('Unleash returned an unsupported projects response.');
    const lists = await concurrentMap(data.projects as { id: string }[], async p => {
      const result = await this.get(`projects/${encodeURIComponent(p.id)}/features`, signal);
      if (!object(result) || !Array.isArray(result.features)) throw new Error('Unleash returned an unsupported flag catalog.');
      return result.features.map(f => parseFlag(f, p.id)).filter(f => !f.archived);
    });
    return lists.flat();
  }
  async detail(flag: Flag, signal?: AbortSignal): Promise<Flag> {
    return parseFlag(await this.get(`projects/${encodeURIComponent(flag.project)}/features/${encodeURIComponent(flag.name)}?variantEnvironments=true`, signal), flag.project);
  }
}
