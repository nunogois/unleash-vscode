import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Plain JavaScript release helper.
import { validateVersion } from '../scripts/release-version.mjs';

test('release versions allow initial/equal versions and numeric upgrades', () => {
  for (const value of ['0.1.2', '0.1.3', '0.10.0', '1.0.0']) assert.equal(validateVersion(value, '0.1.2'), value);
});
test('release versions reject prefixes, suffixes, downgrades and shell input', () => {
  for (const value of ['v0.1.3', '0.1', '01.2.3', '0.1.3-beta', '0.1.3+build', '0.1.1', '0.1.3\n', '$(whoami)', '0.1.3; pwd']) {
    assert.throws(() => validateVersion(value, '0.1.2'));
  }
});
