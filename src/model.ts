export interface Strategy {
  id?: string;
  name: string;
  title?: string | null;
  disabled?: boolean | null;
  parameters?: Record<string, string>;
  constraints?: unknown[];
  segments?: number[];
  variants?: unknown[];
}
export interface ReleasePlan {
  name?: string;
  activeMilestoneId?: string | null;
  milestones?: { id: string; name?: string; strategies?: Strategy[] }[];
}
export interface Environment {
  name: string;
  enabled: boolean;
  strategies?: Strategy[];
  variants?: unknown[];
  releasePlans?: ReleasePlan[];
  safeguards?: unknown[];
}
export interface Flag {
  name: string;
  project: string;
  description?: string | null;
  stale?: boolean;
  archived?: boolean;
  dependencies?: unknown[];
  environments: Environment[];
}
export type Status = 'on' | 'conditional' | 'off' | 'unknown';
export interface Assessment { status: Status; reason: string }
export const symbols: Record<Status, string> = { on: '🟢', conditional: '🟡', off: '🔴', unknown: '⚪' };
export const labels: Record<Status, string> = { on: 'Unconditionally enabled', conditional: 'Conditional / mixed', off: 'Disabled', unknown: 'Unknown' };

export function effectiveStrategies(env: Environment): { strategies: Strategy[]; complete: boolean } {
  const strategies = [...(env.strategies ?? [])];
  let complete = Array.isArray(env.strategies);
  for (const plan of env.releasePlans ?? []) {
    if (plan.activeMilestoneId === null) continue;
    const milestone = plan.activeMilestoneId && plan.milestones?.find(m => m.id === plan.activeMilestoneId);
    if (!milestone || !Array.isArray(milestone.strategies)) { complete = false; continue; }
    for (const strategy of milestone.strategies) {
      if (!strategy.id || !strategies.some(s => s.id === strategy.id)) strategies.push(strategy);
    }
  }
  return { strategies, complete };
}

// This is an intentionally conservative configuration summary, not SDK evaluation.
// Even a redundant conditional strategy prevents green, by product design.
export function assessEnvironment(env: Environment, dependencies: unknown[] = []): Assessment {
  if (env.enabled === false) return { status: 'off', reason: 'Environment toggle is off.' };
  const effective = effectiveStrategies(env);
  if (env.enabled !== true || !effective.complete) return { status: 'unknown', reason: 'Strategy or active release milestone configuration is unavailable.' };
  const strategies = effective.strategies.filter(s => s.disabled !== true);
  if (dependencies.length) return { status: 'conditional', reason: 'The flag has parent dependencies.' };
  if (!strategies.length) return { status: 'on', reason: 'Enabled with no active strategies: no strategy restricts activation.' };
  for (const s of strategies) {
    if (s.constraints?.length || s.segments?.length) return { status: 'conditional', reason: 'An active strategy has constraints or segments.' };
    const p = s.parameters ?? {};
    if (s.name === 'default' && Object.keys(p).length === 0) continue;
    if (s.name === 'flexibleRollout' && Number(p.rollout) === 100 && Object.keys(p).every(k => ['rollout', 'stickiness', 'groupId'].includes(k))) continue;
    if (s.name === 'gradualRolloutRandom' && p.percentage === '100' && Object.keys(p).every(k => k === 'percentage')) continue;
    return { status: 'conditional', reason: `${s.name}: rollout, context requirements, or custom rules may limit activation.` };
  }
  return { status: 'on', reason: 'Every active strategy is unconditional and there are no dependencies or targeting rules.' };
}

export function assessFlag(flag: Flag, environment?: string): Assessment {
  const envs = environment ? flag.environments.filter(e => e.name === environment) : flag.environments;
  if (!envs.length) return { status: 'unknown', reason: environment ? 'This environment is not configured for this flag.' : 'No environment configuration available.' };
  const results = envs.map(e => assessEnvironment(e, flag.dependencies));
  if (results.some(r => r.status === 'unknown')) return { status: 'unknown', reason: 'Some environment details are unavailable.' };
  if (results.every(r => r.status === 'off')) return { status: 'off', reason: environment ? results[0].reason : 'Disabled in every configured environment.' };
  if (results.every(r => r.status === 'on')) return { status: 'on', reason: environment ? results[0].reason : 'Unconditionally enabled in every configured environment.' };
  return { status: 'conditional', reason: environment ? results[0].reason : 'At least one environment is disabled or has conditional activation.' };
}
