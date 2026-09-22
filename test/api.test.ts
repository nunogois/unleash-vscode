import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UnleashApi, normalizeUrl, flagUrl } from '../src/api';
import { FlagCache } from '../src/cache';
import { demoFlags } from '../src/demo';

test('normalizes API suffixes and preserves reverse proxy base paths', () => {
  assert.equal(normalizeUrl(' https://example.com/unleash/api/ '), 'https://example.com/unleash');
  assert.equal(normalizeUrl('https://example.com/api/admin'), 'https://example.com');
  assert.equal(normalizeUrl('http://localhost:4242'), 'http://localhost:4242');
  for (const value of ['file:///etc/passwd', 'https://token@example.com', 'https://example.com?token=secret', 'http://remote.example.com']) assert.throws(() => normalizeUrl(value));
  assert.equal(flagUrl('https://example.com/base', { project: 'a/b', name: 'flag?x#' }), 'https://example.com/base/projects/a%2Fb/features/flag%3Fx%23');
});
test('reads every returned project, uses raw PAT, encodes paths and refuses redirects', async () => {
  const calls: string[] = [];
  const api = new UnleashApi('https://example.com/base/api', 'secret', async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'secret');
    return Response.json(String(input).endsWith('/projects') ? { projects: [{ id: 'a/b' }, { id: 'two' }] } : { features: [{ name: 'flag', environments: [{ name: 'production', enabled: false }] }] });
  });
  const flags = await api.catalog();
  assert.equal(flags.length, 2);
  assert.deepEqual(flags.map(f => f.project), ['a/b', 'two']);
  assert(calls.includes('https://example.com/base/api/admin/projects/a%2Fb/features'));
});
test('authentication, permission and network errors never contain response bodies or credentials', async () => {
  for (const status of [401, 403, 429, 500]) {
    const api = new UnleashApi('https://example.com', 'secret-token', async () => new Response('secret-token', { status }));
    await assert.rejects(api.catalog(), e => e instanceof Error && !e.message.includes('secret-token'));
  }
  const api = new UnleashApi('https://example.com', 'secret-token', async () => { throw new Error('secret-token'); });
  await assert.rejects(api.catalog(), /Could not reach/);
});
test('malformed catalogs fail rather than imply zero flags', async () => {
  const api = new UnleashApi('https://example.com', 'secret', async () => Response.json({}));
  await assert.rejects(api.catalog(), /unsupported projects/);
});
test('cache shares in-flight requests, preserves old data on failure and removes deleted flags', async () => {
  let fail = false; let deleted = false; let count = 0;
  const flag = demoFlags()[0];
  const api = new UnleashApi('https://example.com', '', async input => {
    count++;
    if (fail) return new Response('', { status: 503 });
    if (String(input).endsWith('/projects')) return Response.json({ projects: [{ id: flag.project }] });
    if (String(input).endsWith('/features')) return Response.json({ features: deleted ? [] : [flag] });
    return Response.json(flag);
  });
  const cache = new FlagCache(api, () => {});
  await Promise.all([cache.refresh(() => new Set([flag.name])), cache.refresh(() => new Set([flag.name]))]);
  assert.equal(count, 3); assert.equal(cache.entries.get(flag.name)?.detailed, true);
  fail = true; await cache.refresh(() => new Set());
  assert.match(cache.catalogError!, /503/); assert.equal(cache.entries.size, 1);
  fail = false; deleted = true; await cache.refresh(() => new Set());
  assert.equal(cache.entries.size, 0); assert.equal(cache.catalogError, undefined);
  cache.dispose();
});
