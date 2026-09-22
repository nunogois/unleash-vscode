import * as vscode from 'vscode';
import { Registry, parseRawGrammar, type IGrammar } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';

interface Contribution { scopeName: string; path: string; language?: string; injectTo?: string[] }
export class Grammars implements vscode.Disposable {
  private scopes = new Map<string, { uri: vscode.Uri; contribution: Contribution }>();
  private languages = new Map<string, string>();
  private registry: Registry;
  private loaded = new Map<string, Promise<IGrammar | null>>();
  constructor(context: vscode.ExtensionContext) {
    for (const extension of vscode.extensions.all) {
      for (const grammar of extension.packageJSON.contributes?.grammars ?? [] as Contribution[]) {
        if (typeof grammar.scopeName !== 'string' || typeof grammar.path !== 'string') continue;
        this.scopes.set(grammar.scopeName, { uri: vscode.Uri.joinPath(extension.extensionUri, grammar.path), contribution: grammar });
        if (grammar.language) this.languages.set(grammar.language, grammar.scopeName);
      }
    }
    const wasm = vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'dist', 'onig.wasm')).then(bytes => loadWASM(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
    this.registry = new Registry({
      onigLib: Promise.resolve(wasm).then(() => ({ createOnigScanner: patterns => new OnigScanner(patterns), createOnigString: value => new OnigString(value) })),
      loadGrammar: async scope => {
        const source = this.scopes.get(scope);
        if (!source) return null;
        try { return parseRawGrammar(Buffer.from(await vscode.workspace.fs.readFile(source.uri)).toString('utf8'), source.uri.path); }
        catch { return null; }
      },
      getInjections: scope => [...this.scopes].filter(([, s]) => s.contribution.injectTo?.includes(scope)).map(([name]) => name)
    });
  }
  get(language: string): Promise<IGrammar | null> {
    if (!this.loaded.has(language)) {
      const scope = this.languages.get(language);
      this.loaded.set(language, scope ? this.registry.loadGrammar(scope).catch(() => null) : Promise.resolve(null));
    }
    return this.loaded.get(language)!;
  }
  dispose(): void { this.registry.dispose(); }
}
