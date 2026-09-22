import * as vscode from 'vscode';
import { labels, type Assessment, type Flag } from './model';
import { filterFlags } from './flag-list';

export class FlagsView implements vscode.TreeDataProvider<Flag | { more: true }>, vscode.Disposable {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  limit = 50;
  query = '';
  constructor(private flags: () => Iterable<Flag>, private assess: (flag: Flag) => Assessment) {}
  refresh() { this.changed.fire(); }
  allMatches() { return filterFlags(this.flags(), this.query); }
  visibleFlags() { return this.allMatches().slice(0, this.limit); }
  getChildren(): (Flag | { more: true })[] { const flags = this.visibleFlags(); return this.allMatches().length > flags.length ? [...flags, { more: true }] : flags; }
  getTreeItem(flag: Flag | { more: true }) {
    if ('more' in flag) { const item = new vscode.TreeItem('Show more flags'); item.command = { command: 'unleash.moreFlags', title: 'Show more flags' }; item.iconPath = new vscode.ThemeIcon('more'); return item; }
    const status = this.assess(flag);
    const item = new vscode.TreeItem(flag.name);
    item.contextValue = 'unleashFlag';
    item.id = `${flag.project}/${flag.name}`;
    item.description = `${flag.project} · ${labels[status.status]}`;
    item.iconPath = new vscode.ThemeIcon(status.status === 'unknown' ? 'circle-outline' : 'circle-filled', new vscode.ThemeColor(`unleash.${status.status}`));
    item.tooltip = `${flag.name}\n${labels[status.status]} — ${status.reason}\nProject: ${flag.project}${flag.description ? `\n\n${flag.description}` : ''}`;
    item.command = { command: 'unleash.inspectFlag', title: 'View flag configuration', arguments: [flag.name] };
    return item;
  }
  dispose() { this.changed.dispose(); }
}
