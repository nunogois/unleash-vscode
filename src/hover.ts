import { assessEnvironment, effectiveStrategies, symbols, type Assessment, type Flag, type Strategy } from './model';

// Only extension-owned markup is interpreted. Server-provided text stays inert.
export function escapeText(value: unknown): string {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#+!|]/g, '\\$&');
}
const statusText = { on: 'Enabled for everyone', conditional: 'Conditional / mixed', off: 'Disabled', unknown: 'Unverified' };
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function constraintText(value: unknown): string {
  const c = object(value);
  const operators: Record<string, string> = { IN: 'is one of', NOT_IN: 'is not one of', STR_CONTAINS: 'contains', STR_STARTS_WITH: 'starts with', STR_ENDS_WITH: 'ends with', NUM_EQ: '=', NUM_GT: '>', NUM_GTE: '≥', NUM_LT: '<', NUM_LTE: '≤', DATE_AFTER: 'after', DATE_BEFORE: 'before', SEMVER_EQ: '=', SEMVER_GT: '>', SEMVER_LT: '<' };
  const values = Array.isArray(c.values) ? c.values.join(', ') : c.value ?? '';
  return `${escapeText(c.contextName || 'Context')} ${c.inverted ? '**not** ' : ''}${escapeText(operators[String(c.operator)] ?? c.operator ?? 'matches')} **${escapeText(values)}**${c.caseInsensitive ? ' (case insensitive)' : ''}`;
}
function variantsText(values: unknown[]): string {
  return values.map(value => {
    const v = object(value);
    return `${escapeText(v.name || 'Unnamed')}${typeof v.weight === 'number' ? ` (${v.weight / 10}%)` : ''}`;
  }).join(' · ');
}
function strategyLines(strategy: Strategy): string[] {
  const p = strategy.parameters ?? {};
  const rollout = p.rollout ?? p.percentage;
  const summary = strategy.name === 'default' ? 'All users' : rollout !== undefined ? `${escapeText(rollout)}% rollout` : escapeText(strategy.name);
  const lines = [`- **${strategy.title ? `${escapeText(strategy.title)}** — ${summary}` : `${summary}**`}${strategy.disabled ? ' · *Disabled strategy*' : ''}${p.stickiness ? ` · Stickiness: **${escapeText(p.stickiness)}**` : ''}`];
  for (const constraint of strategy.constraints ?? []) lines.push(`  - ${constraintText(constraint)}`);
  if (strategy.segments?.length) lines.push(`  - Segments: ${strategy.segments.map(s => escapeText(s)).join(', ')}`);
  if (strategy.variants?.length) lines.push(`  - Variants: ${variantsText(strategy.variants)}`);
  for (const [key, value] of Object.entries(p)) {
    if (!['rollout', 'percentage', 'stickiness', 'groupId'].includes(key)) lines.push(`  - ${escapeText(key)}: ${escapeText(value)}`);
  }
  return lines;
}
export function renderHover(flag: Flag, result: Assessment, options: { environment?: string; demo?: boolean; fetchedAt: number; detailed: boolean; url?: string }): string {
  const lines = [`### ${escapeText(flag.name)}${options.demo ? ' · Demo' : ''}`, ''];
  if (flag.description) lines.push(escapeText(flag.description), '');
  lines.push(`${symbols[result.status]} **${statusText[result.status]}** · ${escapeText(options.environment ?? 'All environments')}`, '',
    `Project: **${escapeText(flag.project)}**`, '', escapeText(result.reason), '', '---', '');
  // Put the selected environment first without hiding the overall picture.
  const environments = [...flag.environments].sort((a, b) => Number(b.name === options.environment) - Number(a.name === options.environment));
  for (const env of environments) {
    const state = assessEnvironment(env, flag.dependencies);
    const unverified = result.status === 'unknown';
    lines.push(`**${symbols[unverified ? 'unknown' : state.status]} ${escapeText(env.name)}**${env.name === options.environment ? ' · Selected' : ''} — ${statusText[state.status]}${unverified ? ' *(cached / unverified)*' : ''}`, '');
    for (const plan of env.releasePlans ?? []) {
      const milestone = plan.milestones?.find(m => m.id === plan.activeMilestoneId);
      lines.push(`Release plan: **${escapeText(plan.name || 'Unnamed plan')}** · ${plan.activeMilestoneId === null ? 'Not started' : milestone ? `Current milestone: **${escapeText(milestone.name || milestone.id)}**` : 'Active milestone unavailable'}`, '');
    }
    const effective = effectiveStrategies(env);
    if (effective.strategies.length) lines.push(...effective.strategies.flatMap(strategyLines), '');
    else lines.push(effective.complete ? (env.enabled ? 'No strategies — enabled for everyone.' : 'Environment toggle is off.') : 'Loading strategy configuration…', '');
    if (env.variants?.length) lines.push(`Variants: ${variantsText(env.variants)}`, '');
    if (env.safeguards?.length) lines.push(`${env.safeguards.length} safeguard(s) configured.`, '');
  }
  if (flag.dependencies?.length) {
    lines.push('**Parent dependencies**', '');
    for (const value of flag.dependencies) {
      const dep = object(value);
      lines.push(`- **${escapeText(dep.feature || 'Unknown parent')}** must be ${dep.enabled === false ? 'disabled' : 'enabled'}${Array.isArray(dep.variants) && dep.variants.length ? ` · Variants: ${dep.variants.map(escapeText).join(', ')}` : ''}`);
    }
    lines.push('');
  }
  if (flag.stale) lines.push('*Marked stale in Unleash.*', '');
  lines.push('---', '');
  if (options.url) lines.push(`[Open in Unleash](<${options.url}>)`, '');
  lines.push(`*${options.detailed ? 'Configuration' : 'Catalog'} updated ${escapeText(new Date(options.fetchedAt).toLocaleTimeString())}*`);
  return lines.join('\n');
}
