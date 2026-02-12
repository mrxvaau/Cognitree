import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("Cognitree activated");

  const startCmd = vscode.commands.registerCommand(
    "cognitree.start",
    () => {
      vscode.window.showInformationMessage("Cognitree started");
    }
  );

  const sendCmd = vscode.commands.registerCommand(
    "cognitree.send",
    async () => {
      const input = await vscode.window.showInputBox({
        prompt: "Send a message to Cognitree"
      });
      if (input) {
        vscode.window.showInformationMessage(`You said: ${input}`);
      }
    }
  );

  const stopCmd = vscode.commands.registerCommand(
    "cognitree.stop",
    () => {
      vscode.window.showInformationMessage("Cognitree stopped");
    }
  );

  context.subscriptions.push(startCmd, sendCmd, stopCmd);
}

export function deactivate() {}
