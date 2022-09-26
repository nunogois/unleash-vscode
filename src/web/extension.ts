// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import fetch from "node-fetch";
// import axios from "axios";
// import { SidebarProvider } from "./SidebarProvider";
import { authenticate } from "./authenticate";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("sup");

  const UNLEASH_URL = vscode.workspace
    .getConfiguration("unleash-vscode")
    .get<string>("url");
  const UNLEASH_TOKEN = vscode.workspace
    .getConfiguration("unleash-vscode")
    .get<string>("token");

  // Sidebar
  // const sidebarProvider = new SidebarProvider(context.extensionUri);
  // context.subscriptions.push(
  //   vscode.window.registerWebviewViewProvider(
  //     "vsinder-sidebar",
  //     sidebarProvider
  //   )
  // );

  let toggles: any[] = [];

  (async () => {
    if (UNLEASH_URL && UNLEASH_TOKEN) {
      try {
        const response = await fetch(
          "https://unleash.nunogois.com/api/admin/features"
        );
        toggles = (await response.json()) as any[];
      } catch (error) {
        console.log(error);
      }
      console.log(toggles);
      const provider = vscode.languages.registerCompletionItemProvider("*", {
        provideCompletionItems(document, position) {
          return toggles.map(
            (toggle: any) => new vscode.CompletionItem(toggle.name)
          );
        },
      });
      context.subscriptions.push(provider);
    }
  })();

  // Autocomplete
  // if (UNLEASH_URL && UNLEASH_TOKEN) {
  //   fetch(`https://unleash.nunogois.com/api/admin/features`)
  //     .then((res) => {
  //       console.log(res);
  //     })
  //     // .then((toggles) => {
  //     //   console.log(toggles);
  //     //   const provider = vscode.languages.registerCompletionItemProvider("*", {
  //     //     provideCompletionItems(document, position) {
  //     //       return toggles.map(
  //     //         (toggle: any) => new vscode.CompletionItem(toggle.name)
  //     //       );
  //     //     },
  //     //   });
  //     //   context.subscriptions.push(provider);
  //     // })
  //     .catch((err) => {
  //       console.log(err);
  //     });
  // }

  // Authentication
  context.subscriptions.push(
    vscode.commands.registerCommand("unleash-vscode.authenticate", () => {
      authenticate();
    })
  );

  // Reload
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "unleash-vscode.reloadSidebar",
      async () => {
        await vscode.commands.executeCommand("workbench.action.closeSidebar");
        await vscode.commands.executeCommand(
          "workbench.view.extension.unleash-vscode-sidebar-view"
        );
        setTimeout(() => {
          vscode.commands.executeCommand(
            "workbench.action.webview.openDeveloperTools"
          );
        }, 500);
      }
    )
  );
}

export function deactivate() {}
