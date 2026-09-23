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
import { FlagsView } from './flags-view';
import { WelcomePage } from './welcome';
import { FlagDetails } from './details';
import { detailHtml } from './detail-render';
import { completionRange, safeCompletionName } from './completion';

const config = () => vscode.workspace.getConfiguration('unleash');
export async function activate(context: vscode.ExtensionContext) {
  let grammars = new Grammars(context);
  let cache: FlagCache | undefined;
  const session = new ConnectionSession(context.workspaceState, context.secrets, context.storageUri?.toString() ?? 'global');
  const sidebar = new UnleashSidebar(context.extensionUri);
  const flagsProvider = new FlagsView(() => [...entries().values()].map(entry => entry.flag), flag => { const entry = entries().get(flag.name); return entry ? assessment(entry) : { status: 'unknown', reason: 'Configuration unavailable.' }; });
  const flagsTree = vscode.window.createTreeView('unleash.flags', { treeDataProvider: flagsProvider, showCollapseAll: false });
  const welcome = new WelcomePage(context.extensionUri, () => ({ url: session.url, connected: !!session.url && !!(session.demo ? suspendedRealCache : cache) && !(session.demo ? suspendedRealCache : cache)?.catalogError, count: (session.demo ? suspendedRealCache : cache)?.entries.size ?? 0 }), connect);
  let selection: { name: string; project: string; source: string; demo: boolean; entry: CachedFlag } | undefined;
  const details = new FlagDetails(context.extensionUri, detailAction);
  let demoSample: string | undefined;
  let suspendedRealCache: FlagCache | undefined;
  let openingDemo = false;
  let connectionEpoch = 0;
  let beforeDemo: { document: vscode.TextDocument; selection: vscode.Selection; viewColumn?: vscode.ViewColumn } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let disposed = false;
  let focused = vscode.window.state.focused;
  let scanGeneration = 0;
  let onDecorateForTest: ((uri: string, count: number) => void) | undefined;
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
    if (!focused) return new Set();
    return new Set([...vscode.window.visibleTextEditors.flatMap(editor => documents.get(editor.document.uri.toString())?.matches.map(m => m.name) ?? []), ...(details.visible && selection && !selection.demo && selection.source === session.url ? [selection.name] : [])]);
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
    flagsProvider.refresh();
    flagsTree.message = flagsProvider.query
      ? `${flagsProvider.allMatches().length} of ${count} flags · Search: ${flagsProvider.query}`
      : cache?.catalogError ? `Unable to refresh: ${cache.catalogError}` : `${count} flags · All accessible projects`;
    updateDetails();
    welcome.update();
    status.show();
  }
  function paint() {
    if (disposed) return;
    for (const editor of vscode.window.visibleTextEditors) {
      const record = documents.get(editor.document.uri.toString());
      // VS Code tracks existing decoration ranges through edits. Keep them until
      // the new document version has been scanned, rather than clearing them
      // during the debounce window. Hover/link providers still reject old offsets.
      if (record && record.version !== editor.document.version) continue;
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
      onDecorateForTest?.(editor.document.uri.toString(), [...groups.values()].reduce((count, group) => count + group.length, 0));
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
      const inScope = session.demo ? key === demoSample : key !== demoSample;
      const matches = grammar && supported && inScope ? findFlags(text, grammar, known) : [];
      if (version !== doc.version) { scheduleScan(); return; }
      documents.set(key, { version, revision, matches, supported });
    }
    paint();
    if (currentCache && currentCache === cache && !session.demo && focused) {
      const browse = flagsTree.visible ? flagsProvider.visibleFlags().filter(flag => { const e = currentCache.entries.get(flag.name); return e && !e.detailed && !e.error; }).map(flag => flag.name) : [];
      await concurrentMap([...new Set([...visibleNames(), ...browse])], name => currentCache === cache && focused ? currentCache.detail(name) : Promise.resolve());
    }
    paint();
  }
  function scheduleScan() {
    clearTimeout(debounce);
    debounce = setTimeout(() => { void scan(); }, 150);
  }
  function changed() { paint(); scheduleScan(); }
  async function refresh() {
    clearTimeout(timer);
    if (!focused || disposed) { paint(); return; }
    const current = cache;
    if (current && !session.demo) {
      await current.refresh(visibleNames);
      if (disposed || current !== cache) return;
      failures = current.catalogError ? Math.min(failures + 1, 4) : 0;
    }
    paint();
    clearTimeout(timer);
    if (focused && cache && !session.demo && !disposed) timer = setTimeout(() => { void refresh(); }, Math.min(interval() * 2 ** failures, 300000));
  }
  async function setFocused(value: boolean) {
    focused = value; clearTimeout(timer);
    if (focused) { await refresh(); scheduleScan(); }
  }
  function replace(next?: FlagCache) {
    clearTimeout(timer); clearTimeout(debounce);
    cache?.dispose(); cache = next;
    documents.clear(); failures = 0; scanGeneration++;
    paint();
  }
  function setup() { welcome.show(); }
  async function connect(input: string, token: string) {
    const url = normalizeUrl(input);
    const saved = await session.savedProfile();
    const credential = token.trim() || saved?.token;
    if (!credential) throw new Error('Enter a Personal Access Token for this instance.');
    const api = new UnleashApi(url, credential);
    const next = new FlagCache(api, () => { if (cache === next) changed(); });
    await next.refresh(() => new Set());
    if (next.catalogError) { next.dispose(); throw new Error(next.catalogError); }
    demoSample = undefined;
    suspendedRealCache?.dispose(); suspendedRealCache = undefined;
    await session.save(url, credential);
    connectionEpoch++;
    replace(next);
    await scan();
    beforeDemo = undefined;
    if (focused) timer = setTimeout(() => { void refresh(); }, interval());
    welcome.update();
  }
  async function startDemo(openSample = true) {
    const editor = vscode.window.activeTextEditor;
    if (!session.demo && editor && editor.document.uri.toString() !== vscode.Uri.joinPath(context.extensionUri, 'samples', 'flags.ts').toString()) beforeDemo = { document: editor.document, selection: editor.selection, viewColumn: editor.viewColumn };
    connectionEpoch++;
    if (!session.demo && cache) { suspendedRealCache = cache; cache = undefined; }
    session.enterDemo();
    const next = new FlagCache(new UnleashApi('https://demo.invalid', ''), changed);
    for (const flag of demoFlags()) next.entries.set(flag.name, { flag, fetchedAt: Date.now(), detailed: true });
    next.revision++;
    replace(next);
    const sample = vscode.Uri.joinPath(context.extensionUri, 'samples', 'flags.ts');
    demoSample = sample.toString();
    if (openSample) {
      openingDemo = true;
      try { await vscode.window.showTextDocument(sample, { preview: false }); }
      finally { openingDemo = false; }
    }
    await scan();
  }
  async function restoreEditor() {
    const previous = beforeDemo; beforeDemo = undefined;
    if (previous && !previous.document.isClosed) await vscode.window.showTextDocument(previous.document, { viewColumn: previous.viewColumn, selection: previous.selection });
  }
  async function returnToInstance(restorePrevious = true, keepDemoTab = false) {
    if (!keepDemoTab) demoSample = undefined;
    const epoch = ++connectionEpoch;
    replace();
    const profile = await session.restore();
    if (epoch !== connectionEpoch || disposed) return;
    if (profile) {
      const next = suspendedRealCache ?? new FlagCache(new UnleashApi(profile.url, profile.token), changed);
      suspendedRealCache = undefined;
      replace(next);
      await refresh();
      await scan();
    } else { paint(); }
    if (restorePrevious && epoch === connectionEpoch) await restoreEditor();
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
  function selectedContent() {
    if (!selection) return;
    const current = selection.demo ? undefined : session.demo ? suspendedRealCache : cache;
    const entry = selection.demo ? selection.entry : current?.entries.get(selection.name);
    if (!selection.demo && (selection.source !== session.url || entry?.flag.project !== selection.project)) return { html: '<h3>Configuration unavailable</h3><p>The flag is no longer in the current connection. Select a flag from the Flags panel.</p>', canOpen: false };
    if (!entry) return;
    const result = selection.demo ? assessFlag(entry.flag) : current?.catalogError || entry.error || Date.now() - entry.fetchedAt > interval() * 2
      ? { status: 'unknown' as const, reason: entry.error ?? current?.catalogError ?? 'Cached configuration is outdated. Refresh to verify the current state.' }
      : assessFlag(entry.flag, session.environment);
    return { html: detailHtml(entry.flag, result, { demo: selection.demo, environment: selection.demo ? undefined : session.environment, fetchedAt: entry.fetchedAt, detailed: entry.detailed }), canOpen: !selection.demo };
  }
  function updateDetails() { const content = selectedContent(); if (content) details.update(content.html, content.canOpen); }
  async function detailAction(type: string) {
    const selected = selection;
    if (!selected) return;
    if (type === 'find') await vscode.commands.executeCommand('workbench.action.findInFiles', { query: selected.name, isRegex: false, isCaseSensitive: true, matchWholeWord: false, triggerSearch: true });
    else if (type === 'copy') await vscode.env.clipboard.writeText(selected.name);
    else if (type === 'open' && !selected.demo && selectedContent()?.canOpen) await vscode.env.openExternal(vscode.Uri.parse(flagUrl(selected.source, { name: selected.name, project: selected.project })));
    else if (type === 'refresh' && !selected.demo && selected.source === session.url) {
      const current = session.demo ? suspendedRealCache : cache;
      await current?.detail(selected.name, true); updateDetails();
    }
  }
  const register = (name: string, fn: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(`unleash.${name}`, async (...args: any[]) => {
    try { return await fn(...args); } catch { void vscode.window.showErrorMessage('Unleash could not complete this action. Check your connection and try again.'); }
  }));
  register('setup', setup);
  register('refresh', async () => { if (!cache) return setup(); await refresh(); });
  register('demo', () => startDemo());
  register('disconnect', disconnect);
  register('exitDemo', () => returnToInstance());
  register('openWelcome', setup);
  register('website', () => vscode.env.openExternal(vscode.Uri.parse('https://getunleash.io')));
  register('repository', () => vscode.env.openExternal(vscode.Uri.parse('https://github.com/nunogois/unleash-vscode')));
  register('moreFlags', () => { flagsProvider.limit += 50; updateStatus(); scheduleScan(); });
  register('inspectFlag', async (value: string | { name: string }) => {
    const name = typeof value === 'string' ? value : value?.name;
    const entry = entries().get(name);
    if (!entry) return;
    const current = cache;
    selection = { name, project: entry.flag.project, source: session.url ?? '', demo: session.demo, entry };
    const content = selectedContent();
    if (content) details.show(name, content.html, content.canOpen);
    if (!selection.demo) await current?.detail(name);
    updateDetails();
  });
  register('searchFlags', async () => {
    const value = await vscode.window.showInputBox({ title: 'Search Unleash flags', prompt: 'Filter by flag name, project or description. Leave blank to show all flags.', value: flagsProvider.query });
    if (value === undefined) return;
    flagsProvider.query = value.trim(); flagsProvider.limit = 50;
    await vscode.commands.executeCommand('setContext', 'unleash.flagSearch', !!flagsProvider.query);
    updateStatus(); scheduleScan();
    await vscode.commands.executeCommand('unleash.flags.focus');
  });
  register('clearFlagSearch', async () => {
    flagsProvider.query = ''; flagsProvider.limit = 50;
    await vscode.commands.executeCommand('setContext', 'unleash.flagSearch', false);
    updateStatus(); scheduleScan();
  });
  register('openFlag', async (value: string | { name: string }) => {
    const name = typeof value === 'string' ? value : value?.name;
    const entry = entries().get(name);
    if (!entry) return;
    if (session.demo) {
      await vscode.window.showTextDocument(vscode.Uri.joinPath(context.extensionUri, 'samples', 'flags.ts'), { preview: false });
    } else if (session.url) await vscode.env.openExternal(vscode.Uri.parse(flagUrl(session.url, entry.flag)));
  });
  async function chooseFlag(value?: string | { name: string }) {
    const name = typeof value === 'string' ? value : value?.name;
    if (name) return entries().get(name)?.flag;
    if (!cache) { setup(); return; }
    const choice = await vscode.window.showQuickPick([...entries().values()].map(({ flag }) => ({ label: flag.name, description: flag.project, detail: flag.description ?? undefined, flag })), { title: 'Unleash flags', placeHolder: 'Search by flag name, project or description', matchOnDescription: true, matchOnDetail: true });
    return choice?.flag;
  }
  register('quickOpen', async () => { const flag = await chooseFlag(); if (flag) await vscode.commands.executeCommand('unleash.inspectFlag', flag.name); });
  register('copyFlagName', async value => { const flag = await chooseFlag(value); if (flag) { await vscode.env.clipboard.writeText(flag.name); void vscode.window.setStatusBarMessage(`Copied ${flag.name}`, 2500); } });
  register('copyFlagReference', async value => { const flag = await chooseFlag(value); if (flag) await vscode.env.clipboard.writeText(session.url && !session.demo ? `${flag.name} — ${flagUrl(session.url, flag)}` : flag.name); });
  register('findFlagUsages', async value => { const flag = await chooseFlag(value); if (flag) await vscode.commands.executeCommand('workbench.action.findInFiles', { query: flag.name, isRegex: false, isCaseSensitive: true, matchWholeWord: false, triggerSearch: true }); });
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
    if (choice) await vscode.commands.executeCommand(choice.command, ...(choice.command === 'workbench.action.openSettings' ? ['@ext:nunogois.unleash-vscode'] : []));
  });
  context.subscriptions.push(
    status, sidebar, welcome, details, flagsProvider, flagsTree, flagsTree.onDidChangeVisibility(scheduleScan), vscode.window.registerTreeDataProvider('unleash.home', sidebar), ...decorationTypes.values(),
    vscode.window.onDidChangeWindowState(state => { void setFocused(state.focused); }),
    vscode.languages.registerCompletionItemProvider('*', { async provideCompletionItems(doc, pos, token, completionContext) {
      if (!cache || (session.demo ? doc.uri.toString() !== demoSample : doc.uri.toString() === demoSample)) return;
      const automatic = completionContext.triggerKind !== vscode.CompletionTriggerKind.Invoke;
      if (automatic && !config().get('automaticCompletions', true)) return;
      const text = doc.getText();
      if (text.length > config().get<number>('maxFileSizeKB', 512) * 1024) return;
      const version = doc.version;
      const completionCache = cache;
      const epoch = connectionEpoch;
      const grammar = await grammars.get(doc.languageId);
      if (cache !== completionCache || epoch !== connectionEpoch || !grammar || token.isCancellationRequested || version !== doc.version) return;
      const span = completionRange(text, doc.offsetAt(pos), grammar);
      if (!span) return;
      const prefix = text.slice(span.start, doc.offsetAt(pos)).toLowerCase();
      const items = [...entries().values()].filter(entry => safeCompletionName(entry.flag.name, span.quote) && (!automatic || entry.flag.name.toLowerCase().startsWith(prefix))).map(entry => {
        const item = new vscode.CompletionItem(entry.flag.name, vscode.CompletionItemKind.Value);
        item.range = new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end));
        item.insertText = entry.flag.name;
        item.detail = `${symbols[assessment(entry).status]} ${entry.flag.project}${entry.flag.stale ? ' · Stale' : ''}`;
        item.documentation = hover({ name: entry.flag.name, start: span.start, end: span.end });
        if (entry.flag.stale) item.tags = [vscode.CompletionItemTag.Deprecated];
        return item;
      });
      return new vscode.CompletionList(items, true);
    } }, ..."\"'`abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.:/"),
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
    vscode.window.tabGroups.onDidChangeTabs(() => {
      if (!demoSample) return;
      const stillOpen = vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === demoSample));
      if (!stillOpen) {
        demoSample = undefined;
        if (session.demo) void vscode.commands.executeCommand('unleash.exitDemo');
      }
    }),
    vscode.window.onDidChangeVisibleTextEditors(scheduleScan),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      scheduleScan();
      if (!demoSample || openingDemo) return;
      const sampleActive = editor?.document.uri.toString() === demoSample;
      if (sampleActive && !session.demo) void startDemo(false);
      else if (!sampleActive && session.demo) void returnToInstance(false, true);
    }),
    vscode.workspace.onDidChangeTextDocument(() => { scheduleScan(); }),
    vscode.workspace.onDidCloseTextDocument(doc => documents.delete(doc.uri.toString())),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('unleash')) { documents.clear(); scheduleScan(); void refresh(); } }),
    vscode.extensions.onDidChange(() => { grammars.dispose(); grammars = new Grammars(context); documents.clear(); scheduleScan(); }),
    { dispose() { disposed = true; scanGeneration++; clearTimeout(timer); clearTimeout(debounce); cache?.dispose(); suspendedRealCache?.dispose(); grammars.dispose(); } }
  );
  if (vscode.workspace.isTrusted) void returnToInstance();
  updateStatus();
  if (!session.url && !context.globalState.get('onboardingShown')) {
    await context.globalState.update('onboardingShown', true);
    if (context.extensionMode !== vscode.ExtensionMode.Test) {
      await vscode.commands.executeCommand('unleash.openWelcome');
    }
  }
  return { ...(context.extensionMode === vscode.ExtensionMode.Test ? { connectForTest: connect, setFocusedForTest: setFocused, observeDecorationsForTest: (callback: typeof onDecorateForTest) => { onDecorateForTest = callback; } } : {}), getKnownFlags: () => flagsProvider.allMatches(), getDetailHtml: () => selectedContent()?.html, isDemo: () => session.demo, getMatches: (uri: string) => documents.get(uri)?.matches ?? [], getFlagStatus: (name: string) => { const entry = entries().get(name); return entry && assessment(entry); } };
}
