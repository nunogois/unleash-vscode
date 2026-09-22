import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessFlag, type Flag, type Strategy } from '../src/model';

const unconditional: Strategy = { name: 'flexibleRollout', parameters: { rollout: '100', stickiness: 'default', groupId: 'test' }, constraints: [], segments: [] };
function flag(strategies: Strategy[] = [unconditional]): Flag {
  return { name: 'test-flag', project: 'default', environments: ['development', 'production'].map(name => ({ name, enabled: true, strategies: structuredClone(strategies) })) };
}
test('green requires every environment to be unconditional', () => {
  const f = flag(); assert.equal(assessFlag(f).status, 'on');
  f.environments[1].enabled = false;
  assert.equal(assessFlag(f).status, 'conditional');
  assert.equal(assessFlag(f, 'development').status, 'on');
  assert.equal(assessFlag(f, 'production').status, 'off');
  f.environments[0].enabled = false;
  assert.equal(assessFlag(f).status, 'off');
});
test('a redundant constrained strategy still makes the summary yellow', () => {
  const f = flag([unconditional, { name: 'default', constraints: [{ contextName: 'plan', operator: 'IN', values: ['pro'] }] }]);
  assert.equal(assessFlag(f).status, 'conditional');
});
test('conditional cases never become green', () => {
  const strategies: Strategy[] = [
    { ...unconditional, parameters: { rollout: '99', stickiness: 'default' } },
    { ...unconditional, segments: [42] },
    { name: 'custom-strategy' },
    { name: 'gradualRolloutUserId', parameters: { percentage: '100' } }
  ];
  for (const strategy of strategies) assert.equal(assessFlag(flag([strategy])).status, 'conditional');
});
test('dependencies affect targeting; safeguard metadata alone does not', () => {
  const dependency = flag(); dependency.dependencies = [{ feature: 'parent' }];
  assert.equal(assessFlag(dependency).status, 'conditional');
  const f = flag(); f.environments[0].safeguards = [{}];
  assert.equal(assessFlag(f).status, 'on');
});
test('disabled strategies do not restrict an active unconditional strategy', () => {
  assert.equal(assessFlag(flag([unconditional, { name: 'custom', disabled: true }])).status, 'on');
});
test('missing details and nonexistent environments are unknown, not green', () => {
  const f = flag(); delete f.environments[0].strategies;
  assert.equal(assessFlag(f).status, 'unknown');
  assert.equal(assessFlag(flag(), 'absent').status, 'unknown');
  assert.equal(assessFlag({ ...flag(), environments: [] }).status, 'unknown');
});
test('enabled with an empty strategy list is green, matching SDK evaluation', () => {
  assert.equal(assessFlag(flag([])).status, 'on');
  const f = flag([]);
  f.environments[1].enabled = false;
  assert.equal(assessFlag(f).status, 'conditional');
  f.environments[0].enabled = false;
  assert.equal(assessFlag(f).status, 'off');
});
test('empty strategy lists do not bypass parent dependencies', () => {
  const f = flag([]);
  f.dependencies = [{ feature: 'parent' }];
  assert.equal(assessFlag(f).status, 'conditional');
});

test('100% rollout is green regardless of stickiness', () => {
  for (const stickiness of ['default', 'random', 'userId', 'clientId', 'companyId']) {
    assert.equal(assessFlag(flag([{ ...unconditional, parameters: { rollout: '100', stickiness } }])).status, 'on');
  }
});
test('a release plan uses only its active milestone strategies', () => {
  const f = flag([]);
  f.environments[1].releasePlans = [{ name: 'Customer release', activeMilestoneId: 'all', milestones: [
    { id: 'beta', name: 'Beta', strategies: [{ ...unconditional, parameters: { rollout: '10' } }] },
    { id: 'all', name: 'All customers', strategies: [unconditional] }
  ] }];
  assert.equal(assessFlag(f).status, 'on');
  f.environments[1].releasePlans[0].activeMilestoneId = 'beta';
  assert.equal(assessFlag(f).status, 'conditional');
  f.environments[1].releasePlans[0].activeMilestoneId = 'missing';
  assert.equal(assessFlag(f).status, 'unknown');
});
test('release milestone targeting and dependencies still prevent green', () => {
  const f = flag([]);
  f.environments[1].releasePlans = [{ activeMilestoneId: 'all', milestones: [{ id: 'all', strategies: [{ ...unconditional, constraints: [{}] }] }] }];
  assert.equal(assessFlag(f).status, 'conditional');
  f.environments[1].releasePlans[0].milestones![0].strategies = [unconditional];
  f.dependencies = [{ feature: 'parent' }];
  assert.equal(assessFlag(f).status, 'conditional');
});
test('an incomplete active milestone cannot masquerade as an empty strategy list', () => {
  const f = flag([]);
  f.environments[1].releasePlans = [{ activeMilestoneId: 'all', milestones: [{ id: 'all' }] }];
  assert.equal(assessFlag(f).status, 'unknown');
  f.environments[1].releasePlans = [{ activeMilestoneId: null }];
  assert.equal(assessFlag(f).status, 'on');
});
