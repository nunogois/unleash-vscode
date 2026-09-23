import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
export async function run() {
  const extension = vscode.extensions.getExtension('nunogois.unleash-vscode');
  assert(extension);
  const api = await extension.activate();
  const commands = await vscode.commands.getCommands(true);
  assert(commands.includes('unleash.openWelcome'));
  assert(commands.includes('unleash.exitDemo'));
  assert(extension.packageJSON.contributes.views.unleash.some((view: { id: string }) => view.id === 'unleash.home'));
  await vscode.commands.executeCommand('unleash.home.focus');
  await vscode.commands.executeCommand('unleash.demo');
  const doc = vscode.window.activeTextEditor!.document;
  assert.equal(api.getMatches(doc.uri.toString()).length, 4);
  assert.equal(api.getKnownFlags().length, 4);
  assert.equal(api.isDemo(), true);
  assert.equal(api.getFlagStatus('new-checkout').status, 'on');
  assert.equal(api.getFlagStatus('beta-search').status, 'conditional');
  assert.equal(api.getFlagStatus('legacy-banner').status, 'off');
  assert.equal(api.getFlagStatus('preview-dashboard').status, 'conditional');
  const pos = doc.positionAt(doc.getText().indexOf("'new-checkout'") + 3);
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', doc.uri, pos);
  const text = (hovers ?? []).flatMap(h => h.contents.map(c => typeof c === 'string' ? c : c.value)).join('\n').replaceAll('&nbsp;', ' ');
  assert.match(text, /Enabled for everyone/);
  assert.match(text, /### new-checkout/);
  assert(text.indexOf('The new checkout') < text.indexOf('Enabled for everyone'));
  assert.match(text, /100% rollout/);
  assert(!text.includes('{"rollout"'));
  assert.match(text, /production/);
  assert.match(text, /storefront/);
  const completions = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', doc.uri, pos);
  const suggestion = completions?.items.find(item => item.label === 'new-checkout');
  assert(suggestion, 'Cached flags should be suggested inside strings');
  assert(suggestion.detail?.includes('storefront'));
  // Real files must never receive the demo catalog, even while the sample tab is open.
  const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'python', content: 'flag = "beta-search"\n# "new-checkout"' }), { preview: false });
  const waitFor = async (predicate: () => boolean) => {
    const end = Date.now() + 10000;
    while (!predicate()) { if (Date.now() > end) throw new Error('Editor update timed out'); await new Promise(r => setTimeout(r, 100)); }
  };
  await waitFor(() => !api.isDemo() && api.getKnownFlags().length === 0);
  assert.equal(api.getMatches(editor.document.uri.toString()).length, 0);
  await vscode.window.showTextDocument(doc, { preview: false });
  await waitFor(() => api.isDemo() && api.getMatches(doc.uri.toString()).length === 4);
  await vscode.commands.executeCommand('unleash.exitDemo');
  assert.equal(api.getFlagStatus('new-checkout'), undefined);
  await vscode.commands.executeCommand('unleash.openWelcome');
  await vscode.commands.executeCommand('unleash.setup');
  const welcomeTabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.input instanceof vscode.TabInputWebview && tab.label === 'Welcome to Unleash');
  await waitFor(() => welcomeTabs().length === 1);
  await vscode.commands.executeCommand('unleash.demo');
  assert.equal(api.isDemo(), true);
  const sampleUri = doc.uri.toString();
  const demoTabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === sampleUri);
  assert(demoTabs().length >= 1, 'Starting Demo must open its sample file');
  // Opening another file must not end Demo, and closing one split must preserve it.
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
  await vscode.commands.executeCommand('workbench.action.splitEditorRight');
  await waitFor(() => demoTabs().length >= 2);
  await vscode.window.tabGroups.close(demoTabs()[0]);
  assert.equal(api.isDemo(), true);
  await vscode.window.tabGroups.close(demoTabs());
  await waitFor(() => !api.isDemo() && api.getKnownFlags().length === 0);
  assert.equal(api.getFlagStatus('new-checkout'), undefined);
  const realFlag = { name: 'real-flag', project: 'test', description: 'Mock integration flag', environments: [{ name: 'production', enabled: true, strategies: [] }] };
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'fixture-token') { res.writeHead(401); res.end('{}'); return; }
    const route = req.url?.replace('/moved', '');
    res.end(JSON.stringify(route === '/api/admin/projects' ? { projects: [{ id: 'test' }] } : route === '/api/admin/projects/test/features' ? { features: [realFlag] } : realFlag));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await assert.rejects(api.connectForTest(url, 'bad-token'), /invalid or expired/);
    assert.equal(api.getKnownFlags().length, 0);
    await api.connectForTest(url, 'fixture-token');
    assert.equal(api.getKnownFlags()[0].name, 'real-flag');
    await api.connectForTest(url, ''); // Reuse SecretStorage without sending a token back to the webview.
    await api.connectForTest(`${url}/moved`, ''); // Explicitly changing URL also preserves the saved token.
    assert.equal(api.getKnownFlags()[0].name, 'real-flag');
    const completionDoc = await vscode.workspace.openTextDocument({ language: 'typescript', content: 'isEnabled("real-")' });
    await vscode.window.showTextDocument(completionDoc);
    await new Promise(resolve => setTimeout(resolve, 300));
    const beforeRequests = requests;
    const realSuggestions = await vscode.commands.executeCommand<vscode.CompletionList>('vscode.executeCompletionItemProvider', completionDoc.uri, new vscode.Position(0, 16));
    assert(realSuggestions?.items.some(item => item.label === 'real-flag'));
    assert.equal(requests, beforeRequests, 'Completion must not fetch data');
    await api.setFocusedForTest(false);
    const pausedRequests = requests;
    await vscode.commands.executeCommand('unleash.refresh');
    assert.equal(requests, pausedRequests, 'Inactive windows must not poll');
    await api.setFocusedForTest(true);
    assert(requests > pausedRequests, 'Returning to the window refreshes the catalog');
    await vscode.commands.executeCommand('unleash.copyFlagReference', 'real-flag');
    assert((await vscode.env.clipboard.readText()).includes('/projects/test/features/real-flag'));
    await vscode.commands.executeCommand('unleash.inspectFlag', { name: 'real-flag' });
    await waitFor(() => !!api.getDetailHtml()?.includes('Enabled for everyone'));
    assert(api.getDetailHtml().includes('Mock integration flag'));
    await waitFor(() => vscode.window.tabGroups.all.flatMap(group => group.tabs).some(tab => tab.input instanceof vscode.TabInputWebview && tab.label === 'real-flag'));
    await vscode.commands.executeCommand('unleash.demo');
    await waitFor(() => api.isDemo() && api.getKnownFlags().length === 4);
    await vscode.window.showTextDocument(editor.document, { preview: false });
    await waitFor(() => !api.isDemo() && api.getKnownFlags()[0]?.name === 'real-flag');
    await vscode.commands.executeCommand('unleash.disconnect');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  console.log('Extension Host integration passed: activation, flag browser, welcome tab, flag details, connection flow and saved-token reuse across URL changes, demo/exit, split-tab closing, traffic lights, hover, switching between real files and Demo.');
}
