import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailHtml } from '../src/detail-render';
import { assessFlag } from '../src/model';

test('flag details retain the hover status, targeting, description', () => {
  const flag = { name: 'checkout', project: 'store', description: 'New checkout', environments: [{ name: 'production', enabled: true, strategies: [{ name: 'flexibleRollout', parameters: { rollout: '100', stickiness: 'clientId' } }] }] };
  const html = detailHtml(flag, assessFlag(flag), { detailed: true, fetchedAt: Date.now() });
  for (const text of ['checkout', 'New checkout', 'Enabled for everyone', 'production', '100% rollout', 'clientId']) assert(html.includes(text));
});
test('flag details render server markup inert and do not embed external links', () => {
  const flag = { name: '<script>alert(1)</script>', project: '[x](javascript:alert(1))', description: '<img src=x onerror=alert(1)>', environments: [] };
  const html = detailHtml(flag, assessFlag(flag), { detailed: false, fetchedAt: Date.now(), url: 'https://example.test' });
  assert(!html.includes('<script>')); assert(!html.includes('<img')); assert(!html.includes('<a '));
  assert(html.includes('&lt;script&gt;'));
});
