import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionSession } from '../src/session';
function fixture() {
  const values = new Map<string, unknown>();
  const secrets = new Map<string, string>();
  const state = { get: <T>(key: string) => values.get(key) as T | undefined, update: async (key: string, value: unknown) => { values.set(key, value); } };
  const storage = { get: async (key: string) => secrets.get(key), store: async (key: string, value: string) => { secrets.set(key, value); }, delete: async (key: string) => { secrets.delete(key); } };
  return { session: new ConnectionSession(state, storage, 'workspace'), values, secrets, state, storage };
}
test('entering and leaving demo preserves URL, PAT and the real environment', async () => {
  const { session, values, secrets } = fixture();
  await session.save('https://example.com', 'private-pat');
  await session.selectEnvironment('production');
  const before = [...values]; const beforeSecrets = [...secrets];
  session.enterDemo();
  await session.selectEnvironment('development');
  assert.equal(session.demo, true);
  assert.deepEqual([...values], before);
  assert.deepEqual([...secrets], beforeSecrets);
  assert.deepEqual(await session.restore(), { url: 'https://example.com', token: 'private-pat' });
  assert.equal(session.demo, false);
  assert.equal(session.environment, 'production');
});
test('demo with no connection exits back to setup without credentials', async () => {
  const { session, values, secrets } = fixture();
  session.enterDemo();
  assert.equal(await session.restore(), undefined);
  assert.equal(session.demo, false);
  assert.equal(values.size, 0); assert.equal(secrets.size, 0);
});
test('reloading during demo returns to real settings and only explicit forget deletes the PAT', async () => {
  const { session, secrets, state, storage } = fixture();
  await session.save('https://example.com', 'private-pat');
  await session.selectEnvironment('production'); session.enterDemo();
  const reloaded = new ConnectionSession(state, storage, 'workspace');
  assert.equal(reloaded.demo, false);
  assert.equal(reloaded.environment, 'production');
  assert.equal((await reloaded.restore())?.token, 'private-pat');
  await reloaded.forget();
  assert.equal(secrets.size, 0); assert.equal(reloaded.url, undefined);
});
test('reading saved credentials for setup does not leave demo or overwrite its scope', async () => {
  const { session } = fixture();
  await session.save('https://example.com', 'private-pat');
  session.enterDemo(); await session.selectEnvironment('development');
  assert.equal((await session.savedProfile())?.token, 'private-pat');
  assert.equal(session.demo, true); assert.equal(session.environment, 'development');
});
