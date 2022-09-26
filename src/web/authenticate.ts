import * as vscode from "vscode";

export const authenticate = () => {
  vscode.window
    .showInputBox({
      prompt: "Enter your Unleash URL",
      value: vscode.workspace.getConfiguration("unleash-vscode").get("url"),
    })
    .then((unleashUrl) => {
      vscode.workspace
        .getConfiguration("unleash-vscode")
        .update("url", unleashUrl, true);
      if (unleashUrl) {
        vscode.window
          .showInputBox({
            prompt: "Enter your Unleash API token",
            value: vscode.workspace
              .getConfiguration("unleash-vscode")
              .get("token"),
          })
          .then((apiKey) => {
            vscode.workspace
              .getConfiguration("unleash-vscode")
              .update("token", apiKey, true);
          });
      }
    });
};
