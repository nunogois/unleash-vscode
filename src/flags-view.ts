import * as vscode from 'vscode';
import type { Flag } from './model';
import { filterFlags } from './flag-list';

export class FlagsView implements vscode.TreeDataProvider<Flag>, vscode.Disposable {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  query = '';
  constructor(private flags: () => Iterable<Flag>) {}
  refresh() { this.changed.fire(); }
  getChildren() { return filterFlags(this.flags(), this.query); }
  getTreeItem(flag: Flag) {
    const item = new vscode.TreeItem(flag.name);
    item.contextValue = 'unleashFlag';
    item.id = `${flag.project}/${flag.name}`;
    item.description = flag.project;
    item.iconPath = new vscode.ThemeIcon('flag');
    item.tooltip = `${flag.name}\nProject: ${flag.project}${flag.description ? `\n\n${flag.description}` : ''}`;
    item.command = { command: 'unleash.openFlag', title: 'Open flag in Unleash', arguments: [flag.name] };
    return item;
  }
  dispose() { this.changed.dispose(); }
}
