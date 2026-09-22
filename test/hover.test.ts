import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHover } from '../src/hover';
import { assessFlag, type Flag } from '../src/model';
import { parseFlag } from '../src/api';

const flag: Flag = { name: 'flagStatusTooltips', description: 'Add a tooltip for Status column in Flags Overview screen', project: 'dx', environments: [
  { name: 'development', enabled: true, strategies: [] },
  { name: 'production', enabled: true, strategies: [], releasePlans: [{ name: 'Release to customers', activeMilestoneId: 'all', milestones: [
    { id: 'beta', name: 'Internal users', strategies: [{ name: 'flexibleRollout', parameters: { rollout: '10' } }] },
    { id: 'all', name: 'All customers', strategies: [{ name: 'flexibleRollout', parameters: { rollout: '100', stickiness: 'clientId' } }] }
  ] }] }
] };
test('hover leads with name and description and shows current release milestone in readable form', () => {
  const md = renderHover(flag, assessFlag(flag), { fetchedAt: 0, detailed: true, environment: 'production', url: 'https://example.com/flag' });
  assert(md.startsWith('### flagStatusTooltips\n\nAdd a tooltip'));
  assert(md.indexOf('production') < md.indexOf('development'));
  assert.match(md, /Current milestone: \*\*All customers\*\*/);
  assert.match(md, /\*\*100% rollout\*\* · Stickiness: \*\*clientId\*\*/);
  assert(!md.includes('10% rollout'));
  assert(!md.includes('"rollout"'));
  assert.match(md, /\[Open in Unleash\]/);
});
test('server-provided markup is escaped; outdated data has no confident green light', () => {
  const f = { ...flag, name: '[click](command:evil)', description: '<img src=x> **unsafe**' };
  const md = renderHover(f, { status: 'unknown', reason: 'Offline' }, { fetchedAt: 0, detailed: true });
  assert(!md.includes('[click](command:evil)'));
  assert(!md.includes('<img'));
  assert(md.includes('\\*\\*unsafe\\*\\*'));
  assert(!md.includes('🟢'));
});
test('legacy milestone strategyName is normalized and invalid nested rules are rejected', () => {
  const f = structuredClone(flag) as any;
  const strategy = f.environments[1].releasePlans[0].milestones[1].strategies[0];
  strategy.strategyName = strategy.name; delete strategy.name;
  assert.equal(assessFlag(parseFlag(f, 'dx')).status, 'on');
  strategy.constraints = {};
  assert.throws(() => parseFlag(f, 'dx'), /invalid strategy rules/);
  f.environments[1].releasePlans = [null];
  assert.throws(() => parseFlag(f, 'dx'), /invalid release plan/);
});
