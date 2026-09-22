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
      <main><header><img src="${asset('unleash-icon.png')}" width="38" height="38" alt="Unleash"><strong>unleash</strong><span>for VS Code</span></header>
      <section class="intro"><h1>Connect to Unleash</h1><p class="lede">Browse your feature flags and see their status in code.</p></section>
      <section id="success" class="card success" hidden aria-live="polite"><h2>Instance connected</h2><p id="connection"></p><div class="actions"><button data-action="browse">Browse flags</button><button class="secondary" data-action="quickOpen">Find a flag</button></div><button id="change" class="link">Change connection</button></section>
      <div id="setup" class="columns"><section class="card"><form id="connect"><label for="url">Unleash instance URL</label><input id="url" type="url" required placeholder="https://eu.app.getunleash.io/your-instance" autocomplete="url" maxlength="4096">
      <label for="token">Personal access token</label><input id="token" type="password" placeholder="Paste your PAT" autocomplete="off" maxlength="16384" aria-describedby="token-help"><p id="token-help" class="hint">Create a token in your Unleash profile → Personal API tokens.</p>
      <p id="error" role="alert" hidden></p><button id="submit" type="submit">Connect</button><p id="progress" role="status"></p>
      <p class="hint">Stored securely in VS Code. All projects your token can access are included.</p></form></section>
      <aside class="demo"><h2>Explore the extension</h2><p>Try flag highlighting and configuration with sample data.</p><button class="secondary" data-action="demo">Try demo</button></aside></div>
      <footer><nav><button class="link" data-action="website">Unleash website ↗</button><button class="link" data-action="repository">GitHub ↗</button></nav></footer></main>
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
