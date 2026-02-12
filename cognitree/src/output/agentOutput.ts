import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | null = null;

export function getAgentOutput(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Cognitree");
  }
  return outputChannel;
}
