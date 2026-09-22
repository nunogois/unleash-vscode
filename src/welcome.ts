import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

export interface WelcomeState { url?: string; connected: boolean; count: number }
export class WelcomePage implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private busy = false;
  constructor(private uri: vscode.Uri, private state: () => WelcomeState, private connect: (url: string, token: string) => Promise<void>) {}
  show() {
    if (this.panel) { this.panel.reveal(); this.update(); return; }
    const panel = this.panel = vscode.window.createWebviewPanel('unleash.welcome', 'Welcome to Unleash', vscode.ViewColumn.Active, {
      enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.uri, 'media')]
    });
    panel.iconPath = vscode.Uri.joinPath(this.uri, 'media', 'unleash-icon.png');
    const asset = (name: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(this.uri, 'media', name)).toString();
    const nonce = randomBytes(18).toString('base64');
    panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource}; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';">
      <link rel="stylesheet" href="${asset('welcome.css')}"><title>Welcome to Unleash</title></head><body>
      <main><header><img src="${asset('unleash-icon.png')}" width="48" height="48" alt="Unleash"><span>UNLEASH FOR VS CODE</span></header>
      <section class="intro"><p class="eyebrow">LESS CONTEXT SWITCHING. MORE CLARITY.</p><h1>Your flags.<br>Right where you code.</h1><p class="lede">See what’s enabled, understand who it reaches, and jump straight to its configuration.</p></section>
      <section id="success" class="card success" hidden aria-live="polite"><p class="eyebrow">CONNECTED</p><h2>You’re ready to go.</h2><p id="connection"></p><div class="actions"><button data-action="browse">Browse flags</button><button class="secondary" data-action="quickOpen">Quick open a flag</button></div><p>Open your code and hover a flag-name string to see its configuration.</p><button id="change" class="link">Change connection</button></section>
      <div id="setup" class="columns"><section class="card"><h2>Connect your instance</h2><p>All accessible projects and environments, in one place.</p>
      <form id="connect"><label for="url">Instance URL</label><input id="url" type="url" required placeholder="https://your-instance.getunleash.io" autocomplete="url" maxlength="4096">
      <label for="token">Personal Access Token</label><input id="token" type="password" placeholder="Paste your PAT" autocomplete="off" maxlength="16384" aria-describedby="token-help"><p id="token-help" class="hint">Create a token in your Unleash profile → Personal API tokens.</p>
      <p id="error" role="alert" hidden></p><button id="submit" type="submit">Connect to Unleash</button><p id="progress" role="status"></p>
      <p class="hint">Your token stays in VS Code’s encrypted storage. This extension only reads configuration.</p></form></section>
      <aside class="card demo"><span class="pill">NO ACCOUNT NEEDED</span><h2>Take a quick tour</h2><p>Explore real code with sample flags. Hover a name to see its rollout, environments and targeting.</p><div class="lights"><span>🟢 Everyone</span><span>🟡 Targeted</span><span>🔴 Disabled</span></div><button class="secondary" data-action="demo">Try the offline demo</button><p class="hint">Demo follows its sample tab. Switch to your own code to resume your instance.</p></aside></div>
      <section class="tips"><article><h3>Understand a flag</h3><p>Hover a complete flag-name string for a readable summary across environments.</p></article><article><h3>Find it faster</h3><p>Search the Flags panel, or run <strong>Unleash: Quick Open Flag</strong> from the Command Palette.</p></article><article><h3>Stay in flow</h3><p>Right-click a flag in the panel to copy its name or find its uses in your workspace.</p></article></section>
      <footer><span>Independent community extension by Nuno Góis</span><nav><button class="link" data-action="website">Unleash website ↗</button><button class="link" data-action="repository">GitHub ↗</button></nav></footer></main>
      <script nonce="${nonce}" src="${asset('welcome.js')}"></script></body></html>`;
    panel.onDidDispose(() => { if (this.panel === panel) this.panel = undefined; });
    panel.webview.onDidReceiveMessage(async message => {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'ready') { this.update(); return; }
      if (message.type === 'connect') {
        if (this.busy || typeof message.url !== 'string' || typeof message.token !== 'string' || message.url.length > 4096 || message.token.length > 16384) return;
        this.busy = true;
        try { await this.connect(message.url, message.token); void this.panel?.webview.postMessage({ type: 'connected', ...this.state() }); }
        catch (error) { void this.panel?.webview.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Could not connect. Please try again.' }); }
        finally { this.busy = false; void this.panel?.webview.postMessage({ type: 'idle' }); }
        return;
      }
      const commands: Record<string, string> = { demo: 'unleash.demo', browse: 'unleash.flags.focus', quickOpen: 'unleash.quickOpen', website: 'unleash.website', repository: 'unleash.repository' };
      if (Object.hasOwn(commands, message.type)) await vscode.commands.executeCommand(commands[message.type]);
    });
  }
  update() { void this.panel?.webview.postMessage({ type: 'state', busy: this.busy, ...this.state() }); }
  dispose() { this.panel?.dispose(); }
}
