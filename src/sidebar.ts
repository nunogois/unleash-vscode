import * as vscode from 'vscode';

export interface SidebarState { demo: boolean; url?: string; connected: boolean; environment?: string; count: number; error?: string }
export class UnleashSidebar implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  constructor(private extensionUri: vscode.Uri) {}
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private state: SidebarState = { demo: false, connected: false, count: 0 };
  update(state: SidebarState) {
    if (JSON.stringify(state) === JSON.stringify(this.state)) return;
    this.state = state; this.changed.fire();
  }
  getTreeItem(item: vscode.TreeItem) { return item; }
  getChildren(): vscode.TreeItem[] {
    const s = this.state;
    if (!s.demo && !s.connected) return [];
    const item = (label: string, icon: string, command?: string, description?: string, tooltip?: string) => {
      const node = new vscode.TreeItem(label); node.iconPath = new vscode.ThemeIcon(icon);
      node.description = description; node.tooltip = tooltip;
      if (command) node.command = { command, title: label };
      return node;
    };
    const brand = item('Unleash', 'globe', 'unleash.website', 'getunleash.io');
    brand.iconPath = { light: vscode.Uri.joinPath(this.extensionUri, 'media', 'unleash-logo-dark.svg'), dark: vscode.Uri.joinPath(this.extensionUri, 'media', 'unleash-logo-light.svg') };
    return [
      brand,
      ...(s.demo ? [
        item('Demo mode', 'beaker', undefined, 'Offline sample flags'),
        item(s.url ? 'Return to my instance' : 'Exit demo', 'debug-stop', 'unleash.exitDemo', s.url ? new URL(s.url).host : 'Back to setup')
      ] : [item(s.error ? 'Connection needs attention' : 'Connected', s.error ? 'warning' : 'plug', 'unleash.setup', s.url ? new URL(s.url).host : undefined, s.error ?? s.url)]),
      item('Environment', 'globe', 'unleash.environment', s.environment ?? 'All'),
      item(`${s.count} flags`, 'flag', 'unleash.flags.focus', s.demo ? 'Demo data' : 'All accessible projects'),
      ...(!s.demo ? [item('Refresh flags', 'refresh', 'unleash.refresh')] : []),
      item('Quick open a flag', 'search', 'unleash.quickOpen'),
      item('Settings and connection', 'gear', 'unleash.menu'),
      item('View on GitHub', 'github', 'unleash.repository')
    ];
  }
  dispose() { this.changed.dispose(); }
}
