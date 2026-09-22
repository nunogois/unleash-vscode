import * as vscode from 'vscode';
import { UnleashApi, normalizeUrl, flagUrl, concurrentMap } from './api';
import { FlagCache, type CachedFlag } from './cache';
import { Grammars } from './grammars';
import { findFlags, type Match } from './recognition';
import { assessFlag, symbols, type Status } from './model';
import { demoFlags } from './demo';
import { renderHover } from './hover';
import { ConnectionSession } from './session';
import { UnleashSidebar } from './sidebar';

const config = () => vscode.workspace.getConfiguration('unleash');
export async function activate(context: vscode.ExtensionContext) {
  let grammars = new Grammars(context);
  let cache: FlagCache | undefined;
  const session = new ConnectionSession(context.workspaceState, context.secrets, context.storageUri?.toString() ?? 'global');
  const sidebar = new UnleashSidebar(context.extensionUri);
  let connectionEpoch = 0;
  let beforeDemo: { document: vscode.TextDocument; selection: vscode.Selection; viewColumn?: vscode.ViewColumn } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let disposed = false;
  let scanGeneration = 0;
  const documents = new Map<string, { version: number; revision: number; matches: Match[]; supported: boolean }>();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 30);
  status.command = 'unleash.menu';
  status.name = 'Unleash';
  const decorationTypes = new Map<Status, vscode.TextEditorDecorationType>();
  for (const state of ['on', 'conditional', 'off', 'unknown'] as Status[]) {
    decorationTypes.set(state, vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor(`unleash.${state}`), textDecoration: 'underline',
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    }));
  }
  const interval = () => Math.max(5, Math.min(3600, config().get<number>('refreshIntervalSeconds', 15))) * 1000;
  const entries = (): Map<string, CachedFlag> => cache?.entries ?? new Map();
  const names = () => new Set(entries().keys());
  function assessment(entry: CachedFlag) {
    if (!session.demo && (cache?.catalogError || entry.error || Date.now() - entry.fetchedAt > interval() * 2)) return { status: 'unknown' as const, reason: entry.error ?? cache?.catalogError ?? 'Cached configuration is outdated. Refresh to verify the current state.' };
    return assessFlag(entry.flag, session.environment);
  }
  function visibleNames(): Set<string> {
    return new Set(vscode.window.visibleTextEditors.flatMap(editor => documents.get(editor.document.uri.toString())?.matches.map(m => m.name) ?? []));
  }
  function updateStatus() {
    const count = entries().size;
    status.text = session.demo ? '$(beaker) Unleash Demo · Exit' : !cache ? '$(plug) Unleash: Connect' : `$(flag) Unleash: ${session.environment ?? 'All'}${cache.catalogError ? ' $(warning)' : ''}`;
    status.command = session.demo ? 'unleash.exitDemo' : !cache ? 'unleash.setup' : 'unleash.menu';
    const active = vscode.window.activeTextEditor?.document;
    const doc = active && documents.get(active.uri.toString());
    status.tooltip = !cache ? 'Connect an Unleash instance or try the demo.' : `${count} flags across all accessible projects. ${session.environment ? `Environment: ${session.environment}` : 'All environments configured for each flag’s project.'}${cache.catalogError ? `\n${cache.catalogError}` : ''}${doc?.supported === false ? '\nThis document has no available grammar or exceeds the configured size limit.' : ''}\nClick for settings, environment selection, or refresh.`;
    if (session.demo) status.tooltip = session.url ? 'Demo mode. Click to return to your instance.' : 'Demo mode. Click to exit and connect your own instance.';
    sidebar.update({ demo: session.demo, url: session.url, connected: !!cache, environment: session.environment, count, error: cache?.catalogError });
    void vscode.commands.executeCommand('setContext', 'unleash.connected', !!cache && !session.demo);
    void vscode.commands.executeCommand('setContext', 'unleash.demo', session.demo);
    status.show();
  }
  function paint() {
    if (disposed) return;
    for (const editor of vscode.window.visibleTextEditors) {
      const record = documents.get(editor.document.uri.toString());
      const groups = new Map<Status, vscode.DecorationOptions[]>();
      if (record?.version === editor.document.version) for (const match of record.matches) {
        const entry = entries().get(match.name);
        if (!entry) continue;
        const { status: state } = assessment(entry);
        const options: vscode.DecorationOptions = { range: new vscode.Range(editor.document.positionAt(match.start), editor.document.positionAt(match.end)) };
        if (config().get('showIndicators', true)) options.renderOptions = { after: { contentText: ` ${symbols[state]}`, margin: '0 0.3em 0 0.1em' } };
        const group = groups.get(state) ?? [];
        group.push(options); groups.set(state, group);
      }
      for (const [state, type] of decorationTypes) editor.setDecorations(type, groups.get(state) ?? []);
    }
    updateStatus();
  }
  async function scan() {
    const generation = ++scanGeneration;
    const currentCache = cache;
    const known = names();
    const revision = cache?.revision ?? 0;
    for (const editor of vscode.window.visibleTextEditors) {
      const doc = editor.document;
      const key = doc.uri.toString();
      const existing = documents.get(key);
      if (existing?.version === doc.version && existing.revision === revision) continue;
      const version = doc.version;
      const grammar = await grammars.get(doc.languageId);
      if (generation !== scanGeneration || disposed) return;
      const text = doc.getText();
      const supported = !!grammar && text.length <= config().get<number>('maxFileSizeKB', 512) * 1024;
      const matches = grammar && supported ? findFlags(text, grammar, known) : [];
      if (version !== doc.version) { scheduleScan(); return; }
      documents.set(key, { version, revision, matches, supported });
    }
    paint();
    if (currentCache && !session.demo) await concurrentMap([...visibleNames()], name => currentCache.detail(name));
    paint();
  }
  function scheduleScan() {
    clearTimeout(debounce);
    debounce = setTimeout(() => { void scan(); }, 150);
  }
  function changed() { paint(); scheduleScan(); }
  async function refresh() {
    clearTimeout(timer);
    const current = cache;
    if (current && !session.demo) {
      await current.refresh(visibleNames);
      if (disposed || current !== cache) return;
      failures = current.catalogError ? Math.min(failures + 1, 4) : 0;
    }
    paint();
    clearTimeout(timer);
    if (cache && !session.demo && !disposed) timer = setTimeout(() => { void refresh(); }, Math.min(interval() * 2 ** failures, 300000));
  }
  function replace(next?: FlagCache) {
    clearTimeout(timer); clearTimeout(debounce);
    cache?.dispose(); cache = next;
    documents.clear(); failures = 0; scanGeneration++;
    paint();
  }
  async function setup() {
    const input = await vscode.window.showInputBox({ title: 'Connect to Unleash · 1 of 2', prompt: 'Instance URL (all accessible projects and environments are included)', value: session.url ?? '', placeHolder: 'https://your-instance.getunleash.io', ignoreFocusOut: true, validateInput: value => { try { normalizeUrl(value); return undefined; } catch (e) { return (e as Error).message; } } });
    if (input === undefined) return;
    const url = normalizeUrl(input);
    const saved = session.url === url ? await session.savedProfile() : undefined;
    const token = await vscode.window.showInputBox({ title: 'Connect to Unleash · 2 of 2', prompt: saved ? 'Enter a replacement PAT, or leave blank to keep your saved token.' : 'Create a PAT in Unleash → Profile → Personal API tokens. It stays in encrypted VS Code storage.', placeHolder: saved ? 'Leave blank to keep the saved PAT' : 'Personal Access Token', password: true, ignoreFocusOut: true, validateInput: value => value.trim() || saved ? undefined : 'Enter your PAT.' });
    if (token === undefined) return;
    const credential = token.trim() || saved!.token;
    const api = new UnleashApi(url, credential);
    const next = new FlagCache(api, () => { if (cache === next) changed(); });
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Checking Unleash access…' }, () => next.refresh(() => new Set()));
    if (next.catalogError) { next.dispose(); await vscode.window.showErrorMessage(next.catalogError); return; }
    await session.save(url, credential);
    connectionEpoch++;
    replace(next);
    await scan();
    await restoreEditor();
    timer = setTimeout(() => { void refresh(); }, interval());
    void vscode.window.showInformationMessage(`Connected: ${next.entries.size} flags. All accessible projects and all environments.`);
  }
  async function startDemo(openSample = true) {
    const editor = vscode.window.activeTextEditor;
    if (!session.demo && editor) beforeDemo = { document: editor.document, selection: editor.selection, viewColumn: editor.viewColumn };
    connectionEpoch++;
    session.enterDemo();
    const next = new FlagCache(new UnleashApi('https://demo.invalid', ''), changed);
    for (const flag of demoFlags()) next.entries.set(flag.name, { flag, fetchedAt: Date.now(), detailed: true });
    next.revision++;
    replace(next);
    if (openSample) await vscode.window.showTextDocument(vscode.Uri.joinPath(context.extensionUri, 'samples', 'flags.ts'));
    await scan();
  }
  async function restoreEditor() {
    const previous = beforeDemo; beforeDemo = undefined;
    if (previous && !previous.document.isClosed) await vscode.window.showTextDocument(previous.document, { viewColumn: previous.viewColumn, selection: previous.selection });
  }
  async function returnToInstance() {
    const epoch = ++connectionEpoch;
    replace();
    const profile = await session.restore();
    if (epoch !== connectionEpoch || disposed) return;
    if (profile) {
      const next = new FlagCache(new UnleashApi(profile.url, profile.token), changed);
      replace(next);
      await refresh();
      await scan();
    } else { paint(); }
    if (epoch === connectionEpoch) await restoreEditor();
  }
  async function disconnect() {
    // Exiting the demo must never delete the real connection.
    if (session.demo) return returnToInstance();
    connectionEpoch++;
    await session.forget();
    replace();
  }
  function hover(match: Match): vscode.MarkdownString | undefined {
    const entry = entries().get(match.name);
    if (!entry) return;
    const flag = entry.flag;
    const result = assessment(entry);
    const md = new vscode.MarkdownString(renderHover(flag, result, {
      environment: session.environment, demo: session.demo, fetchedAt: entry.fetchedAt, detailed: entry.detailed,
      url: !session.demo && session.url ? flagUrl(session.url, flag) : undefined
    }));
    md.supportHtml = false;
    md.isTrusted = false;
    return md;
  }
  const register = (name: string, fn: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(`unleash.${name}`, async (...args: any[]) => {
    try { return await fn(...args); } catch { void vscode.window.showErrorMessage('Unleash could not complete this action. Check your connection and try again.'); }
  }));
  register('setup', setup);
  register('refresh', async () => { if (!cache) return setup(); await refresh(); });
  register('demo', () => startDemo());
  register('disconnect', disconnect);
  register('exitDemo', returnToInstance);
  register('openWelcome', () => vscode.commands.executeCommand('workbench.action.openWalkthrough', `${context.extension.id}#unleash.welcome`, false));
  register('website', () => vscode.env.openExternal(vscode.Uri.parse('https://getunleash.io')));
  register('repository', () => vscode.env.openExternal(vscode.Uri.parse('https://github.com/nunogois/unleash-vscode')));
  register('environment', async () => {
    const environments = [...new Set([...entries().values()].flatMap(e => e.flag.environments.map(x => x.name)))].sort();
    const choices = [{ label: 'All environments', description: 'Default · every environment configured for each flag', value: undefined as string | undefined }, ...environments.map(value => ({ label: value, description: '', value }))];
    const choice = await vscode.window.showQuickPick(choices, { title: 'Unleash environment', placeHolder: session.environment ?? 'All environments' });
    if (choice) { await session.selectEnvironment(choice.value); paint(); }
  });
  register('menu', async () => {
    const choices = [
      ...(session.demo ? [{ label: session.url ? '$(debug-stop) Return to my instance' : '$(debug-stop) Exit demo', command: 'unleash.exitDemo' }] : []),
      { label: session.url ? '$(plug) Change connection / update PAT' : '$(plug) Connect to Unleash', command: 'unleash.setup' },
      { label: `$(globe) Environment: ${session.environment ?? 'All'}`, command: 'unleash.environment' },
      { label: '$(refresh) Refresh flags', command: 'unleash.refresh' },
      ...(!session.demo ? [{ label: '$(beaker) Try demo', command: 'unleash.demo' }] : []),
      { label: '$(book) Getting started', command: 'unleash.openWelcome' },
      { label: '$(gear) Extension settings', command: 'workbench.action.openSettings' },
      ...(!session.demo && session.url ? [{ label: '$(debug-disconnect) Disconnect and forget credentials', command: 'unleash.disconnect' }] : [])
    ];
    const choice = await vscode.window.showQuickPick(choices, { title: 'Unleash', placeHolder: cache?.catalogError ?? (session.demo ? 'Demo · no network requests' : session.url ?? 'Not connected') });
    if (choice) await vscode.commands.executeCommand(choice.command, ...(choice.command === 'workbench.action.openSettings' ? ['@ext:local-development.unleash-vscode'] : []));
  });
  context.subscriptions.push(
    status, sidebar, vscode.window.registerTreeDataProvider('unleash.home', sidebar), ...decorationTypes.values(),
    vscode.languages.registerHoverProvider('*', { provideHover(doc, pos) {
      const data = documents.get(doc.uri.toString());
      if (data?.version !== doc.version) return;
      const offset = doc.offsetAt(pos);
      const match = data.matches.find(m => m.start <= offset && offset < m.end);
      const md = match && hover(match);
      if (match && md) return new vscode.Hover(md, new vscode.Range(doc.positionAt(match.start), doc.positionAt(match.end)));
    } }),
    vscode.languages.registerDocumentLinkProvider('*', { provideDocumentLinks(doc) {
      if (!session.url || session.demo) return [];
      const data = documents.get(doc.uri.toString());
      if (data?.version !== doc.version) return [];
      return data.matches.flatMap(match => {
        const entry = entries().get(match.name);
        if (!entry) return [];
        const link = new vscode.DocumentLink(new vscode.Range(doc.positionAt(match.start), doc.positionAt(match.end)), vscode.Uri.parse(flagUrl(session.url!, entry.flag)));
        link.tooltip = 'Open flag configuration in Unleash'; return [link];
      });
    } }),
    vscode.window.onDidChangeVisibleTextEditors(scheduleScan),
    vscode.window.onDidChangeActiveTextEditor(scheduleScan),
    vscode.workspace.onDidChangeTextDocument(e => { documents.delete(e.document.uri.toString()); paint(); scheduleScan(); }),
    vscode.workspace.onDidCloseTextDocument(doc => documents.delete(doc.uri.toString())),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('unleash')) { documents.clear(); scheduleScan(); void refresh(); } }),
    vscode.extensions.onDidChange(() => { grammars.dispose(); grammars = new Grammars(context); documents.clear(); scheduleScan(); }),
    { dispose() { disposed = true; scanGeneration++; clearTimeout(timer); clearTimeout(debounce); cache?.dispose(); grammars.dispose(); } }
  );
  if (vscode.workspace.isTrusted) void returnToInstance();
  updateStatus();
  if (!session.url && !context.globalState.get('onboardingShown')) {
    await context.globalState.update('onboardingShown', true);
    if (context.extensionMode !== vscode.ExtensionMode.Test) {
      await vscode.commands.executeCommand('unleash.openWelcome');
      await vscode.commands.executeCommand('unleash.home.focus');
    }
  }
  return { getMatches: (uri: string) => documents.get(uri)?.matches ?? [], getFlagStatus: (name: string) => { const entry = entries().get(name); return entry && assessment(entry); } };
}
