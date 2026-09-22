import * as vscode from 'vscode';
import assert from 'node:assert/strict';
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
  // Confirm recognition updates in an actual editor after typing.
  const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: 'python', content: 'flag = "beta-search"\n# "new-checkout"' }));
  const waitFor = async (predicate: () => boolean) => {
    const end = Date.now() + 10000;
    while (!predicate()) { if (Date.now() > end) throw new Error('Editor update timed out'); await new Promise(r => setTimeout(r, 100)); }
  };
  await waitFor(() => api.getMatches(editor.document.uri.toString()).length === 1);
  await editor.edit(edit => edit.replace(new vscode.Range(0, 0, 0, editor.document.lineAt(0).text.length), 'flag = "not-an-unleash-flag"'));
  await waitFor(() => api.getMatches(editor.document.uri.toString()).length === 0);
  await vscode.commands.executeCommand('unleash.exitDemo');
  assert.equal(api.getFlagStatus('new-checkout'), undefined);
  await vscode.commands.executeCommand('unleash.openWelcome');
  await vscode.commands.executeCommand('unleash.walkthroughDemo');
  assert.equal(api.isDemo(), true);
  const sampleUri = doc.uri.toString();
  const demoTabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === sampleUri);
  assert(demoTabs().length >= 1, 'Advancing the walkthrough must leave the demo file open');
  // Opening another file must not end Demo, and closing one split must preserve it.
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
  await vscode.commands.executeCommand('workbench.action.splitEditorRight');
  await waitFor(() => demoTabs().length >= 2);
  await vscode.window.tabGroups.close(demoTabs()[0]);
  assert.equal(api.isDemo(), true);
  await vscode.window.tabGroups.close(demoTabs());
  await waitFor(() => !api.isDemo() && api.getKnownFlags().length === 0);
  assert.equal(api.getFlagStatus('new-checkout'), undefined);
  console.log('Extension Host integration passed: activation, flag browser, walkthrough progression, demo/exit, split-tab closing, traffic lights, hover, Python recognition and edit invalidation.');
}
