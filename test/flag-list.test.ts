import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterFlags } from '../src/flag-list';
const flags = [
  { name: 'zebra', project: 'storefront', description: 'Checkout rollout', environments: [] },
  { name: 'alpha', project: 'platform', description: null, environments: [] }
];
test('flag browser lists all flags alphabetically without mutating the catalog', () => {
  assert.deepEqual(filterFlags(flags, '').map(f => f.name), ['alpha', 'zebra']);
  assert.equal(flags[0].name, 'zebra');
});
test('flag search matches name, project and description, with case-insensitive terms', () => {
  assert.deepEqual(filterFlags(flags, ' STORE checkout ').map(f => f.name), ['zebra']);
  assert.deepEqual(filterFlags(flags, 'ALP').map(f => f.name), ['alpha']);
  assert.deepEqual(filterFlags(flags, 'missing'), []);
});
