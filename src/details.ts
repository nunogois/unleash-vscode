import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
export class FlagDetails implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private content = '';
  private canOpen = false;
  constructor(private uri: vscode.Uri, private action: (type: string) => Promise<void>) {}
  get visible() { return this.panel?.visible ?? false; }
  show(name: string, content: string, canOpen: boolean) {
    this.content = content; this.canOpen = canOpen;
    if (this.panel) { this.panel.title = name; this.panel.reveal(); this.send(); return; }
    const panel = this.panel = vscode.window.createWebviewPanel('unleash.flagDetails', name, vscode.ViewColumn.Active, { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.uri, 'media')] });
    panel.iconPath = vscode.Uri.joinPath(this.uri, 'media', 'unleash-icon.png');
    const asset = (name: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(this.uri, 'media', name));
    const nonce = randomBytes(18).toString('base64');
    panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${asset('welcome.css')}"><link rel="stylesheet" href="${asset('details.css')}"><title>Flag configuration</title></head><body><main><div class="actions" aria-label="Flag actions"><button data-action="open" id="open" hidden>Open in Unleash ↗</button><button class="secondary" data-action="find">Find in workspace</button><button class="secondary" data-action="copy">Copy name</button><button class="link" data-action="refresh">Refresh</button></div><article id="content" aria-live="polite"></article></main><script nonce="${nonce}" src="${asset('details.js')}"></script></body></html>`;
    panel.onDidDispose(() => { this.panel = undefined; });
    panel.webview.onDidReceiveMessage(async message => {
      if (message?.type === 'ready') this.send();
      else if (['open', 'find', 'copy', 'refresh'].includes(message?.type)) {
        try { await this.action(message.type); } catch { void vscode.window.showErrorMessage('Could not complete the flag action. Please try again.'); }
      }
    });
  }
  update(content: string, canOpen: boolean) {
    if (content === this.content && canOpen === this.canOpen) return;
    this.content = content; this.canOpen = canOpen; this.send();
  }
  private send() { void this.panel?.webview.postMessage({ content: this.content, canOpen: this.canOpen }); }
  dispose() { this.panel?.dispose(); }
}
