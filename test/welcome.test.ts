import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function page() {
  const elements = new Map<string, any>();
  const messages: any[] = [];
  let receive: (event: any) => void;
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: false, disabled: false, events: {} as Record<string, Function>, focus() {}, addEventListener(event: string, fn: Function) { this.events[event] = fn; } });
    return elements.get(id);
  };
  runInNewContext(readFileSync('media/welcome.js', 'utf8'), {
    acquireVsCodeApi: () => ({ postMessage: (message: any) => messages.push(message) }),
    document: { getElementById: element, querySelectorAll: (selector: string) => selector === 'button' ? [element('submit')] : [] },
    window: { addEventListener: (_: string, fn: typeof receive) => { receive = fn; } }
  });
  return { element, messages, receive: (data: any) => receive({ data }), submit: () => element('connect').events.submit({ preventDefault() {} }) };
}
test('welcome clears the PAT field on submission and reports progress without persisting it', () => {
  const ui = page();
  ui.element('url').value = 'https://example.test';
  ui.element('token').value = 'fixture-token';
  ui.submit();
  assert.equal(ui.element('token').value, '');
  assert.equal(ui.element('submit').disabled, true);
  assert.equal(ui.messages.at(-1).token, 'fixture-token');
  assert(!ui.element('progress').textContent.includes('fixture-token'));
});
test('welcome errors allow retry, and success switches to the connected state', () => {
  const ui = page(); ui.submit();
  ui.receive({ type: 'error', message: 'PAT expired' }); ui.receive({ type: 'idle' });
  assert.equal(ui.element('error').textContent, 'PAT expired');
  assert.equal(ui.element('setup').hidden, false);
  assert.equal(ui.element('submit').disabled, false);
  ui.receive({ type: 'connected', url: 'https://example.test', count: 12, connected: true });
  assert.equal(ui.element('success').hidden, false);
  assert.equal(ui.element('setup').hidden, true);
  ui.element('change').events.click();
  ui.receive({ type: 'state', url: 'https://example.test', count: 12, connected: true });
  assert.equal(ui.element('setup').hidden, false, 'Background refresh must not interrupt connection editing');
});
test('welcome renders remote strings as text and never fills a saved PAT', () => {
  const ui = page();
  ui.receive({ type: 'state', url: '<img src=x onerror=alert(1)>', count: 1, connected: true });
  assert(ui.element('connection').textContent.includes('<img'));
  assert.equal(ui.element('connection').innerHTML, undefined);
  assert.equal(ui.element('token').value, '');
});
